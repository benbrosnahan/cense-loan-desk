// Scope of the advice: whose situation the plan answers fit, and which loans they cover (audits/ROADMAP.md,
// SCOPE-01 to SCOPE-07), plus guards for the eligibility and pricing rules the audit checked and found right.
// Every dollar expectation is re-derived in support/scope.mjs from 34 CFR 685.208-685.209 and the 2026 poverty
// guidelines; nothing here imports the app's code.
import { test, expect, openApp, goTo, knownIssue, LOANS, PROFILE, PHONE } from './helpers.mjs';
import {
  FIXED_PLANS, addLoan, amortized, choose, enterForgivenessCredit, fieldText, ibrMonthly, incomeField, monthAfter,
  monthsToClear, monthsUntil, near, openPlanDetails, openPlans, planDetails, preTaxDeductionField, rapMonthly,
  readPick, readPlan, sayMarriedFilingJointly, sayOnStandardSince, sentence, setHousehold, spouseLoanField,
  tenYearPayment, textAbovePlanList, totalOwed, typeIncome, usd,
} from './support/scope.mjs';

/** The audit date, at midday so no time zone moves it to another day. Tests that print months freeze the clock here. */
const TODAY = new Date(2026, 10, 2, 12);

/** A returning borrower with the kit's eight loans ($28,101) who has not answered the Plans questions yet. */
const RETURNING = { profile: null, snapshots: null };

const inDefault = loans => loans.map(l => ({ ...l, servicer: 'Default Resolution Group' }));

/** One Direct Unsubsidized loan, as the form would save it. */
const oneLoan = ({ balance, rate, paidOut, principal = balance }) => [{
  id: `u-${paidOut}`, nickname: `${paidOut.slice(0, 4)} unsubsidized`, servicer: 'Nelnet', kind: 'direct_unsub',
  subsidy: 'unsubsidized', principal, balance, rate, disbursementDate: paidOut, minPayment: 0,
}];

const USE_STANDARD = /^Use Standard (as my plan|for my numbers)/;
const ENDS = /(?:Debt free|finish) in (\w+ \d{4})/;
const FULL_TIME = /full[- ]time|30 hours|thirty hours|hours a week/i;
/** The recommendation's forgiveness promise, as quoted in failure messages. */
const PROMISE = /120 qualifying payments|rest is cancell?ed/i;
const cents = n => `$${n.toFixed(2)}`;

// ---------------------------------------------------------------- known issues

test('SCOPE-01 a part-time public-service worker is told only full-time months earn PSLF wherever forgiveness is promised', async ({ page }) => {
  knownIssue('SCOPE-01');
  await page.setViewportSize(PHONE);
  await openApp(page, RETURNING);
  await goTo(page, 'plans');
  await choose(page, 'Going for forgiveness');
  await choose(page, 'Nonprofit');
  await typeIncome(page, 22880); // 20 hours a week at $22: under 34 CFR 685.219(b)(11) no month of this job counts

  // The questions and the recommendation are read before the plan list; each plan's detail is read on its own.
  const problems = [];
  const above = await textAbovePlanList(page);
  if (!FULL_TIME.test(above)) problems.push(`the recommendation says "${sentence(above, PROMISE)}"`);
  await openPlanDetails(page);
  for (const { plan, text } of await planDetails(page)) {
    const claim = sentence(text, /\b(counts?|earns?)\b[^.]*Public Service Loan Forgiveness/i) || sentence(text, /\b(counts?|earns?)\b[^.]*PSLF/i);
    if (claim && !FULL_TIME.test(text)) problems.push(`${plan} detail: "${claim}"`);
  }
  const mentions = (await page.locator('#main').innerText()).match(new RegExp(FULL_TIME.source, 'gi'))?.length ?? 0;
  expect(problems, `SCOPE-01: a nonprofit worker on $22,880 (20 hours a week) going for forgiveness is promised PSLF in ${problems.length} places that never say only full-time work (30+ hours a week) counts; the Plans tab says full time or 30 hours ${mentions} times. ${problems.join(' | ')}`).toEqual([]);
});

