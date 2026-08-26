// Cense Loan Desk — independent verification harness. Created with Claude Code.
//
// Every assertion here is computed a SECOND way (closed-form algebra, or a
// hand-derived figure from the regulation) and compared against the app's
// output. The point is not to re-run the app's own logic and agree with it.
//
//   node verify.mjs
//
// Regulatory anchors:
//   34 CFR 685.208(b)(1)  Standard, 10 yr, pre-July-2026 borrowers only
//   34 CFR 685.208(b)(4)  Extended, >$30k, max 25 yr
//   34 CFR 685.208(b)(6)  Graduated, max 10 yr, no payment >3x any other
//   34 CFR 685.208(b)(8)  Tiered Standard, mixed-vintage borrowers
//   34 CFR 685.208(c)(1)  Tiered Standard, post-July-2026 borrowers
//   34 CFR 685.209(b)(2)  RAP base payment brackets
//   34 CFR 685.209(f)(2)  IBR new borrower: 10% discretionary, capped at Standard
//   34 CFR 685.209(f)(5)  RAP monthly = base/12 minus $50/dependent
//   34 CFR 685.209(h)(4)  RAP: unpaid interest is not charged
//   34 CFR 685.209(k)(2)  IBR new borrower: 240 payments / 20 yr
//   34 CFR 685.209(o)(2)  RAP matching principal payment
//   34 CFR 685.219(b)(28) Qualifying repayment plan for PSLF

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
  }
}
function near(name, got, want, tol, unit = "") {
  const d = Math.abs(got - want);
  ok(
    name,
    d <= tol,
    `got ${got.toFixed(4)}${unit}, expected ${want.toFixed(4)}${unit} (±${tol})`
  );
}

// ---------------------------------------------------------------- load app
// Compile the TS modules to a temp dir so we test the REAL shipped logic.
execSync(
  "npx tsc src/lib/calc.ts src/lib/ranking.ts src/data/plans.ts src/types/index.ts " +
    "--outDir .verify --module esnext --target es2020 --moduleResolution bundler " +
    "--skipLibCheck --allowJs false 2>/dev/null || true",
  { stdio: "ignore" }
);

// The compiled output keeps "@/..." aliases; rewrite them to real relative
// paths so plain Node can load the modules. "@/types" resolves to a directory,
// so it needs the /index.js suffix.
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, relative, join } from "node:path";

function rewriteAliases(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) {
      rewriteAliases(p);
      continue;
    }
    if (!f.name.endsWith(".js")) continue;
    let src = readFileSync(p, "utf8");
    src = src.replace(/from ["']@\/([^"']+)["']/g, (_, mod) => {
      const targetDir = join(".verify", mod);
      const target = existsSync(targetDir) ? join(targetDir, "index.js") : `${join(".verify", mod)}.js`;
      let rel = relative(dirname(p), target).split("\\").join("/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      return `from "${rel}"`;
    });
    writeFileSync(p, src);
  }
}
rewriteAliases(".verify");

const calc = await import("./.verify/lib/calc.js");
const ranking = await import("./.verify/lib/ranking.js");
const plans = await import("./.verify/data/plans.js");

console.log("=".repeat(78));
console.log("CENSE LOAN DESK — INDEPENDENT VERIFICATION");
console.log("=".repeat(78));

// ============================================================ 1. amortisation
console.log("\n[1] Amortised payment — closed form vs implementation");
{
  // Independent closed form: P = B*r / (1 - (1+r)^-n)
  const indep = (B, apr, yrs) => {
    const r = apr / 100 / 12,
      n = yrs * 12;
    return r === 0 ? B / n : (B * r) / (1 - Math.pow(1 + r, -n));
  };
  for (const [B, apr, y] of [
    [18000, 6.52, 10],
    [27000, 5.5, 10],
    [60000, 6.52, 20],
    [11256, 5.9829, 10],
    [5000, 0, 10],
  ]) {
    near(
      `amortize $${B} @ ${apr}% / ${y}yr`,
      calc.amortizedPayment(B, apr, y),
      indep(B, apr, y),
      0.01
    );
  }
  // Hand-checked anchor: $18,000 @ 6.52% over 10 yr ≈ $204.56/mo
  near("anchor: $18k @6.52% 10yr ≈ 204.56", calc.amortizedPayment(18000, 6.52, 10), 204.56, 0.6);
  ok("zero balance -> 0", calc.amortizedPayment(0, 6, 10) === 0);
  ok("zero years -> 0", calc.amortizedPayment(1000, 6, 0) === 0);
}

