// Cense Loan Desk — repayment math. Created with Claude Code.

import {
  CUTOFF,
  Loan,
  PlanEstimate,
  PlanId,
  Profile,
  PslfStatus,
  RankedPlan,
} from "@/types";
import {
  EXTENDED_MIN_BALANCE,
  LEGACY_PLANS,
  PARENT_PLUS_EXCLUDED_PLANS,
  PARENT_PLUS_INELIGIBLE_REASON,
  PLAN_META,
  PLAN_ORDER,
  POST_CUTOFF_PLANS,
  RAP_DEPENDENT_CREDIT,
  RAP_MIN_MONTHLY,
  TIERED_STANDARD_MIN_PAYMENT,
  getPovertyLine,
  getTieredStandardYears,
  rapAnnualBasePayment,
} from "@/data/plans";

export function totalBalance(loans: Loan[]): number {
  return loans.reduce((s, l) => s + (l.balance || 0), 0);
}

export function totalPrincipal(loans: Loan[]): number {
  return loans.reduce((s, l) => s + (l.principal || 0), 0);
}

/** Balance-weighted average rate, as a percentage. */
export function weightedRate(loans: Loan[]): number {
  const bal = totalBalance(loans);
  if (bal <= 0) return 0;
  return loans.reduce((s, l) => s + l.balance * l.rate, 0) / bal;
}

/** True when this loan alone reclassifies the portfolio under the new rules. */
export function isPostCutoff(loan: Loan): boolean {
  return !!loan.disbursementDate && loan.disbursementDate >= CUTOFF;
}

export function anyPostCutoff(loans: Loan[]): boolean {
  return loans.some(isPostCutoff);
}

/**
 * True when any loan is a Parent PLUS loan, which closes IBR and RAP to it
 * under 34 CFR 685.209(d)(2) and (d)(4). See PARENT_PLUS_EXCLUDED_PLANS.
 */
export function anyParentPlus(loans: Loan[]): boolean {
  return loans.some((l) => l.kind === "parent_plus");
}

/** Standard amortised monthly payment. Handles the 0% edge case. */
export function amortizedPayment(
  balance: number,
  annualRatePct: number,
  years: number
): number {
  if (balance <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return balance / n;
  const pow = Math.pow(1 + r, n);
  return (balance * r * pow) / (pow - 1);
}

function fixedTotals(balance: number, ratePct: number, years: number) {
  const monthly = amortizedPayment(balance, ratePct, years);
  const totalPaid = monthly * years * 12;
  return {
    monthlyPayment: monthly,
    totalPaid,
    totalInterest: Math.max(0, totalPaid - balance),
  };
}

/**
 * Graduated: starts low and steps up every 2 years over 10.
 * Modelled as a starting payment near interest-only with five step-ups, with
 * the growth factor solved numerically so the schedule actually amortises.
 */
function graduatedTotals(balance: number, ratePct: number) {
  const r = ratePct / 100 / 12;
  const steps = 5;
  const monthsPerStep = 24;

  const remainingAfter = (base: number, g: number) => {
    let bal = balance;
    for (let s = 0; s < steps; s++) {
      const pay = base * Math.pow(g, s);
      for (let m = 0; m < monthsPerStep; m++) {
        bal = bal * (1 + r) - pay;
        if (bal <= 0) return 0;
      }
    }
    return bal;
  };

  const base = Math.max(balance * r, 25);
  let lo = 1.0;
  let hi = 2.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (remainingAfter(base, mid) > 0) lo = mid;
    else hi = mid;
  }
  const g = hi;

  let bal = balance;
  let totalPaid = 0;
  for (let s = 0; s < steps && bal > 0; s++) {
    const pay = base * Math.pow(g, s);
    for (let m = 0; m < monthsPerStep && bal > 0; m++) {
      const interest = bal * r;
      const applied = Math.min(pay, bal + interest);
      bal = bal + interest - applied;
      totalPaid += applied;
    }
  }
  return {
    monthlyPayment: base, // the starting payment, which is what people plan around
    finalPayment: base * Math.pow(g, steps - 1),
    totalPaid,
    totalInterest: Math.max(0, totalPaid - balance),
  };
}