test("SCOPE-02 a married couple filing jointly can be priced by the rule: IBR $163 with RAP $217, and the spouse's own loans count", async ({ page }) => {
  knownIssue('SCOPE-02');
  await openApp(page, RETURNING);
  await goTo(page, 'plans');
  await choose(page, 'Going for forgiveness');
  await choose(page, 'Government');
  await typeIncome(page, 52000); // the couple's combined AGI: one earner, no children, the spouse has no loans

  // 685.209(b)(9)(i)(B) counts the spouse in IBR's family size, so 2. RAP counts only dependents claimed under
  // IRC 152, and a spouse never is one ((b)(3)), so 0. No single household number gives both.
  const cap = tenYearPayment(LOANS);
  const rule = { ibr: ibrMonthly(52000, 2, cap), rap: rapMonthly(52000, 0) };
  const joint = await sayMarriedFilingJointly(page);
  const seen = [];
  for (const size of [1, 2]) {
    await setHousehold(page, size);
    seen.push({ size, ibr: (await readPlan(page, 'IBR'))?.monthly, rap: (await readPlan(page, 'RAP'))?.monthly });
  }
  const priced = seen.find(s => near(s.ibr, rule.ibr) && near(s.rap, rule.rap));
  const shown = seen.map(s => `household ${s.size} shows IBR ${usd(s.ibr)} and RAP ${usd(s.rap)}`).join(', ');
  expect(priced, `SCOPE-02: no answer prices a married couple filing jointly ($52,000 combined AGI, no children) by the rule, IBR ${usd(rule.ibr)} (family of 2) with RAP ${usd(rule.rap)} (no dependents): ${joint ? `with "${joint}" chosen` : 'nothing asks about marriage or a joint return'}, ${shown}`).toBeTruthy();

  // The spouse's own federal loans: on a joint return each payment is scaled by this borrower's share of the
  // couple's eligible balance (685.209(g)(1)(i), (g)(3)(i)). $92,000 combined, the spouse owes the same $28,101.
  await setHousehold(page, priced.size);
  await typeIncome(page, 92000);
  const share = 0.5;
  const rap = rapMonthly(92000, 0) * share;
  const ibrUncapped = ibrMonthly(92000, 2);
  const ibr = [Math.min(ibrUncapped, cap) * share, Math.min(ibrUncapped * share, cap)]; // cap, then share; or share, then cap
  const spouse = await spouseLoanField(page);
  const unscaled = { ibr: (await readPlan(page, 'IBR'))?.monthly, rap: (await readPlan(page, 'RAP'))?.monthly };
  expect(spouse, `SCOPE-02: nothing asks for the spouse's own federal loans, so at $92,000 combined with the spouse owing $28,101 the page shows IBR ${usd(unscaled.ibr)} and RAP ${usd(unscaled.rap)}, where the rule gives IBR ${ibr.map(usd).join(' or ')} and RAP ${usd(rap)}`).not.toBeNull();
  await spouse.fill(String(totalOwed(LOANS)));
  await expect(spouse).toHaveValue(/28,?101/);
  const now = { ibr: (await readPlan(page, 'IBR'))?.monthly, rap: (await readPlan(page, 'RAP'))?.monthly };
  expect(ibr.some(v => near(now.ibr, v)) && near(now.rap, rap), `SCOPE-02: with the spouse owing $28,101 the page shows IBR ${usd(now.ibr)} and RAP ${usd(now.rap)}; the rule gives IBR ${ibr.map(usd).join(' or ')} and RAP ${usd(rap)}`).toBe(true);
});