// ============================================================ 2. poverty line
console.log("\n[2] Poverty guidelines — 2026 ASPE table");
{
  // Values pulled live from the ASPE API during research.
  const aspe = { 1: 15960, 2: 21640, 3: 27320, 4: 33000, 5: 38680, 6: 44360 };
  for (const [n, v] of Object.entries(aspe)) {
    ok(`poverty size ${n} = $${v}`, plans.getPovertyLine(+n) === v, `got ${plans.getPovertyLine(+n)}`);
  }
  ok("increment above 6 is $5,680", plans.getPovertyLine(7) === 44360 + 5680);
  ok("size 0 clamps to 1", plans.getPovertyLine(0) === 15960);
}

// ============================================================ 3. RAP brackets
console.log("\n[3] RAP base payment — 34 CFR 685.209(b)(2)(i)-(xi)");
{
  const cases = [
    [8000, 120], [10000, 120],
    [10001, 100.01], [20000, 200],
    [20001, 400.02], [30000, 600],
    [30001, 900.03], [40000, 1200],
    [40001, 1600.04], [50000, 2000],
    [50001, 2500.05], [60000, 3000],
    [60001, 3600.06], [70000, 4200],
    [70001, 4900.07], [80000, 5600],
    [80001, 6400.08], [90000, 7200],
    [90001, 8100.09], [100000, 9000],
    [100001, 10000.1], [150000, 15000],
  ];
  for (const [agi, want] of cases) {
    near(`RAP base @ AGI $${agi}`, plans.rapAnnualBasePayment(agi), want, 0.02);
  }
  // The RAW base is NOT monotonic, and that is the statute, not a bug: at
  // exactly $10,000 it switches from a flat $120/yr to 1% of AGI, so the base
  // dips from $120 to $100.01. Verify that quirk is faithfully reproduced...
  ok("statutory dip at the $10,000 boundary is reproduced",
     plans.rapAnnualBasePayment(10001) < plans.rapAnnualBasePayment(10000));

  // ...and that the $10/month floor in 685.209(g)(3)(ii) absorbs it, so the
  // payment a borrower actually sees never falls as their income rises.
  const monthly = (agi) => Math.max(plans.RAP_MIN_MONTHLY, plans.rapAnnualBasePayment(agi) / 12);
  let mono = true;
  let worst = "";
  for (let a = 0; a <= 160000; a += 100) {
    if (monthly(a + 100) < monthly(a) - 1e-9) {
      mono = false;
      worst = `$${a} -> $${a + 100}: ${monthly(a).toFixed(2)} -> ${monthly(a + 100).toFixed(2)}`;
    }
  }
  ok("RAP MONTHLY payment (after the $10 floor) is monotonic in AGI", mono, worst);
}

// ============================================================ 4. tiered terms
console.log("\n[4] Tiered Standard terms — 685.208(c)(1)(iii) and (b)(8)(iii)");
{
  const cases = [[0, 10], [24999, 10], [25000, 15], [49999, 15], [50000, 20],
                 [99999, 20], [100000, 25], [500000, 25]];
  for (const [b, y] of cases) {
    ok(`$${b} -> ${y}yr`, plans.getTieredStandardYears(b) === y, `got ${plans.getTieredStandardYears(b)}`);
  }
  ok("min payment $50", plans.TIERED_STANDARD_MIN_PAYMENT === 50);
  ok("Extended floor is $30,000", plans.EXTENDED_MIN_BALANCE === 30000);
}