/**
 * Simulate an income-driven plan at a flat income.
 *
 * Deliberately conservative: income is held constant, the same assumption the
 * federal Loan Simulator makes, and the UI says so. Modelling raises would
 * produce a friendlier number we could not defend.
 */
function simulateIdr(
  balance: number,
  ratePct: number,
  monthlyPayment: number,
  maxYears: number,
  opts: { waiveUnpaidInterest: boolean; matchPrincipal: boolean }
) {
  const r = ratePct / 100 / 12;
  let bal = balance;
  let totalPaid = 0;
  const maxMonths = maxYears * 12;
  let months = 0;

  if (!opts.waiveUnpaidInterest) {
    // IBR: interest accrues in full (the three-year subsidy for subsidized
    // loans, 685.209(h)(2)(i), is not modelled), but while the borrower stays
    // on IBR the unpaid part is not capitalized (34 CFR 685.209(j)(2),
    // 685.202(b)).
    // It sits beside principal and earns no interest, and each payment goes
    // to accrued interest first (685.211(a)(1)(ii)).
    let principal = balance;
    let unpaid = 0;
    for (let m = 0; m < maxMonths; m++) {
      if (principal + unpaid <= 0.005) break;
      unpaid += principal * r;
      const pay = Math.min(monthlyPayment, principal + unpaid);
      const toInterest = Math.min(pay, unpaid);
      unpaid -= toInterest;
      // Same order of operations as the loop below, so wherever the payment
      // covers the interest IBR computes exactly what it did before.
      principal = principal + toInterest - pay;
      totalPaid += pay;
      months++;
    }
    const left = principal + unpaid;
    return {
      totalPaid,
      forgiven: Math.max(0, left),
      months,
      paidOff: left <= 0.005,
    };
  }

  for (let m = 0; m < maxMonths; m++) {
    if (bal <= 0.005) break;
    const interest = bal * r;
    let pay = Math.min(monthlyPayment, bal + interest);

    // 34 CFR 685.209(h)(4)(i), verbatim: under RAP "the Secretary does not
    // charge the borrower's account for any accrued interest that is not
    // covered by the borrower's on-time payment of the amount due for that
    // month." So the charge is capped at the payment; the shortfall is waived,
    // NOT credited to principal. (IBR returns above.)
    const interestCharged = Math.min(interest, pay);
    bal = bal + interestCharged - pay;

    // RAP's matching principal payment. 34 CFR 685.209(o)(2)(i): when an
    // on-time payment reduces principal by less than $50, ED reduces principal
    // by (the lesser of $50 or the payment) minus (what already hit principal).
    const principalReduction = Math.max(0, pay - interestCharged);
    if (opts.matchPrincipal && principalReduction < 50) {
      bal -= Math.min(50, pay) - principalReduction;
    }

    if (bal < 0) {
      pay += bal;
      bal = 0;
    }
    totalPaid += pay;
    months++;
  }

  return {
    totalPaid,
    forgiven: Math.max(0, bal),
    months,
    paidOff: bal <= 0.005,
  };
}

function ibrMonthly(profile: Profile): number {
  // IBR's family size counts the spouse of a borrower filing jointly
  // (34 CFR 685.209(b)(9)(i)(B)). householdSize is you plus your dependents.
  const familySize =
    (profile.householdSize || 1) + (profile.filesJointly ? 1 : 0);
  const discretionary = Math.max(
    0,
    profile.income - 1.5 * getPovertyLine(familySize)
  );
  return (discretionary * 0.1) / 12;
}

