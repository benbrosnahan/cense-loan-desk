// Cense Loan Desk — payoff ordering. Created with Claude Code.
//
// Adapted from the Debt Dashboard engine (loan-paydown/src/lib/paydown.ts),
// generalised from generic high-cost debt to federal student loans.

import { Loan, PlanSchedule, RankedLoan, Strategy } from "@/types";
import { idrMonth } from "@/lib/calc";

/**
 * Order loans by strategy.
 *   avalanche = highest rate first, ties broken by smaller balance
 *   snowball  = smallest balance first, ties broken by higher rate
 *
 * The avalanche tie-break matters: at equal rates two loans are financially
 * identical, so clearing the smaller one first removes an account for free.
 */
export function orderLoans(loans: Loan[], strategy: Strategy): Loan[] {
  const copy = [...loans];
  if (strategy === "avalanche") {
    copy.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  } else {
    copy.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  }
  return copy;
}

export function rankLoans(loans: Loan[], strategy: Strategy): RankedLoan[] {
  const ordered = orderLoans(loans, strategy);

  return ordered.map((loan, i) => {
    const prev = ordered[i - 1];
    let reason: string;

    if (strategy === "avalanche") {
      if (i === 0) {
        const tied = ordered.filter((l) => l.rate === loan.rate).length > 1;
        reason = tied
          ? `Highest rate you carry at ${loan.rate}%, and the smaller of the loans at that rate, so it clears first.`
          : `Highest rate you carry at ${loan.rate}%. Every extra dollar does the most work here.`;
      } else if (prev && prev.rate === loan.rate) {
        reason = `Also ${loan.rate}%, but a larger balance than the one above, so it waits its turn.`;
      } else {
        reason = `${loan.rate}%. Next in line once the loans above it are gone.`;
      }
    } else {
      if (i === 0) {
        reason =
          "Smallest balance you have, so this is the fastest account to clear off the list entirely.";
      } else if (i === ordered.length - 1) {
        reason = "Largest balance, so it goes last under this method.";
      } else {
        reason = `Next smallest. Each account you close frees up its minimum for the next one.`;
      }
    }

    return { loan, rank: i + 1, reason };
  });
}

interface SimOutcome {
  months: number;
  /**
   * Interest actually paid: the part of each payment that goes to interest.
   * Never below 0 and never above what is paid. Unpaid interest that is
   * waived or forgiven is not in it.
   */
  totalInterest: number;
  /** Everything the borrower pays, extra included. */
  totalPaid: number;
  paidOff: boolean;
  /** Still owed after the plan's last payment, and forgiven. 0 unless IBR or RAP. */
  forgiven: number;
  /**
   * Total balance at the end of each month. Index 0 is today's balance, so
   * the array is `months + 1` long. Drives the payoff chart.
   */
  balanceByMonth: number[];
  /** The month each loan reaches zero, keyed by loan id. Absent if it never does. */
  payoffMonthById: Record<string, number>;
}

/** No waiver and no match: plain amortisation. */
const PLAIN = { waiveUnpaidInterest: false, matchPrincipal: false };

/**
 * Month-by-month simulation: accrue interest, then pour the whole budget into
 * the target loan in strategy order. The budget is the required payment on the
 * borrower's chosen plan plus whatever extra they told us about.
 *
 * Given the plan's schedule it runs that plan's own rules: Graduated's steps,
 * a fixed plan repaid within its term, and IBR and RAP stopping at their last
 * payment with what is left forgiven. Without one, a flat payment runs for up
 * to 50 years.
 *
 * Each month runs through idrMonth, the step the Plans card runs for IBR and
 * RAP, on the whole balance at the rate that charges the loans' own interest.
 * The required payment moves every loan in proportion to its balance, so at
 * $0 extra the blend never shifts and Payoff matches the card exactly. What
 * the extra changes goes to the target loan, which then lowers the rate.
 */