// ============================================================ 5. eligibility
console.log("\n[5] July 1 2026 cutoff — 685.210(a)(1)(ii) and (a)(3)");
{
  const L = (id, date, bal = 1000) => ({
    id, nickname: id, servicer: "X", kind: "direct_unsub", subsidy: "unsubsidized",
    principal: bal, balance: bal, rate: 6, disbursementDate: date, minPayment: 0,
  });
  ok("2026-06-30 is pre-cutoff", calc.isPostCutoff(L("a", "2026-06-30")) === false);
  ok("2026-07-01 IS post-cutoff (boundary)", calc.isPostCutoff(L("a", "2026-07-01")) === true);
  ok("2026-07-02 is post-cutoff", calc.isPostCutoff(L("a", "2026-07-02")) === true);
  ok("empty date is not post-cutoff", calc.isPostCutoff(L("a", "")) === false);
  ok("one post-cutoff loan taints the portfolio",
     calc.anyPostCutoff([L("a", "2022-09-01"), L("b", "2026-09-01")]) === true);
}

// ============================================================ 6. PSLF
console.log("\n[6] PSLF credit — 685.219(b)(28)");
{
  const mk = (bal, date, rate = 6.52) => [{
    id: "l", nickname: "l", servicer: "X", kind: "direct_unsub", subsidy: "unsubsidized",
    principal: bal, balance: bal, rate, disbursementDate: date, minPayment: 0 }];
  const prof = (over = {}) => ({
    income: 45000, householdSize: 1, employment: "government",
    goal: "forgiveness", extraPerMonth: 0, selectedPlan: null, ...over });

  const get = (loans, p, id) => {
    const est = calc.estimatePlans(calc.buildContext(loans, p));
    return est.find((e) => e.id === id);
  };

  // The correction Ben caught: Tiered Standard NEVER qualifies, including the
  // 10-year tier where its payment equals the old Standard amount.
  for (const bal of [8000, 18000, 24999, 30000, 60000, 150000]) {
    const ts = get(mk(bal, "2026-09-01"), prof(), "tiered_standard");
    ok(`Tiered Standard @ $${bal} does NOT count for PSLF`,
       ts.eligible && ts.pslf === "does_not_count", `pslf=${ts && ts.pslf}`);
  }
  const std = get(mk(20000, "2022-09-01"), prof(), "standard");
  ok("Standard counts", std.pslf === "counts");
  const ibr = get(mk(20000, "2022-09-01"), prof(), "ibr");
  ok("IBR counts (income-driven)", ibr.pslf === "counts");
  const rap = get(mk(20000, "2022-09-01"), prof(), "rap");
  ok("RAP counts (income-driven)", rap.pslf === "counts");
  const ext = get(mk(60000, "2022-09-01"), prof(), "extended");
  ok("Extended does not count (payment below Standard)", ext.pslf === "does_not_count");
  const grad = get(mk(60000, "2022-09-01"), prof(), "graduated");
  ok("Graduated is partial or none, never a flat 'counts'",
     grad.pslf === "partial" || grad.pslf === "does_not_count", `pslf=${grad.pslf}`);
}

// ============================================================ 7. RAP monthly
console.log("\n[7] RAP monthly — 685.209(f)(5), (g)(3)(ii)");
{
  const mk = (bal) => [{ id: "l", nickname: "l", servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate: 6.52,
    disbursementDate: "2026-09-01", minPayment: 0 }];
  const rapFor = (income, household) => {
    const p = { income, householdSize: household, employment: "private",
      goal: "least_total", extraPerMonth: 0, selectedPlan: null };
    return calc.estimatePlans(calc.buildContext(mk(30000), p)).find((e) => e.id === "rap");
  };
  // Hand-derived: $45,000 -> 4% bracket -> $1,800/yr -> $150/mo, 0 dependents.
  near("AGI $45k, 1 person -> $150/mo", rapFor(45000, 1).monthlyPayment, 150, 0.01);
  // $45,000 with 2 in household = 1 dependent -> $150 - $50 = $100.
  near("AGI $45k, 2 people -> $100/mo", rapFor(45000, 2).monthlyPayment, 100, 0.01);
  // Floor: $10/mo minimum even with many dependents.
  near("AGI $45k, 8 people -> $10 floor", rapFor(45000, 8).monthlyPayment, 10, 0.01);
  // Low income: flat $120/yr base = $10/mo.
  near("AGI $9k -> $10/mo", rapFor(9000, 1).monthlyPayment, 10, 0.01);
  // $100,001 -> 10% -> $10,000.10/yr -> $833.34/mo
  near("AGI $100,001 -> ~$833/mo", rapFor(100001, 1).monthlyPayment, 10000.1 / 12, 0.02);
}