function rapMonthly(profile: Profile): number {
  const base = rapAnnualBasePayment(profile.income) / 12;
  // Tax dependents only (685.209(b)(3)). A spouse is never one, so a joint
  // filer's spouse takes nothing off here.
  const dependents = Math.max(0, (profile.householdSize || 1) - 1);
  return Math.max(RAP_MIN_MONTHLY, base - dependents * RAP_DEPENDENT_CREDIT);
}

/**
 * This borrower's share of the couple's eligible loans. On a joint return the
 * payment is priced on combined income, so 34 CFR 685.209(g)(1)(i) (IBR) and
 * (g)(3)(i)(A) (RAP) multiply it by this share. 1 when the spouse owes nothing.
 */
function jointShare(balance: number, profile: Profile): number {
  const spouse = profile.filesJointly
    ? Math.max(0, profile.spouseLoanBalance || 0)
    : 0;
  return spouse > 0 && balance > 0 ? balance / (balance + spouse) : 1;
}

export interface PlanContext {
  loans: Loan[];
  profile: Profile;
  hasIncome: boolean;
  postCutoff: boolean;
  /** Any Parent PLUS loan in the portfolio. Closes IBR and RAP. */
  parentPlus: boolean;
  balance: number;
  rate: number;
  /** The 10-year Standard payment. The statutory yardstick for PSLF credit. */
  pslfBenchmark: number;
  publicService: boolean;
}

export function buildContext(loans: Loan[], profile: Profile): PlanContext {
  const balance = totalBalance(loans);
  const rate = weightedRate(loans);
  return {
    loans,
    profile,
    hasIncome: profile.income > 0 || profile.incomeKnown === true,
    postCutoff: anyPostCutoff(loans),
    parentPlus: anyParentPlus(loans),
    balance,
    rate,
    pslfBenchmark: amortizedPayment(balance, rate, 10),
    publicService:
      profile.employment === "government" || profile.employment === "nonprofit",
  };
}

/**
 * Decide PSLF credit for a legacy fixed-payment plan (Graduated, Extended).
 *
 * 34 CFR 685.219(b)(28)(iii): a plan other than the alternative plan counts
 * when "the monthly payment amount is not less than what will have been paid
 * under the 10-year standard repayment plan under § 685.208(b)". For these two
 * plans the comparison is meaningful, because a pre-July-2026 borrower is
 * eligible for the 685.208(b) Standard plan, so the benchmark actually exists.
 *
 * This helper must NOT be used for Tiered Standard. See the note there.
 */
function pslfForFixedPlan(
  monthly: number,
  benchmark: number,
  planName: string
): { status: PslfStatus; note: string } {
  if (benchmark <= 0) {
    return { status: "does_not_count", note: "Add your loans to check this." };
  }
  // A dollar of slack absorbs rounding between the two amortisations.
  if (monthly >= benchmark - 1) {
    return {
      status: "counts",
      note: `Your payment here is at least the 10-year Standard amount, so these months count toward Public Service Loan Forgiveness.`,
    };
  }
  return {
    status: "does_not_count",
    note: `Payments on ${planName} are below the 10-year Standard amount, so these months earn no Public Service Loan Forgiveness credit.`,
  };
}