test('SCOPE-03 the income question asks for adjusted gross income, the figure IBR and RAP are priced on', async ({ page }) => {
  knownIssue('SCOPE-03');
  await openApp(page, RETURNING);
  await goTo(page, 'plans');
  await choose(page, 'Private sector');

  // Paid $60,000, with $3,000 into a 401(k) and $2,000 of pre-tax health premiums: AGI $55,000, the income the
  // rule prices both plans on (685.209(b)(10)).
  const cap = tenYearPayment(LOANS);
  const onAgi = { ibr: ibrMonthly(55000, 1, cap), rap: rapMonthly(55000, 0) };
  const deductions = await preTaxDeductionField(page);
  if (deductions) {
    // A fix that works AGI out from pay and pre-tax deductions is judged on the price, whatever its wording.
    await typeIncome(page, 60000);
    await deductions.fill('5000');
    const ibr = (await readPlan(page, 'IBR'))?.monthly;
    const rap = (await readPlan(page, 'RAP'))?.monthly;
    expect(near(ibr, onAgi.ibr) && near(rap, onAgi.rap), `SCOPE-03: $60,000 of pay with $5,000 of pre-tax deductions shows IBR ${usd(ibr)} and RAP ${usd(rap)}; on the $55,000 AGI the rule gives ${usd(onAgi.ibr)} and ${usd(onAgi.rap)}`).toBe(true);
    return;
  }
  await typeIncome(page, 60000); // what "before tax" asks this person for
  const asked = await fieldText(incomeField(page));
  const shown = { ibr: (await readPlan(page, 'IBR'))?.monthly, rap: (await readPlan(page, 'RAP'))?.monthly };
  expect(asked, `SCOPE-03: the income question reads "${asked}"; it never asks for adjusted gross income or says pre-tax 401(k) and health deductions come out, so someone paid $60,000 with $5,000 of them types 60,000 and sees IBR ${usd(shown.ibr)} and RAP ${usd(shown.rap)} instead of ${usd(onAgi.ibr)} and ${usd(onAgi.rap)} on their $55,000 AGI`)
    .toMatch(/^(?=.*(adjusted gross income|\bAGI\b))(?=.*(pre-?tax|401\(k\)|403\(b\)|deduct|1040|tax return))/i);
});

test('SCOPE-04 the loan form and the plan answer say they cover federal Direct Loans, not FFEL, Perkins, consolidation or private loans', async ({ page }) => {
  knownIssue('SCOPE-04');
  await page.setViewportSize(PHONE);
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: /loan/i });
  const formText = await form.innerText();
  const typeGroup = form.getByRole('radiogroup', { name: /type/i });
  const types = await ((await typeGroup.count()) ? typeGroup.first() : form).getByRole('radio').allInnerTexts();
  const programs = { FFEL: /FFEL/, Perkins: /Perkins/, consolidation: /consolidat/i, 'private loans': /private (student )?loans?|private lenders?/i };
  const unnamed = Object.keys(programs).filter(name => !programs[name].test(formText));
  const saysDirect = types.every(t => /Direct/.test(t)) || /\bDirect Loans?\b/i.test(formText);

  // A Stafford loan paid out in 2008 is an FFEL loan: no FFEL loans were made after June 30, 2010. The person
  // can only enter it as "Unsubsidized". FFEL earns no PSLF credit and cannot use RAP (685.219(b)(7), 685.209(d)(4)).
  await addLoan(page, { paidOut: '2008-09-15', type: /Unsubsidized/, owe: '24000', rate: '6.8' });
  await goTo(page, 'plans');
  await choose(page, 'Going for forgiveness');
  await choose(page, 'Government');
  await typeIncome(page, 40000);
  const above = await textAbovePlanList(page);
  const scoped = /\bDirect Loans?\b/i.test(above) || /FFEL|Perkins/.test(await page.locator('#main').innerText());
  const pick = await readPick(page);

  const problems = [];
  if (unnamed.length) problems.push(`the Add-a-loan form never mentions ${unnamed.join(', ')}`);
  if (!saysDirect) problems.push(`its loan types read "${types.join(', ')}" and nothing says they are Direct Loans`);
  if (!scoped) problems.push(`with a 2008 Stafford loan saved as Unsubsidized, Plans recommends ${pick?.label ?? 'a plan'} and says "${sentence(above, PROMISE)}" without saying its answers cover Direct Loans only`);
  expect(problems, `SCOPE-04: nothing tells a borrower with FFEL, Perkins, consolidation or private loans that the answers cover federal Direct Loans only: ${problems.join('; ')}`).toEqual([]);
});