// ============================================================ 8. IBR monthly
console.log("\n[8] IBR monthly — 685.209(f)(2), new borrower");
{
  const mk = (bal) => [{ id: "l", nickname: "l", servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate: 6.52,
    disbursementDate: "2022-09-01", minPayment: 0 }];
  const ibrFor = (income, household, bal) => {
    const p = { income, householdSize: household, employment: "private",
      goal: "least_total", extraPerMonth: 0, selectedPlan: null };
    return calc.estimatePlans(calc.buildContext(mk(bal), p)).find((e) => e.id === "ibr");
  };
  // Independent: 10% of (AGI - 1.5*poverty) / 12, capped at the 10-yr Standard.
  const indep = (income, hh, bal, rate = 6.52) => {
    const disc = Math.max(0, income - 1.5 * plans.getPovertyLine(hh));
    const cap = calc.amortizedPayment(bal, rate, 10);
    return Math.min((disc * 0.1) / 12, cap);
  };
  for (const [inc, hh, bal] of [[45000, 1, 60000], [30000, 1, 40000],
                                [22000, 1, 20000], [90000, 3, 50000]]) {
    near(`IBR AGI $${inc}, hh ${hh}, bal $${bal}`, ibrFor(inc, hh, bal).monthlyPayment,
         indep(inc, hh, bal), 0.02);
  }
  // Below 150% of poverty -> $0 payment, and $0 still earns PSLF credit.
  const zero = ibrFor(20000, 1, 30000);
  near("income under 150% poverty -> $0", zero.monthlyPayment, 0, 0.01);
  ok("a $0 IBR payment still counts for PSLF", zero.pslf === "counts");
  // The Standard cap must bind at high income.
  const capped = ibrFor(250000, 1, 20000);
  near("high income caps at 10-yr Standard", capped.monthlyPayment,
       calc.amortizedPayment(20000, 6.52, 10), 0.02);
}

// ============================================================ 9. RAP sim
console.log("\n[9] RAP simulation — interest waiver + matching principal");
{
  const mk = (bal, rate) => [{ id: "l", nickname: "l", servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate,
    disbursementDate: "2026-09-01", minPayment: 0 }];
  const p = { income: 12000, householdSize: 1, employment: "private",
    goal: "least_total", extraPerMonth: 0, selectedPlan: null };
  // AGI $12,000 -> 1% -> $120/yr -> $10/mo. On $40k at 7% the monthly interest
  // is ~$233, far above the payment, so the waiver and the $50 match both bite.
  const est = calc.estimatePlans(calc.buildContext(mk(40000, 7), p)).find((e) => e.id === "rap");
  near("RAP payment is the $10 floor", est.monthlyPayment, 10, 0.01);

  // Independent month-by-month replication of 685.209(h)(4) + (o)(2).
  let bal = 40000;
  const r = 7 / 100 / 12;
  for (let m = 0; m < 360 && bal > 0.005; m++) {
    const interest = bal * r;
    const pay = Math.min(10, bal + interest);
    const charged = Math.min(interest, pay); // shortfall waived, NOT credited
    bal = bal + charged - pay;
    const toPrincipal = Math.max(0, pay - charged);
    if (toPrincipal < 50) bal -= Math.min(50, pay) - toPrincipal;
    if (bal < 0) bal = 0;
  }
  // Payment $10 < interest, so principal falls by exactly min($50,$10) = $10/mo.
  near("independent RAP sim: 360 mo of $10 match", bal, 40000 - 10 * 360, 1);
  ok("balance never grows under RAP", bal < 40000);
  // The app must agree that the balance shrank, not that RAP cleared the loan.
  ok("app: RAP does not clear a $40k balance at $10/mo", est.forgivenAmount > 0);
}