export function estimatePlans(ctx: PlanContext): PlanEstimate[] {
  const { balance, rate, profile, postCutoff, hasIncome, pslfBenchmark } = ctx;
  const available: PlanId[] = postCutoff ? POST_CUTOFF_PLANS : LEGACY_PLANS;

  const build = (id: PlanId): PlanEstimate => {
    const meta = PLAN_META[id];
    const base = {
      id,
      name: meta.name,
      forgivenessYears: meta.forgivenessYears,
    };

    if (!available.includes(id)) {
      return {
        ...base,
        eligible: false,
        monthlyPayment: null,
        totalPaid: null,
        totalInterest: null,
        years: 0,
        forgivenAmount: 0,
        pslf: "does_not_count",
        pslfNote: "",
        ineligibleReason: postCutoff
          ? "Closed because one of your loans was disbursed on or after July 1, 2026"
          : // 685.208(b)(8) and (c)(1) both require a loan made on or after
            // July 1, 2026. The old wording ("only available once...") read
            // like a plan to wait for, and hid that the cutoff is one-way.
            "Only for borrowers with a loan paid out on or after July 1, 2026. Every loan you entered is older, so you keep the original Standard plan instead.",
      };
    }

    // Parent PLUS loans are outside the IBR and RAP loan lists in 34 CFR
    // 685.209(d)(2) and (d)(4), whenever they were made. The whole entered
    // portfolio is modeled on one plan, so a single Parent PLUS loan closes
    // both here. Any student loans alongside it can still use them, repaid
    // separately under 685.210(a)(3)(i) and (iii)(A); the UI says so.
    if (ctx.parentPlus && PARENT_PLUS_EXCLUDED_PLANS.includes(id)) {
      return {
        ...base,
        eligible: false,
        monthlyPayment: null,
        totalPaid: null,
        totalInterest: null,
        years: 0,
        forgivenAmount: 0,
        pslf: "does_not_count",
        pslfNote: "",
        ineligibleReason: PARENT_PLUS_INELIGIBLE_REASON,
      };
    }

    // 34 CFR 685.208(b)(4)(i): more than $30,000. The balance is an unrounded
    // float sum, so compare whole cents.
    if (id === "extended" && Math.round(balance * 100) <= EXTENDED_MIN_BALANCE * 100) {
      return {
        ...base,
        eligible: false,
        monthlyPayment: null,
        totalPaid: null,
        totalInterest: null,
        years: 25,
        forgivenAmount: 0,
        pslf: "does_not_count",
        pslfNote: "",
        ineligibleReason: "Requires more than $30,000 in Direct Loans",
      };
    }

    // ---- Fixed plans -------------------------------------------------
    if (id === "standard") {
      const t = fixedTotals(balance, rate, 10);
      return {
        ...base,
        eligible: true,
        years: 10,
        forgivenAmount: 0,
        pslf: "counts",
        pslfNote:
          "The 10-year Standard plan always counts toward Public Service Loan Forgiveness.",
        ...t,
      };
    }

    if (id === "graduated") {
      const t = graduatedTotals(balance, rate);
      // Payments start below the benchmark and rise past it, so credit is
      // genuinely partial rather than all-or-nothing.
      const endsAbove = t.finalPayment >= pslfBenchmark - 1;
      return {
        ...base,
        eligible: true,
        years: 10,
        forgivenAmount: 0,
        monthlyPayment: t.monthlyPayment,
        totalPaid: t.totalPaid,
        totalInterest: t.totalInterest,
        pslf: endsAbove ? "partial" : "does_not_count",
        pslfNote: endsAbove
          ? "Graduated starts below the 10-year Standard payment and steps above it later. Only the later, larger payments count toward forgiveness."
          : "Graduated payments stay below the 10-year Standard amount, so they earn no forgiveness credit.",
      };
    }

    if (id === "extended") {
      const t = fixedTotals(balance, rate, 25);
      const p = pslfForFixedPlan(t.monthlyPayment, pslfBenchmark, "Extended");
      return {
        ...base,
        eligible: true,
        years: 25,
        forgivenAmount: 0,
        pslf: p.status,
        pslfNote: p.note,
        ...t,
      };
    }

    if (id === "tiered_standard") {
      const years = getTieredStandardYears(balance);
      const t = fixedTotals(balance, rate, years);
      const monthly = Math.max(t.monthlyPayment, TIERED_STANDARD_MIN_PAYMENT);
      // Tiered Standard NEVER earns PSLF credit, including the 10-year tier.
      //
      // It is absent from the qualifying-plan list in 685.219(b)(28)(ii), which
      // pulls only the consolidation plan out of 685.208(c). And the catch-all
      // in (iii) cannot reach it: that clause benchmarks against "the 10-year
      // standard repayment plan under § 685.208(b)", and 685.208(b)(1) is
      // limited to borrowers "who have not received a Direct Loan on or after
      // July 1, 2026" — the exact opposite of who is on Tiered Standard. The
      // two populations are mutually exclusive, so the benchmark does not exist
      // for these borrowers and there is nothing for (iii) to compare.
      //
      // The 10-year tier is the trap: its payment equals what the old Standard
      // plan would have charged, so it looks equivalent. It is not.
      return {
        ...base,
        eligible: true,
        years,
        forgivenAmount: 0,
        monthlyPayment: monthly,
        totalPaid: t.totalPaid,
        totalInterest: t.totalInterest,
        pslf: "does_not_count",
        pslfNote:
          "Tiered Standard earns no Public Service Loan Forgiveness credit, in any tier. You can pay on time for years and move zero months closer to forgiveness.",
      };
    }

    // ---- Income-driven plans ----------------------------------------
    // Always qualify for PSLF under 685.219(b)(28)(i) and (v), including $0.
    if (!hasIncome) {
      return {
        ...base,
        eligible: true,
        monthlyPayment: null,
        totalPaid: null,
        totalInterest: null,
        years: id === "rap" ? 30 : 20,
        forgivenAmount: 0,
        pslf: "counts",
        pslfNote:
          "Income-driven plans always count toward Public Service Loan Forgiveness, even a $0 payment.",
      };
    }

    if (id === "ibr") {
      const cap = amortizedPayment(balance, rate, 10);
      // The share comes before the cap: never lower than the literal
      // cap-then-share reading, and equal to it whenever the cap does not bind.
      const pay = Math.min(
        ibrMonthly(profile) * jointShare(balance, profile),
        cap
      );
      const sim = simulateIdr(balance, rate, pay, 20, {
        waiveUnpaidInterest: false,
        matchPrincipal: false,
      });
      return {
        ...base,
        eligible: true,
        monthlyPayment: pay,
        totalPaid: sim.totalPaid,
        totalInterest: Math.max(0, sim.totalPaid - (balance - sim.forgiven)),
        years: sim.paidOff ? sim.months / 12 : 20,
        forgivenAmount: sim.forgiven,
        pslf: "counts",
        pslfNote:
          "IBR always counts toward Public Service Loan Forgiveness, even a $0 payment.",
      };
    }

    // The $10 floor applies after the spouse share (685.209(g)(3)(i)(B)).
    const pay = Math.max(
      RAP_MIN_MONTHLY,
      rapMonthly(profile) * jointShare(balance, profile)
    );
    const sim = simulateIdr(balance, rate, pay, 30, {
      waiveUnpaidInterest: true,
      matchPrincipal: true,
    });
    return {
      ...base,
      eligible: true,
      monthlyPayment: pay,
      totalPaid: sim.totalPaid,
      totalInterest: Math.max(0, sim.totalPaid - (balance - sim.forgiven)),
      years: sim.paidOff ? sim.months / 12 : 30,
      forgivenAmount: sim.forgiven,
      pslf: "counts",
      pslfNote:
        "RAP always counts toward Public Service Loan Forgiveness, even at the $10 minimum.",
    };
  };

  return PLAN_ORDER.map(build);
}