test('SCOPE-05 a borrower in default is offered only IBR or RAP and gets no debt-free date on a plan default closes', async ({ page }) => {
  knownIssue('SCOPE-05');
  await page.setViewportSize(PHONE);
  // Every loan with Default Resolution Group, and Standard still chosen from before the loans defaulted.
  await openApp(page, { loans: inDefault(LOANS), profile: { ...PROFILE, selectedPlan: 'standard', extraPerMonth: 0 }, snapshots: null });
  const count = (await page.locator('#main').innerText()).match(/\d+ of the \d+[^.]*open to you/)?.[0];
  await goTo(page, 'plans');
  await choose(page, 'Lowest monthly payment');
  const open = await openPlans(page);
  const pick = await readPick(page);
  await goTo(page, 'payoff');
  const payoff = await page.locator('#main').innerText();
  const projected = payoff.match(new RegExp(`On (${FIXED_PLANS.join('|')}) · \\$[\\d,]+ a month required`, 'i'))?.[0];

  // 34 CFR 685.209(c)(1), (d)(2) and (d)(4): only IBR and RAP can repay a defaulted loan.
  const problems = [];
  const offered = open.filter(plan => FIXED_PLANS.includes(plan));
  if (offered.length) problems.push(`Plans lists ${offered.join(', ')} as open${count ? ` (Loans: "${count}")` : ''}`);
  if (pick && FIXED_PLANS.includes(pick.plan)) problems.push(`recommends ${pick.label}`);
  if (projected) problems.push(`Payoff projects "${projected}" and "${payoff.match(ENDS)?.[0] ?? 'no date'}"`);
  expect(problems, `SCOPE-05: every loan is with Default Resolution Group, where only IBR and RAP can repay a defaulted loan, yet ${problems.join('; ')}`).toEqual([]);
});

test('SCOPE-06 a borrower four years into Standard sees their $555 bill and a November 2032 end date, and a year later is told the balances are old', async ({ page }) => {
  knownIssue('SCOPE-06');
  await page.clock.setFixedTime(TODAY);
  await openApp(page, { seeded: false });
  // Entered repayment owing $50,000 at 6%, has paid 48 bills of $555.10, and now owes $33,494.75. Standard keeps
  // the payment and the 10-year clock it started with (34 CFR 685.208(b)(1)), so 72 payments of $555.10 are left.
  const bill = amortized(50000, 6, 120);
  const left = Math.round(monthsToClear(33494.75, 6, 555.1));
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await addLoan(page, {
    paidOut: '2017-09-01', type: /Unsubsidized/, owe: '33494.75', rate: '6',
    detail: { 'Amount you first borrowed': '50000', 'Minimum monthly payment': '555.10' },
  });
  await goTo(page, 'plans');
  await choose(page, 'Pay the least overall');
  await choose(page, 'Private sector');
  await typeIncome(page, 45000);
  const answered = await sayOnStandardSince(page, { began: '2022-11-01', paymentsMade: 48 });
  const standard = await readPlan(page, 'Standard');
  const useStandard = page.getByRole('button', { name: USE_STANDARD }); // absent if a fix already made Standard their plan
  if (await useStandard.count()) await useStandard.first().click();
  await goTo(page, 'payoff');
  const ends = (await page.locator('#main').innerText()).match(ENDS)?.[1] ?? null;

  // A year later, with nothing retyped.
  await page.clock.setFixedTime(new Date(2027, 10, 3, 12));
  await page.reload();
  await page.locator('#main').waitFor();
  const loansLater = await page.locator('#main').innerText();
  await goTo(page, 'payoff');
  const payoffLater = await page.locator('#main').innerText();
  const entered = /Nov(ember|\.)?\s+2,?\s+2026|November 2026|Nov 2026|11\/0?2\/(20)?26|2026-11-02/i;
  const stale = /out of date|outdated|update (them|these|your)|stale|older than|a year (ago|old)|\d+ months? (ago|old)/i;

  const problems = [];
  if (!near(standard?.monthly, bill)) problems.push(`Plans shows Standard ${usd(standard?.monthly)} a month ${standard?.term ?? ''} instead of the ${cents(bill)} bill for the ${left} payments left`);
  const off = ends ? monthsUntil(TODAY, ends) - left : null;
  if (off === null || Math.abs(off) > 1) problems.push(`Payoff says debt free in ${ends ?? 'no month'}, not ${monthAfter(TODAY, left)}`);
  if (![loansLater, payoffLater].some(t => entered.test(t) || stale.test(t))) {
    problems.push(`a year later, with nothing retyped, neither Loans nor Payoff says the balances date from Nov 2, 2026, and Payoff now says debt free in ${payoffLater.match(ENDS)?.[1] ?? 'no month'}`);
  }
  expect(problems, `SCOPE-06: four years into Standard (bill $555.10, $33,494.75 left at 6%${answered ? `, answered "${answered}"` : ', nothing asks how long they have been repaying'}): ${problems.join('; ')}`).toEqual([]);
});