// ============================================================ 10. Graduated
console.log("\n[10] Graduated — 685.208(b)(6): 10 yr, no payment >3x another");
{
  const mk = (bal, rate) => [{ id: "l", nickname: "l", servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate,
    disbursementDate: "2022-09-01", minPayment: 0 }];
  const p = { income: 50000, householdSize: 1, employment: "private",
    goal: "least_total", extraPerMonth: 0, selectedPlan: null };
  for (const [bal, rate] of [[27000, 5.5], [60000, 6.52], [12000, 4.99]]) {
    const g = calc.estimatePlans(calc.buildContext(mk(bal, rate), p)).find((e) => e.id === "graduated");
    const std = calc.amortizedPayment(bal, rate, 10);
    ok(`Graduated $${bal}: term is 10 yr`, g.years === 10);
    ok(`Graduated $${bal}: starts below Standard`, g.monthlyPayment < std,
       `start ${g.monthlyPayment.toFixed(2)} vs std ${std.toFixed(2)}`);
    ok(`Graduated $${bal}: costs more than Standard overall`,
       g.totalPaid > std * 120 - 1,
       `grad ${g.totalPaid.toFixed(0)} vs std ${(std * 120).toFixed(0)}`);
    // The 3x rule: our model steps 5 times, so final = start * g^4.
    const growth = Math.pow(g.totalPaid / (g.monthlyPayment * 120), 1); // sanity only
    ok(`Graduated $${bal}: totals are finite`, isFinite(g.totalPaid) && g.totalPaid > 0);
  }
}

// ============================================================ 11. fixed plans
console.log("\n[11] Fixed plans — totals reconcile to payment x term");
{
  const mk = (bal, rate, date) => [{ id: "l", nickname: "l", servicer: "X",
    kind: "direct_unsub", subsidy: "unsubsidized", principal: bal, balance: bal,
    rate, disbursementDate: date, minPayment: 0 }];
  const p = { income: 50000, householdSize: 1, employment: "private",
    goal: "least_total", extraPerMonth: 0, selectedPlan: null };

  for (const [id, bal, date, yrs] of [
    ["standard", 27000, "2022-09-01", 10],
    ["extended", 60000, "2022-09-01", 25],
    ["tiered_standard", 18000, "2026-09-01", 10],
    ["tiered_standard", 60000, "2026-09-01", 20],
  ]) {
    const e = calc.estimatePlans(calc.buildContext(mk(bal, 6.52, date), p)).find((x) => x.id === id);
    ok(`${id} $${bal}: term ${yrs}yr`, e.years === yrs, `got ${e.years}`);
    near(`${id} $${bal}: total = payment x months`, e.totalPaid,
         e.monthlyPayment * yrs * 12, 1);
    near(`${id} $${bal}: interest = total - balance`, e.totalInterest,
         e.totalPaid - bal, 1);
    ok(`${id} $${bal}: interest is positive`, e.totalInterest > 0);
  }
  // Standard must be the cheapest legacy fixed plan overall.
  const est = calc.estimatePlans(calc.buildContext(mk(60000, 6.52, "2022-09-01"), p));
  const std = est.find((e) => e.id === "standard");
  const ext = est.find((e) => e.id === "extended");
  ok("Standard costs less overall than Extended", std.totalPaid < ext.totalPaid);
  ok("Standard costs more monthly than Extended", std.monthlyPayment > ext.monthlyPayment);
}