// ---------------------------------------------------------------- ranking

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Order the plans for display and explain every one of them.
 *
 * The top pick comes first. Crucially, every other eligible plan carries the
 * reason it was not chosen, so the borrower can disagree with us on the merits
 * rather than having to take the recommendation on faith.
 */
export function rankPlans(
  estimates: PlanEstimate[],
  ctx: PlanContext
): { ranked: RankedPlan[]; topPickReason: string } {
  const eligible = estimates.filter(
    (e) => e.eligible && e.monthlyPayment !== null
  );

  if (!eligible.length) {
    return {
      ranked: estimates.map((e) => ({
        estimate: e,
        isTopPick: false,
        isLowestPayment: false,
        isLowestInterest: false,
        whyNot: "",
      })),
      topPickReason: "",
    };
  }

  const lowestPayment = eligible.reduce((a, b) =>
    (a.monthlyPayment ?? Infinity) <= (b.monthlyPayment ?? Infinity) ? a : b
  );
  const lowestInterest = eligible.reduce((a, b) =>
    (a.totalInterest ?? Infinity) <= (b.totalInterest ?? Infinity) ? a : b
  );

  const { goal } = ctx.profile;
  const pslfOk = (e: PlanEstimate) => e.pslf === "counts";

  // Open plans we cannot price yet: IBR and RAP while income is blank. At
  // zero income IBR is $0 and RAP $10 (34 CFR 685.209(b)(4), (f)(2)(i),
  // (g)(3)(ii)), so no pick may claim a minimum over them. Names come from
  // the estimates, so a closed plan is never named.
  const unpriced = estimates.filter(
    (e) => e.eligible && e.monthlyPayment === null
  );
  const unpricedNames = unpriced.map((e) => e.name).join(" and ");
  const scope = unpriced.length ? "we can price" : "open to you";
  const ibrUnpriced = unpriced.some((e) => e.id === "ibr");
  const rapUnpriced = unpriced.some((e) => e.id === "rap");
  const floors =
    ibrUnpriced && rapUnpriced
      ? `IBR can be $0 a month and RAP $${RAP_MIN_MONTHLY}`
      : ibrUnpriced
        ? "IBR can be $0 a month"
        : `RAP can be as little as $${RAP_MIN_MONTHLY} a month`;
  const notEarning = `Not earning right now? ${floors}.`;
  const addIncome = unpriced.length
    ? ` ${unpricedNames} could cost less, so add your income. ${notEarning}`
    : "";

  let top: PlanEstimate;
  let reason: string;

  if (goal === "forgiveness" || (ctx.publicService && goal === "unsure")) {
    const qualifying = eligible.filter(pslfOk);
    const unpricedCredit = unpriced.filter(pslfOk);
    if (qualifying.length) {
      top = qualifying.reduce((a, b) =>
        (a.monthlyPayment ?? Infinity) <= (b.monthlyPayment ?? Infinity) ? a : b
      );
      // IBR's payment is the lesser of its formula and the 10-year Standard
      // amount (34 CFR 685.209(f)(2)), so it never costs more than Standard at
      // any income. Say so rather than imply it could not be compared.
      const creditNames = unpricedCredit.map((e) => e.name).join(" and ");
      const waiting = unpricedCredit.some((e) => e.id === "ibr")
        ? `${creditNames} earn it too. IBR never costs more than the 10-year Standard payment and is likely lower, so add your income.`
        : `${creditNames} earn it too and could cost less, so add your income.`;
      reason = unpricedCredit.length
        ? `Of the plans we can price, this is the lowest payment that earns forgiveness credit. ${waiting} ${notEarning}`
        : ctx.publicService
          ? "You work in public service and want forgiveness on the table, so this is the lowest payment among the plans that actually earn Public Service Loan Forgiveness credit. After 120 qualifying payments the rest is cancelled, tax free."
          : "This is the lowest payment among the plans that earn forgiveness credit. Outside public service, a forgiven balance is taxed as income in the year it is cancelled.";
    } else if (unpricedCredit.length) {
      // Only a plan priced off income earns credit (RAP after the 2026
      // cutoff). Pick it and ask for income, rather than a plan that never
      // counts.
      top = unpricedCredit[0];
      reason = `${top.name} is the plan open to you that earns forgiveness credit, and it is priced off your income. Add yours and we will work out the payment. ${notEarning}`;
    } else {
      top = lowestInterest;
      reason =
        "None of the plans open to you earn forgiveness credit, so this is the one that costs you the least overall.";
    }
  } else if (goal === "lowest_payment") {
    top = lowestPayment;
    reason =
      top.id === "graduated"
        ? `You said the monthly number matters most, and this starts smaller than anything else ${scope}. Be careful with it though: Graduated is the one plan whose payment climbs, stepping up every two years, so the figure above is only what you pay at the start.${addIncome}`
        : `You said the monthly number matters most, and this is the smallest payment of the plans ${scope}.${addIncome}`;
  } else {
    // least_total, and the default for "unsure"
    top = lowestInterest;
    reason =
      goal === "unsure"
        ? `You have not told us a goal yet, so we are recommending on total cost, which is the safe default. ${unpriced.length ? "Of the plans we can price, this one" : "This plan"} hands over the least money overall.${addIncome}`
        : `You want to pay the least overall, and ${unpriced.length ? "of the plans we can price, this one" : "this plan"} costs you the least in total interest.${addIncome}`;
  }

  const whyNotFor = (e: PlanEstimate): string => {
    if (e.id === top.id) return "";
    if (!e.eligible) return "";
    if (e.monthlyPayment === null) return "Add your income to compare this one.";
    // An unpriced pick has no figures to compare. It was picked because it
    // earns forgiveness credit and no priced plan does.
    if (top.monthlyPayment === null) {
      return e.pslf === "partial"
        ? "Not picked because it only earns forgiveness credit on some months."
        : "Not picked because it earns no forgiveness credit.";
    }

    const parts: string[] = [];
    const dMonthly = (e.monthlyPayment ?? 0) - (top.monthlyPayment ?? 0);
    const dInterest = (e.totalInterest ?? 0) - (top.totalInterest ?? 0);

    // Each fragment has to read as a verb phrase after "because it".
    if (ctx.publicService && !pslfOk(e) && pslfOk(top)) {
      parts.push(
        e.pslf === "partial"
          ? "only earns forgiveness credit on some months"
          : "earns no forgiveness credit"
      );
    }
    if (dMonthly > 1) {
      parts.push(
        top.id === "graduated"
          ? `costs ${money(dMonthly)} more a month than that plan's starting payment`
          : `costs ${money(dMonthly)} more a month`
      );
    }
    if (dInterest > 1) parts.push(`costs ${money(dInterest)} more overall`);
    if (dMonthly < -1 && dInterest > 1) {
      parts.push("buys a smaller payment now by charging you more in the end");
    }

    if (!parts.length) {
      return "Close to the top pick on every measure. If you prefer it, it is a defensible choice.";
    }

    const joined =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    return `Not picked because it ${joined}.`;
  };

  const ranked: RankedPlan[] = estimates
    .map((e) => ({
      estimate: e,
      isTopPick: e.id === top.id,
      // No "lowest" or "least" badge while an open plan has no price.
      isLowestPayment: !unpriced.length && e.id === lowestPayment.id,
      isLowestInterest: !unpriced.length && e.id === lowestInterest.id,
      whyNot: whyNotFor(e),
    }))
    .sort((a, b) => {
      // Top pick first, then the rest of the eligible plans, then ineligible.
      if (a.isTopPick !== b.isTopPick) return a.isTopPick ? -1 : 1;
      if (a.estimate.eligible !== b.estimate.eligible)
        return a.estimate.eligible ? -1 : 1;
      return (
        (a.estimate.totalPaid ?? Infinity) - (b.estimate.totalPaid ?? Infinity)
      );
    });

  return { ranked, topPickReason: reason };
}

/** The required monthly payment on the plan the borrower selected. */
export function requiredPaymentForPlan(
  estimates: PlanEstimate[],
  planId: PlanId | null
): number | null {
  if (!planId) return null;
  const e = estimates.find((x) => x.id === planId);
  if (!e || !e.eligible || e.monthlyPayment === null) return null;
  return e.monthlyPayment;
}