test('SCOPE-07 a borrower with 120 months of IBR credit can enter it and sees forgiveness after 120 more payments, not 240', async ({ page }) => {
  knownIssue('SCOPE-07');
  await page.clock.setFixedTime(TODAY);
  // A new borrower (first loan after July 1, 2014) with 120 payments already counted toward IBR forgiveness.
  await openApp(page, { loans: oneLoan({ balance: 55000, rate: 6.21, paidOut: '2014-09-01' }), profile: null, snapshots: null });
  await goTo(page, 'plans');
  await choose(page, 'Private sector');
  await typeIncome(page, 48000);
  const asked = await enterForgivenessCredit(page, 120);

  // $200.50 a month is under the monthly interest, so the balance is never repaid early: IBR ends at 240 counted
  // payments (685.209(k)(2)), which leaves 120 more.
  const pay = ibrMonthly(48000, 1, amortized(55000, 6.21, 120));
  const ruleTotal = (240 - 120) * pay;
  const ibr = await readPlan(page, 'IBR');
  const payments = ibr?.total ? Math.round(ibr.total / pay) : 0;
  expect(near(ibr?.total, ruleTotal) && Math.abs((ibr?.years ?? 0) - 10) < 0.1, `SCOPE-07: ${asked ? `after typing 120 into "${asked}"` : 'nothing asks for payments already counted toward forgiveness'}, the IBR card reads "In total, ${ibr?.term} ${usd(ibr?.total)}", ${payments} payments of ${cents(pay)} forgiven in ${monthAfter(TODAY, payments)}; with 120 counted, 120 more payments (${usd(ruleTotal)}) end it in ${monthAfter(TODAY, 120)}`).toBe(true);
});

// ---------------------------------------------------------------- guards: verified good in the audit

test('the PSLF promise stays with Government and Nonprofit employers', async ({ page }) => {
  await openApp(page, RETURNING);
  await goTo(page, 'plans');
  await choose(page, 'Going for forgiveness');
  await typeIncome(page, 22880);
  const pslf = /Public Service Loan Forgiveness|\bPSLF\b|120 qualifying payments/i;
  for (const employer of ['Private sector', 'Not sure']) {
    await choose(page, employer);
    expect(await readPick(page), `${employer}: a plan is still recommended`).not.toBeNull();
    expect(await textAbovePlanList(page), `${employer}: nothing above the plan list promises PSLF`).not.toMatch(pslf);
  }
  expect(await textAbovePlanList(page), "'Not sure' says forgiveness is left out").toMatch(/leave forgiveness out of the recommendation/i);
  await choose(page, 'Nonprofit');
  expect(await textAbovePlanList(page), 'Nonprofit: the recommendation is about PSLF').toMatch(pslf);
});

test('a borrower in default keeps IBR and RAP open, priced by the rule', async ({ page }) => {
  await openApp(page, { loans: inDefault(LOANS), profile: PROFILE, snapshots: null }); // $52,000, household of 1
  await goTo(page, 'plans');
  const rule = { IBR: ibrMonthly(52000, 1, tenYearPayment(LOANS)), RAP: rapMonthly(52000, 0) };
  for (const plan of ['IBR', 'RAP']) {
    const card = await readPlan(page, plan);
    expect(near(card?.monthly, rule[plan]), `${plan} shows ${usd(card?.monthly)} a month; the rule gives ${usd(rule[plan])}`).toBe(true);
    expect(card.text, `${plan} can be chosen`).toMatch(/Use .+ (as my plan|for my numbers)|This is my plan|In my numbers/);
  }
});