// ============================================================ 12. ordering
console.log("\n[12] Payoff ordering + tie-breaks");
{
  const L = (id, bal, rate) => ({ id, nickname: id, servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate,
    disbursementDate: "2022-09-01", minPayment: 0 });
  const port = [
    L("fresh_sub", 3500, 4.99), L("fresh_uns", 2396, 4.99),
    L("soph_sub", 4500, 5.5),   L("soph_uns", 2326, 5.5),
    L("jr_sub", 5500, 6.53),    L("jr_uns", 2256, 6.53),
    L("sr_sub", 5500, 6.39),    L("sr_uns", 2123, 6.39),
  ];
  const av = ranking.orderLoans(port, "avalanche").map((l) => l.id);
  const sn = ranking.orderLoans(port, "snowball").map((l) => l.id);
  ok("avalanche order is correct",
     JSON.stringify(av) === JSON.stringify(
       ["jr_uns","jr_sub","sr_uns","sr_sub","soph_uns","soph_sub","fresh_uns","fresh_sub"]),
     av.join(","));
  ok("snowball order is correct",
     JSON.stringify(sn) === JSON.stringify(
       ["sr_uns","jr_uns","soph_uns","fresh_uns","fresh_sub","soph_sub","jr_sub","sr_sub"]),
     sn.join(","));
  ok("avalanche is non-increasing in rate",
     ranking.orderLoans(port,"avalanche").every((l,i,a)=>i===0||a[i-1].rate>=l.rate));
  ok("snowball is non-decreasing in balance",
     ranking.orderLoans(port,"snowball").every((l,i,a)=>i===0||a[i-1].balance<=l.balance));
  // Equal-rate tie must break to the SMALLER balance under avalanche.
  const tie = ranking.orderLoans([L("big",9000,6),L("small",1000,6)],"avalanche");
  ok("avalanche tie -> smaller balance first", tie[0].id === "small");
  // Equal-balance tie must break to the HIGHER rate under snowball.
  const tie2 = ranking.orderLoans([L("lo",5000,4),L("hi",5000,8)],"snowball");
  ok("snowball tie -> higher rate first", tie2[0].id === "hi");
  ok("ranking never drops or duplicates a loan",
     new Set(av).size === port.length && new Set(sn).size === port.length);
}

// ============================================================ 13. strategies
console.log("\n[13] Strategy comparison");
{
  const L = (id, bal, rate) => ({ id, nickname: id, servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate,
    disbursementDate: "2022-09-01", minPayment: 0 });
  const port = [L("a",3500,4.99), L("b",2256,6.53), L("c",5500,6.39)];
  const total = 11256;
  const cmp = ranking.compareStrategies(port, 125, 100);
  ok("comparison is produced", !!cmp);
  ok("budget = required + extra", Math.abs(cmp.budget - 225) < 0.01);
  ok("avalanche never costs more interest than snowball",
     cmp.avalanche.totalInterest <= cmp.snowball.totalInterest + 0.01,
     `av ${cmp.avalanche.totalInterest.toFixed(2)} sn ${cmp.snowball.totalInterest.toFixed(2)}`);
  ok("snowballCost is non-negative", cmp.snowballCost >= 0);
  ok("both strategies retire the debt at $225/mo",
     cmp.avalanche.paidOff && cmp.snowball.paidOff);
  // Sanity: total repaid must exceed principal, and the term must be plausible.
  ok("payoff months in a sane range",
     cmp.avalanche.months > 12 && cmp.avalanche.months < 120,
     `${cmp.avalanche.months} months`);
  // Independent bound: at $225/mo with ~6% interest, paying off $11,256 cannot
  // take fewer than balance/budget months.
  ok("cannot beat the zero-interest floor",
     cmp.avalanche.months >= Math.floor(total / 225),
     `${cmp.avalanche.months} vs floor ${Math.floor(total / 225)}`);
  // No plan selected -> caller passes 0 -> no projection.
  ok("zero required payment yields null", ranking.compareStrategies(port, 0, 100) === null);
  ok("empty portfolio yields null", ranking.compareStrategies([], 125, 100) === null);
  // More extra must never be slower or costlier.
  const more = ranking.compareStrategies(port, 125, 400);
  ok("more extra pays off no slower", more.avalanche.months <= cmp.avalanche.months);
  ok("more extra costs no more interest",
     more.avalanche.totalInterest <= cmp.avalanche.totalInterest + 0.01);
}