function simulate(
  loans: Loan[],
  strategy: Strategy,
  requiredPayment: number,
  extra: number,
  plan?: PlanSchedule | null
): SimOutcome {
  const maxMonths = plan ? plan.termMonths : 600;
  const rules = plan ? plan.rules : PLAIN;
  const order = orderLoans(loans, strategy).map((l) => l.id);
  const byId = new Map(loans.map((l) => [l.id, l]));
  const balances = new Map(loans.map((l) => [l.id, l.balance]));
  const startBalance = loans.reduce((sum, l) => sum + l.balance, 0);

  let unpaid = 0;
  let totalPaid = 0;
  let interestPaid = 0;
  let months = 0;
  const balanceByMonth: number[] = [startBalance];
  const payoffMonthById: Record<string, number> = {};

  for (let m = 0; m < maxMonths; m++) {
    let principal = 0;
    let accrued = 0;
    balances.forEach((bal, id) => {
      if (bal <= 0) return;
      principal += bal;
      accrued += bal * (byId.get(id)!.rate / 100 / 12);
    });
    if (principal + unpaid <= 0.005) break;
    const rate = principal > 0 ? (accrued / principal) * 1200 : 0;

    let due = plan ? plan.paymentAt(m) : requiredPayment;
    // A fixed plan is repaid within its term, so its last payment is
    // whatever is left.
    if (plan && !plan.forgivesAtTerm && m === maxMonths - 1) {
      due = Math.max(due, principal + unpaid + accrued - extra);
    }

    const state = { principal, unpaid };
    const required = idrMonth(state, rate, due, rules);
    const step = extra > 0 ? idrMonth(state, rate, due + extra, rules) : required;

    // The required payment is billed across the loans pro rata by balance,
    // so every loan moves in proportion. Interest first, then principal
    // (34 CFR 685.211(a)(1)), comes out the same.
    const scale = principal > 0 ? required.state.principal / principal : 0;
    balances.forEach((bal, id) => balances.set(id, bal * scale));

    // What the extra changes goes to the target loan, in strategy order: the
    // whole point of telling your servicer where extra money should go.
    let left = Math.max(0, required.state.principal - step.state.principal);
    for (const id of order) {
      if (left <= 0) break;
      const bal = balances.get(id)!;
      if (bal <= 0) continue;
      const pay = Math.min(bal, left);
      balances.set(id, bal - pay);
      left -= pay;
    }

    unpaid = step.state.unpaid;
    totalPaid += step.paid;
    interestPaid += step.interestPaid;
    months++;

    // Recorded after the fact, so the loop above is untouched.
    let total = unpaid;
    for (const id of order) {
      const bal = balances.get(id)!;
      total += Math.max(0, bal);
      if (bal <= 0.005 && payoffMonthById[id] === undefined) {
        payoffMonthById[id] = months;
      }
    }
    balanceByMonth.push(total);
  }

  const left =
    unpaid +
    Array.from(balances.values()).reduce((a, b) => a + Math.max(0, b), 0);
  const paidOff = left <= 0.005;
  return {
    months,
    totalInterest: interestPaid,
    totalPaid,
    paidOff,
    forgiven: plan?.forgivesAtTerm && !paidOff ? left : 0,
    balanceByMonth,
    payoffMonthById,
  };
}

export type PayoffProjection = SimOutcome;

/**
 * One strategy at one budget, with the month-by-month detail the chart needs.
 * Same engine as compareStrategies, so the chart and the headline figures can
 * never disagree.
 */
export function projectPayoff(
  loans: Loan[],
  strategy: Strategy,
  requiredPayment: number,
  extraPerMonth: number,
  plan?: PlanSchedule | null
): PayoffProjection | null {
  if (!loans.length || requiredPayment < 0) return null;
  return simulate(
    loans,
    strategy,
    requiredPayment,
    Math.max(0, extraPerMonth),
    plan
  );
}

export interface StrategyComparison {
  avalanche: SimOutcome;
  snowball: SimOutcome;
  /** Extra interest the snowball costs versus the avalanche. */
  snowballCost: number;
  /** Positive means snowball takes longer. */
  monthsDifference: number;
  budget: number;
  requiredPayment: number;
  extra: number;
  budgetTooLow: boolean;
}

/**
 * Compare the two orders at a known monthly budget.
 *
 * `requiredPayment` must come from the borrower's selected repayment plan.
 * Without it there is no defensible timeline, so callers pass null and the UI
 * shows the ranking without a projection rather than inventing one. `plan` is
 * that plan's schedule, from planSchedule in calc.ts.
 */
export function compareStrategies(
  loans: Loan[],
  requiredPayment: number,
  extraPerMonth: number,
  plan?: PlanSchedule | null
): StrategyComparison | null {
  if (!loans.length || requiredPayment < 0) return null;

  const extra = Math.max(0, extraPerMonth);
  const budget = requiredPayment + extra;

  const avalanche = simulate(loans, "avalanche", requiredPayment, extra, plan);
  const snowball = simulate(loans, "snowball", requiredPayment, extra, plan);

  return {
    avalanche,
    snowball,
    snowballCost: Math.max(0, snowball.totalInterest - avalanche.totalInterest),
    monthsDifference: snowball.months - avalanche.months,
    budget,
    requiredPayment,
    extra,
    budgetTooLow: !avalanche.paidOff,
  };
}