test('IBR and RAP follow 34 CFR 685.209 when given AGI and household size', async ({ page }) => {
  await openApp(page, RETURNING);
  await goTo(page, 'plans');
  await choose(page, 'Private sector');
  await typeIncome(page, 55000);
  const cap = tenYearPayment(LOANS);
  // A single filer, then an unmarried parent of two: IBR's family size and RAP's dependents move together.
  for (const [size, dependents] of [[1, 0], [3, 2]]) {
    await setHousehold(page, size);
    const rule = { IBR: ibrMonthly(55000, size, cap), RAP: rapMonthly(55000, dependents) };
    for (const plan of ['IBR', 'RAP']) {
      const shown = (await readPlan(page, plan))?.monthly;
      expect(near(shown, rule[plan]), `household ${size}: ${plan} shows ${usd(shown)}; the rule gives ${usd(rule[plan])}`).toBe(true);
    }
  }
});

test('Parent PLUS loans get IBR and RAP closed with the rule cited, and the consolidation caveat on the form, Loans and Plans', async ({ page }) => {
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: /loan/i });
  await form.getByRole('radio', { name: /Parent PLUS/ }).click();
  await expect(form, 'the form warns as soon as Parent PLUS is picked').toContainText(/cannot be repaid under IBR or RAP/i);
  await expect(form, 'and says consolidated loans differ').toContainText(/consolidat/i);
  await addLoan(page, { paidOut: '2019-03-15', type: /Parent PLUS/, owe: '42000', rate: '7.625' });
  await expect(page.locator('#main'), 'Loans warns, with the consolidation caveat').toContainText(/Parent PLUS loans have fewer options[\s\S]*consolidat/i);
  await goTo(page, 'plans');
  const open = await openPlans(page);
  expect(open, 'IBR and RAP are not offered').not.toContain('IBR');
  expect(open).not.toContain('RAP');
  const text = await page.locator('#main').innerText();
  const closed = text.slice(text.search(/not open to you/i));
  for (const plan of ['IBR', 'RAP']) {
    expect(closed, `${plan} is listed as closed, citing the rule`).toMatch(new RegExp(`\\b${plan}\\s+[^\\n]*Parent PLUS[^\\n]*685\\.209`));
  }
  expect(text, 'Plans carries the consolidation caveat').toMatch(/consolidat/i);
});

test('a borrower whose first bill is this month gets the exact 10-year Standard payment, total and end date', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await openApp(page, { loans: oneLoan({ balance: 50000, rate: 6, paidOut: '2022-09-01' }), profile: null, snapshots: null });
  await goTo(page, 'plans');
  const bill = amortized(50000, 6, 120);
  const standard = await readPlan(page, 'Standard');
  expect(near(standard?.monthly, bill), `Standard shows ${usd(standard?.monthly)}; 10 years at 6% on $50,000 is ${cents(bill)}`).toBe(true);
  expect(near(standard?.total, bill * 120), `Standard's total is ${usd(standard?.total)}; 120 payments of ${cents(bill)} are ${usd(bill * 120)}`).toBe(true);
  expect(standard?.years, 'over 10 years').toBe(10);
  await page.getByRole('button', { name: USE_STANDARD }).first().click();
  await goTo(page, 'payoff');
  const payoff = await page.locator('#main').innerText();
  const ends = payoff.match(ENDS)?.[1] ?? null;
  // 120 payments: the 120th falls in October 2036 if the first is this month, November if it is next month.
  expect([119, 120], `Payoff says debt free in ${ends}`).toContain(ends && monthsUntil(TODAY, ends));
  expect(payoff, 'Payoff says when payments start').toMatch(/payments? (start|begin)|first payment/i);
});

test("IBR is capped at the 10-year Standard payment on today's balance for someone starting IBR now", async ({ page }) => {
  await openApp(page, { loans: oneLoan({ balance: 62000, rate: 6.21, paidOut: '2016-09-01' }), profile: null, snapshots: null });
  await goTo(page, 'plans');
  await choose(page, 'Private sector');
  await typeIncome(page, 110000);
  const cap = amortized(62000, 6.21, 120);
  const ibr = (await readPlan(page, 'IBR'))?.monthly;
  expect(near(ibr, cap), `IBR shows ${usd(ibr)}; 10% of discretionary income is ${usd(ibrMonthly(110000, 1))}, capped at the 10-year payment on today's $62,000, ${cents(cap)} (685.209(f)(2)(ii))`).toBe(true);
});