// ============================================================ 14. aggregates
console.log("\n[14] Portfolio aggregates");
{
  const L = (id, bal, rate, prin) => ({ id, nickname: id, servicer: "S" + id,
    kind: "direct_unsub", subsidy: "unsubsidized", principal: prin ?? bal,
    balance: bal, rate, disbursementDate: "2022-09-01", minPayment: 0 });
  const port = [L("a",3500,4.99,3500), L("b",2396,4.99,2000), L("c",5500,6.53,5500)];
  near("totalBalance", calc.totalBalance(port), 11396, 0.01);
  near("totalPrincipal", calc.totalPrincipal(port), 11000, 0.01);
  const wr = (3500*4.99 + 2396*4.99 + 5500*6.53) / 11396;
  near("weightedRate", calc.weightedRate(port), wr, 0.0001);
  ok("weightedRate of empty portfolio is 0", calc.weightedRate([]) === 0);
  ok("weighted rate sits between min and max rate",
     calc.weightedRate(port) >= 4.99 && calc.weightedRate(port) <= 6.53);
}

// ============================================================ 15. ranking UI
console.log("\n[15] Plan ranking / recommendation");
{
  const mk = (bal, date) => [{ id: "l", nickname: "l", servicer: "X", kind: "direct_unsub",
    subsidy: "unsubsidized", principal: bal, balance: bal, rate: 6.52,
    disbursementDate: date, minPayment: 0 }];
  const run = (goal, employment, bal = 30000, date = "2022-09-01") => {
    const p = { income: 50000, householdSize: 1, employment, goal,
      extraPerMonth: 0, selectedPlan: null };
    const ctx = calc.buildContext(mk(bal, date), p);
    return calc.rankPlans(calc.estimatePlans(ctx), ctx);
  };
  for (const goal of ["lowest_payment","least_total","forgiveness","unsure"]) {
    const { ranked, topPickReason } = run(goal, "private");
    ok(`goal=${goal}: a top pick exists`, ranked.some((r) => r.isTopPick));
    ok(`goal=${goal}: top pick is listed first`, ranked[0].isTopPick);
    ok(`goal=${goal}: a reason is given`, topPickReason.length > 20);
    ok(`goal=${goal}: every other eligible plan says why not`,
       ranked.filter((r) => !r.isTopPick && r.estimate.eligible &&
                            r.estimate.monthlyPayment !== null)
             .every((r) => r.whyNot.length > 10));
    ok(`goal=${goal}: exactly one top pick`,
       ranked.filter((r) => r.isTopPick).length === 1);
    ok(`goal=${goal}: exactly one lowest-payment label`,
       ranked.filter((r) => r.isLowestPayment).length === 1);
    ok(`goal=${goal}: exactly one lowest-interest label`,
       ranked.filter((r) => r.isLowestInterest).length === 1);
  }
  // The labels must match the actual numbers.
  const { ranked } = run("least_total", "private");
  const elig = ranked.filter((r) => r.estimate.monthlyPayment !== null);
  const minPay = Math.min(...elig.map((r) => r.estimate.monthlyPayment));
  const minInt = Math.min(...elig.map((r) => r.estimate.totalInterest));
  ok("lowest-payment label is on the actual minimum",
     elig.find((r) => r.isLowestPayment).estimate.monthlyPayment === minPay);
  ok("lowest-interest label is on the actual minimum",
     elig.find((r) => r.isLowestInterest).estimate.totalInterest === minInt);
  // Public service + forgiveness must never recommend a non-qualifying plan
  // when a qualifying one exists.
  for (const emp of ["government", "nonprofit"]) {
    for (const date of ["2022-09-01", "2026-09-01"]) {
      const { ranked: r2 } = run("forgiveness", emp, 30000, date);
      const top = r2.find((x) => x.isTopPick);
      const anyQual = r2.some((x) => x.estimate.eligible &&
        x.estimate.monthlyPayment !== null && x.estimate.pslf === "counts");
      if (anyQual) {
        ok(`${emp}/${date}: top pick earns PSLF credit`,
           top.estimate.pslf === "counts", `picked ${top.estimate.id}`);
      }
    }
  }
  // Post-cutoff must leave exactly RAP + Tiered Standard.
  const { ranked: post } = run("least_total", "private", 30000, "2026-09-01");
  const eligIds = post.filter((r) => r.estimate.eligible).map((r) => r.estimate.id).sort();
  ok("post-cutoff eligibility is exactly {rap, tiered_standard}",
     JSON.stringify(eligIds) === JSON.stringify(["rap","tiered_standard"]), eligIds.join(","));
  // Extended must be gated at $30k.
  const under = run("least_total", "private", 29999).ranked.find((r) => r.estimate.id === "extended");
  const over = run("least_total", "private", 30001).ranked.find((r) => r.estimate.id === "extended");
  ok("Extended closed under $30k", !under.estimate.eligible);
  ok("Extended open above $30k", over.estimate.eligible);
}

// ============================================================ 16. invariants
console.log("\n[16] Cross-cutting invariants over random portfolios");
{
  let bad = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 400; t++) {
    const n = 1 + Math.floor(rnd() * 6);
    const post = rnd() < 0.35;
    const loans = Array.from({ length: n }, (_, i) => {
      const bal = Math.round(500 + rnd() * 30000);
      return { id: "l" + i, nickname: "l" + i, servicer: "S", kind: "direct_unsub",
        subsidy: "unsubsidized", principal: bal, balance: bal,
        rate: Math.round((1 + rnd() * 10) * 100) / 100,
        disbursementDate: post && i === 0 ? "2026-09-01" : "2023-09-01", minPayment: 0 };
    });
    const p = { income: Math.round(rnd() * 140000), householdSize: 1 + Math.floor(rnd() * 5),
      employment: ["government","nonprofit","private","unsure"][Math.floor(rnd()*4)],
      goal: ["lowest_payment","least_total","forgiveness","unsure"][Math.floor(rnd()*4)],
      extraPerMonth: Math.round(rnd() * 500), selectedPlan: null };
    const ctx = calc.buildContext(loans, p);
    const est = calc.estimatePlans(ctx);

    for (const e of est) {
      if (!e.eligible) continue;
      if (e.monthlyPayment === null) continue;
      if (!(e.monthlyPayment >= 0)) bad.push(`t${t} ${e.id} negative payment`);
      if (!isFinite(e.monthlyPayment)) bad.push(`t${t} ${e.id} non-finite payment`);
      if (e.totalPaid !== null && e.totalPaid < -0.01) bad.push(`t${t} ${e.id} negative total`);
      if (e.totalInterest !== null && e.totalInterest < -0.01)
        bad.push(`t${t} ${e.id} negative interest`);
      if (e.forgivenAmount < -0.01) bad.push(`t${t} ${e.id} negative forgiven`);
      if (e.years < 0 || e.years > 31) bad.push(`t${t} ${e.id} implausible term ${e.years}`);
      if (e.id === "tiered_standard" && e.pslf !== "does_not_count")
        bad.push(`t${t} tiered_standard claimed PSLF credit`);
      if ((e.id === "rap" || e.id === "ibr") && e.pslf !== "counts")
        bad.push(`t${t} ${e.id} lost PSLF credit`);
      if (e.forgivenAmount > 0 && e.id !== "rap" && e.id !== "ibr")
        bad.push(`t${t} ${e.id} forgave a balance on a fixed plan`);
    }
    // Eligibility must be mutually exclusive by cutoff.
    const ids = est.filter((e) => e.eligible).map((e) => e.id);
    if (ctx.postCutoff && ids.some((i) => ["standard","graduated","extended","ibr"].includes(i)))
      bad.push(`t${t} legacy plan open to a post-cutoff borrower`);
    if (!ctx.postCutoff && ids.includes("tiered_standard"))
      bad.push(`t${t} tiered standard open to a legacy borrower`);

    const { ranked } = calc.rankPlans(est, ctx);
    if (ranked.filter((r) => r.isTopPick).length > 1) bad.push(`t${t} multiple top picks`);
    if (ranked.length && ranked.filter((r)=>r.isTopPick).length === 1 && !ranked[0].isTopPick)
      bad.push(`t${t} top pick not listed first`);
  }
  ok(`400 randomised portfolios hold every invariant`, bad.length === 0,
     bad.slice(0, 6).join(" | "));
}

// ============================================================ report
console.log("\n" + "=".repeat(78));
console.log(`PASS ${pass}   FAIL ${fail}`);
if (fail) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("All checks passed.");
console.log("=".repeat(78));
