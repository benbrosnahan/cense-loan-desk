// Money edge cases: IBR rules, plan boundaries, rate prefill, rounding, payoff dates and plan-universe copy.
// Known issues MONEY-13 to MONEY-24 assert the corrected behaviour and fail today (see knownIssue in
// helpers.mjs); the tests without knownIssue guard edge behaviour the audit verified as correct.
// Every expected dollar figure is computed here from the regulation, never by calling the app's code.
import { expect, knownIssue, openApp, goTo, stored, KEYS } from './helpers.mjs';
import {
  test, AUDIT_CLOCK, loan, profile,
  amortized, ibrPayment, idrPath, rapPayment, povertyLine,
  dollars, usd, usdCents, near, sentences, quote, expectNoProblems,
  textOf, expandAll, describedBy, unblurredAmounts,
  setIncome, setHousehold, choose, openPlanNames, readPlan, readTopPick, questionsText,
  openLoanRow, editBalance, readSummary,
} from './support/money-edges.mjs';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

/** Reads the Payoff tab's debt-free month from its sentence ("finish in …") and its "Done" figure. */
async function payoffMonths(page) {
  await expect(page.getByText(/finish in|debt[ -]free in/i).first()).toBeVisible();
  const text = await page.locator('#main').innerText();
  const finish = text.match(new RegExp(`(?:finish in|debt[ -]free in) ((?:${MONTHS}) \\d{4})`, 'i'))?.[1] ?? null;
  const done = text.match(/\bDone\s+([A-Z][a-z]{2}) (\d{4})/i);
  return { text, finish, done: done ? `${done[1]} ${done[2]}` : null };
}

// ------------------------------------------------------------------------------------------------ known issues

test('MONEY-13 IBR charges 15% of discretionary income and forgives at 25 years when a loan was paid out before July 1, 2014', async ({ page, freshApp }) => {
  knownIssue('MONEY-13');
  const problems = [];
  const cases = [
    { balance: 40000, income: 60000, household: 1 }, // the record's reproduction: paid off in about 10 years
    { balance: 80000, income: 70000, household: 2 }, // runs to forgiveness, so the 25-year term shows
  ];
  for (const [i, c] of cases.entries()) {
    const data = { loans: [loan(`pre-2014-${i}`, 'Loan from 2013', { balance: c.balance, rate: 6.8, date: '2013-09-01' })], profile: profile({ householdSize: c.household }), snapshots: null };
    const tab = i === 0 ? page : await freshApp(data);
    if (i === 0) await openApp(page, data);
    await goTo(tab, 'plans');
    await setIncome(tab, c.income);
    const shown = await readPlan(tab, 'IBR');
    // 34 CFR 685.209(b)(13)(ii): owing a loan from before July 1, 2014 means not a new borrower: (f)(3)(i) 15%, (k)(1) 300 payments.
    const pay = ibrPayment({ ...c, rate: 6.8, newBorrower: false });
    const path = idrPath(c.balance, 6.8, pay, 25);
    const forgiven = path.left > 0.005;
    if (!near(shown.monthly, pay) || (forgiven && shown.termYears !== 25)) {
      problems.push(`IBR card for ${usd(c.balance)} at 6.8% paid out 2013-09-01, income ${usd(c.income)}, household ${c.household} shows ` +
        `${usd(shown.monthly)} a month, ${usd(shown.total)} over ${shown.termLabel}; the pre-July-2014 rule (15%, 25 years) gives ${usdCents(pay)} a month, ` +
        (forgiven ? `${usd(path.totalPaid)} over 25 yr, then ${usd(path.left)} forgiven` : `paid off in ${path.months} months for ${usd(path.totalPaid)}`));
    }
  }
  expectNoProblems(problems);
});

test('MONEY-14 IBR applies the $5 and $10 rule: a calculated payment under $5 is $0 and one from $5 to $10 is $10', async ({ page }) => {
  knownIssue('MONEY-14');
  await openApp(page, { loans: [loan('band', '2022–23 unsubsidized', { balance: 40000, rate: 6.53, date: '2022-09-01' })], profile: profile(), snapshots: null });
  await goTo(page, 'plans');
  const problems = [];
  for (const income of [24900, 24000]) {
    await setIncome(page, income);
    const shown = await readPlan(page, 'IBR');
    const calculated = ((income - 1.5 * povertyLine(1)) * 0.1) / 12;
    const rule = ibrPayment({ income, household: 1, balance: 40000, rate: 6.53, newBorrower: true });
    const right = rule === 0
      ? shown.monthly === 0 || (shown.monthly === null && /\$0\b|no payment|nothing to pay/i.test(shown.text))
      : near(shown.monthly, rule);
    if (!right) {
      problems.push(`IBR card at income ${usd(income)}, household 1, shows ${usd(shown.monthly)} a month (${usd(shown.total)} over ${shown.termLabel}); ` +
        `34 CFR 685.209(g)(1)(iii) turns the calculated ${usdCents(calculated)} into ${usd(rule)} (${usd(rule * 240)} over 20 yr)`);
    }
  }
  expectNoProblems(problems);
});

test('MONEY-15 Extended is closed at exactly $30,000 however the cents are split across loans, and open from $30,000.01', async ({ page, freshApp }) => {
  knownIssue('MONEY-15');
  const portfolios = [
    { label: 'one loan of $30,000.00', balances: [30000], open: false },
    { label: 'three loans of $10,000.10, $9,999.95 and $9,999.95 ($30,000.00)', balances: [10000.1, 9999.95, 9999.95], open: false },
    { label: 'one loan of $30,000.01', balances: [30000.01], open: true },
    { label: 'loans of $15,000.01 and $15,000.00 ($30,000.01)', balances: [15000.01, 15000], open: true },
  ];
  const problems = [];
  for (const [i, p] of portfolios.entries()) {
    const data = { loans: p.balances.map((b, j) => loan(`ext-${i}-${j}`, `Loan ${j + 1}`, { balance: b, rate: 6.53, date: '2022-09-01' })), profile: profile(), snapshots: null };
    const tab = i === 0 ? page : await freshApp(data);
    if (i === 0) await openApp(page, data);
    await goTo(tab, 'plans');
    await openPlanNames(tab);
    const offered = (await tab.getByRole('button', { name: 'Use Extended as my plan' }).count()) > 0;
    if (offered && !p.open) {
      const ext = await readPlan(tab, 'Extended');
      problems.push(`With ${p.label} in Direct Loans the Plans tab offers "Use Extended as my plan" at ${usd(ext.monthly)} a month (${usd(ext.total)} over ${ext.termLabel}); ` +
        '34 CFR 685.208(b)(4)(i) opens Extended only above $30,000');
    }
    if (!offered && p.open) problems.push(`With ${p.label} the Plans tab no longer offers Extended, though it is open above $30,000`);
  }
  expectNoProblems(problems);
});

test('MONEY-16 every plan and payoff sentence agrees with the figures shown beside it', async ({ page, freshApp }) => {
  knownIssue('MONEY-16');
  const problems = [];

  // A. The shared eight loans at $70,000 (goal least total, nonprofit): RAP beats Standard on interest and term.
  await openApp(page, { profile: profile({ employment: 'nonprofit' }), snapshots: null });
  await goTo(page, 'plans');
  await setIncome(page, 70000);
  const plans = [];
  for (const name of await openPlanNames(page)) plans.push(await readPlan(page, name, { detail: true }));
  const standard = plans.find(p => p.name === 'Standard');
  const others = plans.filter(p => p !== standard);
  const lessInterest = others.find(p => p.interest !== null && p.interest < standard.interest - 1);
  const leastClaim = /least (total )?interest of any plan|so the least interest/i;
  if (lessInterest && leastClaim.test(standard.text)) {
    problems.push(`Standard's detail says "${quote(standard.text, leastClaim)}" but ${lessInterest.name}'s interest is ${usd(lessInterest.interest)} against Standard's ${usd(standard.interest)}`);
  }
  const higher = others.find(p => p.monthly !== null && p.monthly > standard.monthly + 1);
  const highestClaim = /highest monthly payment of the plans open to you/i;
  if (higher && highestClaim.test(standard.text)) {
    problems.push(`Standard's detail says "${quote(standard.text, highestClaim)}" but ${higher.name} is ${usd(higher.monthly)} a month against Standard's ${usd(standard.monthly)}`);
  }
  const shorter = others.find(p => p.termYears !== null && p.termYears < standard.termYears);
  const shortestClaim = /shortest term of any plan/i;
  if (shorter && shortestClaim.test(standard.text)) {
    problems.push(`Standard's detail says "${quote(standard.text, shortestClaim)}" but ${shorter.name} finishes in ${shorter.termLabel} against Standard's ${standard.termLabel}`);
  }
  const pslfClaim = /no forgiveness at the end unless you are going for PSLF/i;
  if (standard.termYears <= 10 && !/would still be left/i.test(standard.text) && pslfClaim.test(standard.text)) {
    problems.push(`Standard's detail says "${quote(standard.text, pslfClaim)}" but Standard is paid off in ${standard.termLabel}, so 120 PSLF payments leave nothing to forgive`);
  }

  // B. Same loans at $52,000, goal "I do not know yet", Nonprofit: a pick on total cost has the lowest total.
  await setIncome(page, 52000);
  await choose(page, 'What matters most to you?', 'I do not know yet');
  await choose(page, 'Who do you work for?', 'Nonprofit');
  let top = await readTopPick(page);
  let cards = [];
  for (const name of await openPlanNames(page)) cards.push(await readPlan(page, name));
  const cheapest = cards.filter(c => c.total !== null).reduce((a, b) => (b.total < a.total ? b : a));
  let pick = cards.find(c => c.name === top.name);
  const totalCost = sentences(await questionsText(page)).find(s => /total cost/i.test(s) && !/unless|except|public service|forgiveness/i.test(s));
  if (totalCost && pick.total > cheapest.total + 1) {
    problems.push(`With goal "I do not know yet" and Nonprofit, the hint says "${totalCost}" but the pick is ${pick.name} at ${usd(pick.total)} in total ` +
      `("${sentences(top.reason)[0]}") while ${cheapest.name} totals ${usd(cheapest.total)}`);
  }

  // C. Goal "Going for forgiveness", Private sector: a plan called close on every measure has to be close.
  await choose(page, 'What matters most to you?', 'Going for forgiveness');
  await choose(page, 'Who do you work for?', 'Private sector');
  top = await readTopPick(page);
  cards = [];
  for (const name of await openPlanNames(page)) cards.push(await readPlan(page, name));
  pick = cards.find(c => c.name === top.name);
  const far = (x, y) => Math.abs(x - y) > 0.1 * Math.max(x, y);
  for (const c of cards) {
    if (c !== pick && /close to the top pick on every measure/i.test(c.text) && (far(c.monthly, pick.monthly) || far(c.total, pick.total))) {
      problems.push(`${c.name} says "Close to the top pick on every measure" at ${usd(c.monthly)} a month and ${usd(c.total)} in total, against ${pick.name}'s ${usd(pick.monthly)} and ${usd(pick.total)}`);
    }
  }

  // D. Employer "Not sure" with goal forgiveness: the hint must not promise what the pick then does not do.
  await choose(page, 'Who do you work for?', 'Not sure');
  top = await readTopPick(page);
  const leaveOut = sentences(await questionsText(page)).find(s => /leave forgiveness out/i.test(s) && !/unless|except|goal/i.test(s));
  if (leaveOut && /among the plans\b[^.]*\bearn/i.test(top.reason)) {
    problems.push(`With employer "Not sure" the hint says "${leaveOut}" beside a pick explained as "${quote(top.reason, /earn/i)}"`);
  }

  // E. RAP at its $10 floor: a payment under $50 cannot put $50 toward principal.
  const rapPage = await freshApp({ loans: [loan('rap-floor', 'Unsubsidized loan', { balance: 40000, rate: 7, date: '2022-09-01' })], profile: profile(), snapshots: null });
  await goTo(rapPage, 'plans');
  await setIncome(rapPage, 12000);
  const rap = await readPlan(rapPage, 'RAP', { detail: true });
  const principalClaim = quote(rap.text, /at least \$50 a month goes to principal/i);
  if (rap.monthly < 50 && principalClaim && !/lesser|whichever|smaller of|or (the|your) (whole |full )?payment|if (it|the payment|your payment) is (less|smaller|under)/i.test(principalClaim)) {
    problems.push(`RAP shows ${usd(rap.monthly)} a month yet says "${principalClaim}"; under 34 CFR 685.209(o)(2)(i) a payment under $50 lowers principal by the payment`);
  }

  // F. $5 extra on a $100,000 Standard loan saves no whole month, but it is not "paying only what is required".
  const payoff = await freshApp({ loans: [loan('big', 'Large loan', { balance: 100000, rate: 6.5, date: '2022-09-01' })], profile: profile({ selectedPlan: 'standard', extraPerMonth: 5 }), snapshots: null });
  await goTo(payoff, 'payoff');
  await expect(payoff.getByLabel('Extra each month', { exact: true })).toHaveValue('5');
  const spoken = payoff.getByRole('status');
  // The screen-reader sentence is debounced by 700ms; a fix may word it without a year, so never fail on the wait.
  await expect.poll(async () => (await spoken.allTextContents()).join(' '), { timeout: 3000 }).toMatch(/\d{4}/).catch(() => {});
  const onlyRequired = /only what is required|required amount only/i;
  const payoffText = await payoff.locator('#main').innerText();
  if (onlyRequired.test(payoffText)) problems.push(`With $5 extra a month entered, Payoff says "${quote(payoffText, onlyRequired)}"`);
  const said = (await spoken.allTextContents()).map(s => s.trim()).find(s => onlyRequired.test(s));
  if (said) problems.push(`With $5 extra a month entered, the screen-reader summary says "${said}"`);

  // G. Two loans that both owe $5,000 at 6%: neither is smaller or larger than the other.
  const twins = await freshApp({
    loans: [loan('twin-a', 'Twin loan A', { balance: 5000, rate: 6, date: '2022-09-01' }), loan('twin-b', 'Twin loan B', { balance: 5000, rate: 6, date: '2023-09-01' })],
    profile: profile({ selectedPlan: 'standard' }), snapshots: null,
  });
  await goTo(twins, 'payoff');
  for (const order of ['Highest rate first', 'Smallest balance first']) {
    await choose(twins, 'Payoff order', order);
    for (const row of await twins.getByRole('listitem').filter({ hasText: /Twin loan/ }).allInnerTexts()) {
      const claim = row.split('\n').map(s => s.trim().replace(/^Extra goes here\s*/i, ''))
        .find(s => /smaller of the loans|larger balance than the one above|^Largest balance/i.test(s));
      if (claim) problems.push(`Two loans that both owe $5,000 at 6%: under "${order}" one is described as "${claim}"`);
    }
  }
  expectNoProblems(problems);
});

test('MONEY-17 the loan form never calls a filled-in rate published for an award year that has no published rate', async ({ page }) => {
  knownIssue('MONEY-17');
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const date = page.getByLabel('Date it was paid out');
  const rate = page.getByLabel('Interest rate');
  const problems = [];
  // The published table this form fills from ends at 2026–27, so 2098–99 has no published rate.
  const negated = /\b(no|not|isn['’]t|hasn['’]t|without|yet to be|unpublished)\b/i;
  const falseClaim = (hint, value, year) => sentences(hint).some(s => !negated.test(s) &&
    (new RegExp(`published (undergraduate )?rate for ${year}`, 'i').test(s) || (value !== '' && /filled in the published/i.test(s))));

  await date.fill('2098-09-01');
  await expect(date).toHaveValue('2098-09-01');
  let hint = await describedBy(rate);
  let value = await rate.inputValue();
  if (falseClaim(hint, value, '2098[–-]99')) problems.push(`A loan paid out 09/01/2098 gets the rate "${value}" with the note "${hint}", but no rate is published for 2098–99`);

  await rate.fill('7.01');
  hint = await describedBy(rate);
  if (falseClaim(hint, '', '2098[–-]99')) problems.push(`With 7.01% typed for a loan paid out 09/01/2098 the note says "${hint}"`);

  // A five-digit year, which the date field accepts when typed. A fix may refuse it, which is also fine.
  await rate.fill('');
  await date.fill('');
  await date.pressSequentially('090120260');
  if (/^\d{5,}-/.test(await date.inputValue())) {
    hint = await describedBy(rate);
    value = await rate.inputValue();
    if (falseClaim(hint, value, '\\s*\\.')) problems.push(`A loan paid out 09/01/20260 gets the rate "${value}" with the note "${hint}"`);
  }
  expectNoProblems(problems);
});

test('MONEY-18 the summary\'s interest added equals the loan rows, and a principal nobody entered is never shown as borrowed', async ({ page, freshApp }) => {
  knownIssue('MONEY-18');
  const problems = [];
  const a = 'Loan A, paid down';
  const b = 'Loan B, grown';
  await openApp(page, {
    loans: [
      loan('paid-down', a, { principal: 10000, balance: 9000, rate: 6, date: '2022-09-01' }),
      loan('grown', b, { principal: 5000, balance: 7000, rate: 6, date: '2023-09-01' }),
    ],
    profile: profile(), snapshots: null,
  });
  const check = async situation => {
    const rows = [];
    for (const name of [a, b]) {
      const { text } = await openLoanRow(page, name);
      const m = text.match(/Interest added so far \$([\d,]+)/);
      rows.push(m ? dollars(m[1]) : 0);
    }
    const summary = await readSummary(page);
    const sum = rows.reduce((s, n) => s + n, 0);
    if (Math.abs(summary.interest - sum) > 1) {
      problems.push(`${situation}: the summary ${summary.interest ? `says "Interest added so far ${usd(summary.interest)}"` : 'shows no interest added'} ` +
        `but the loan rows say ${rows.map(usd).join(' and ')} (${usd(sum)} together)`);
    }
    const legend = summary.legend.reduce((s, n) => s + n, 0);
    if (summary.legend.length && Math.abs(legend - summary.owe) > 1) {
      problems.push(`${situation}: the summary legend ${summary.legend.map(usd).join(' + ')} does not add up to the ${usd(summary.owe)} owed`);
    }
  };
  await check('A $10,000 loan now owing $9,000 and a $5,000 loan now owing $7,000');
  await editBalance(page, a, 5000);
  await editBalance(page, b, 6000);
  await check('After editing them to owe $5,000 and $6,000');

  // A loan saved through the form without "Amount you first borrowed".
  const fresh = await freshApp({ seeded: false });
  await fresh.getByRole('button', { name: 'Add my first loan' }).click();
  await fresh.getByRole('button', { name: '2024–25' }).click();
  await fresh.getByLabel('What you owe on it today').fill('12345');
  await fresh.getByRole('button', { name: 'Save loan' }).click();
  const row = await openLoanRow(fresh, '2024–25 subsidized');
  if (/First borrowed \$12,345/.test(row.text)) {
    problems.push('A loan saved without "Amount you first borrowed" shows "First borrowed $12,345", the balance, as if the borrower had entered it');
  }
  await editBalance(fresh, '2024–25 subsidized', 12900);
  const after = await readSummary(fresh);
  if (/Borrowed \$12,345/.test(after.text) || after.interest) {
    problems.push(`After editing that loan to owe $12,900 the summary reads "${after.text.replace(/^.*?(Borrowed)/, '$1')}", ` +
      'interest worked out from a principal that was never entered');
  }
  expectNoProblems(problems);
});

test('MONEY-19 a balance change in Records shows the cents that changed, and Hide dollar amounts still blurs them', async ({ page }) => {
  knownIssue('MONEY-19');
  const x = balance => loan('rec-x', 'Loan X', { principal: 2000, balance, rate: 6.53, date: '2024-09-01' });
  const y = balance => loan('rec-y', 'Loan Y', { principal: 2000, balance, rate: 6.53, date: '2024-09-01' });
  const moves = [['Loan X', 2256.6, 2256.9], ['Loan Y', 2256.49, 2256.5]];
  await openApp(page, {
    loans: [x(2256.9), y(2256.5)],
    profile: profile(),
    snapshots: [
      { takenAt: '2026-09-01T15:00:00.000Z', loans: [x(2256.6), y(2256.49)], totalBalance: 2256.6 + 2256.49 },
      { takenAt: '2026-10-01T15:00:00.000Z', loans: [x(2256.9), y(2256.5)], totalBalance: 2256.9 + 2256.5 },
    ],
  });
  await goTo(page, 'records');
  const problems = [];
  for (const [name, before, after] of moves) {
    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
    const figures = [...text.matchAll(/\$[\d,]+(?:\.\d+)?/g)].map(m => dollars(m[0]));
    const showsBoth = [before, after].every(v => figures.some(f => Math.abs(f - v) < 0.005));
    const showsChange = figures.some(f => Math.abs(f - (after - before)) < 0.005);
    if (!showsBoth && !showsChange) {
      problems.push(`Records lists "${text}" for a balance that moved from ${usdCents(before)} to ${usdCents(after)}, so the ${usdCents(after - before)} change does not show`);
    }
  }
  const hide = page.getByRole('button', { name: 'Hide dollar amounts' });
  await hide.click();
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  for (const [name] of moves) {
    const readable = await unblurredAmounts(page.getByRole('listitem').filter({ hasText: name }));
    if (readable.length) problems.push(`With Hide dollar amounts on, the ${name} row still shows ${readable.join(', ')}`);
  }
  expectNoProblems(problems);
});

test('MONEY-20 the Payoff note\'s first-payment month agrees with the debt-free date it shows', async ({ page }) => {
  knownIssue('MONEY-20');
  await page.clock.setFixedTime(AUDIT_CLOCK); // 16 November 2026
  await openApp(page, { loans: [loan('small', 'Small loan', { balance: 100, rate: 6, date: '2022-09-01' })], profile: profile({ selectedPlan: 'standard', extraPerMonth: 200 }), snapshots: null });
  await goTo(page, 'payoff');
  const { text, finish, done } = await payoffMonths(page);
  const note = quote(text, /payments? (start|begin)|first payment/i);
  // One payment of about $201 clears $100 plus a month's interest, so the loan is gone in the month of the first payment.
  const named = note.match(new RegExp(`\\b(?:${MONTHS}) \\d{4}\\b`))?.[0];
  const first = named ?? (/this month/i.test(note) ? 'November 2026' : /next month/i.test(note) ? 'December 2026' : null);
  expect(first, `Payoff no longer says when the first payment is made (found "${note}")`).not.toBeNull();
  const short = `${first.slice(0, 3)} ${first.slice(-4)}`;
  const wrong = [
    finish && finish !== first && `"You would finish in ${finish}"`,
    done && done.toLowerCase() !== short.toLowerCase() && `Done ${done}`,
  ].filter(Boolean);
  expect(finish ?? done, 'Payoff shows no debt-free month').toBeTruthy();
  expect(wrong, `Payoff says "${note}", so one payment that clears a $100 loan should finish in ${first}, ` +
    `but it shows ${wrong.join(' and ')} (clock: 16 November 2026)`).toEqual([]);
});

test('MONEY-21 a household of 10 can enter its size, and RAP is priced for 10 people', async ({ page }) => {
  knownIssue('MONEY-21');
  await openApp(page, { loans: [loan('family', 'Graduate loan', { balance: 60000, rate: 6, date: '2022-09-01' })], profile: profile({ employment: 'private' }), snapshots: null });
  await goTo(page, 'plans');
  await setIncome(page, 80000);
  const expected = rapPayment(80000, 10); // $16.67: 7% of $80,000 over 12, less $50 for each of 9 dependents
  const household = page.getByLabel('People in your household');
  if ((await household.evaluate(el => el.tagName)) === 'SELECT') {
    const options = await household.locator('option').evaluateAll(os => os.map(o => ({ value: o.value, label: o.textContent.trim() })));
    const largest = options.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
    await setHousehold(page, Number(largest.value));
    const atLargest = await readPlan(page, 'RAP');
    expect(options.map(o => o.value), `"People in your household" stops at "${largest.label}", so a family of 10 at $80,000 is priced as ${largest.value}: ` +
      `RAP shows ${usd(atLargest.monthly)} a month where 10 people pay ${usd(expected)} (${usdCents(expected)})`).toContain('10');
  }
  await setHousehold(page, 10);
  const rap = await readPlan(page, 'RAP');
  expect(near(rap.monthly, expected), `A household of 10 at $80,000 sees RAP at ${usd(rap.monthly)} a month; the rule gives ${usdCents(expected)}`).toBe(true);
  await page.reload();
  await page.locator('#main').waitFor();
  await goTo(page, 'plans');
  await expect(page.getByLabel('People in your household'), 'the household size of 10 is kept after a reload').toHaveValue('10');
  expect(near((await readPlan(page, 'RAP')).monthly, expected), 'RAP is still priced for 10 people after a reload').toBe(true);
});

test('MONEY-22 a 0% rate is either saved as 0% or refused with a message that says why', async ({ page, freshApp }) => {
  knownIssue('MONEY-22');
  const addLoan = async (tab, rateText) => {
    await tab.getByRole('button', { name: 'Add my first loan' }).click();
    await tab.getByRole('button', { name: '2022–23' }).click();
    await tab.getByLabel('What you owe on it today').fill('1000');
    await tab.getByLabel('Interest rate').fill(rateText);
    await tab.getByRole('button', { name: 'Save loan' }).click();
    await expect(tab.getByRole('alert').or(tab.getByRole('heading', { name: 'Your loan' })).first()).toBeVisible();
    return (await stored(tab, KEYS.loans)) ?? [];
  };
  await openApp(page, { seeded: false });
  const saved = await addLoan(page, '0');
  if (saved.length) {
    // The fix that accepts 0%: it is stored as 0, and a blank rate is still refused.
    expect(saved.map(l => l.rate), 'a 0% loan is stored at 0%').toEqual([0]);
    const blank = await freshApp({ seeded: false });
    expect(await addLoan(blank, ''), 'a loan with a blank rate was saved').toEqual([]);
  } else {
    const message = await describedBy(page.getByLabel('Interest rate'));
    const allowsZero = /between 0 and|from 0 to|\b0 to 25|\b0\s*[–-]\s*25/i.test(message);
    const saysWhy = /(above|more than|greater than|over|higher than)\s+(0|zero)\b|at least 0?\.01/i.test(message);
    expect(saysWhy && !allowsZero, `Typing 0 in "Interest rate" and pressing Save loan stores ${saved.length} loans and says "${message}": ` +
      'the form refuses 0% while its message says 0 is allowed').toBe(true);
  }
});

test('MONEY-23 the plan count does not present the compared plans as all federal plans, and PAYE and ICR are named', async ({ page }) => {
  knownIssue('MONEY-23');
  await page.clock.setFixedTime(AUDIT_CLOCK); // a fix may date-gate this copy to before July 1, 2028
  // The shared eight loans, all paid out 2022 to 2025, going for PSLF at a nonprofit.
  await openApp(page, { profile: profile({ employment: 'nonprofit', goal: 'forgiveness' }), snapshots: null });
  const problems = [];
  const wholeList = /\b\d+ of (?:the )?6 federal plans\b(?! (?:we|that we|compared|shown|priced|on this page|here)\b)(?: are open to you\.?)?/i;
  const loansClaim = (await textOf(page.locator('#main'))).match(wholeList)?.[0];
  if (loansClaim) problems.push(`Loans says "${loansClaim}" though ED still offers PAYE and ICR on these loans until July 1, 2028 (6 of its 8 plans are open here)`);
  await goTo(page, 'plans');
  await setIncome(page, 65000);
  const top = await readTopPick(page);
  await expandAll(page.locator('#main'));
  const plans = await textOf(page.locator('#main'));
  const plansClaim = plans.match(wholeList)?.[0];
  if (plansClaim) problems.push(`Plans says "${plansClaim}" as if those were every federal plan`);
  const names = await openPlanNames(page);
  const legacyPriced = names.includes('PAYE') || names.includes('ICR');
  const heading = (await page.getByRole('heading', { name: /^All \d+ plans open to you$/ }).allInnerTexts())[0];
  if (heading && !legacyPriced) problems.push(`Plans is headed "${heading.trim()}" with PAYE and ICR left out`);
  const paye = (plans.match(/\bPAYE\b|Pay As You Earn/g) ?? []).length;
  const icr = (plans.match(/\bICR\b|Income-Contingent/gi) ?? []).length;
  if (!paye || !icr) problems.push(`Plans names PAYE ${paye} times and ICR ${icr} times, though both stay open to these loans until July 1, 2028`);
  if (/lowest payment among the plans/i.test(top.reason) && !names.includes('ICR') && !/compared here|shown here|ICR|not (priced|shown|included|compared)/i.test(top.reason)) {
    problems.push(`The pick, ${top.name} at ${usd(top.monthly)} a month, is called "${quote(top.reason, /lowest payment among/i)}" ` +
      'while ICR, not shown, can cost less (the audit measured $271.21 a month for these loans)');
  }
  expectNoProblems(problems);
});

test('MONEY-24 the Plans tab says SAVE has ended, about the 90-day window, the default plan and the 2028 end of PAYE and ICR', async ({ page }) => {
  knownIssue('MONEY-24');
  await page.clock.setFixedTime(AUDIT_CLOCK); // a fix may date-gate this notice, as its record suggests
  await openApp(page, { profile: profile({ employment: 'nonprofit', goal: 'forgiveness', income: 65000 }), snapshots: null });
  await goTo(page, 'plans');
  await expect(page.getByText('Where we would start', { exact: true })).toBeVisible();
  await expandAll(page.locator('#main'));
  const text = await textOf(page.locator('#main'));
  const required = {
    'that SAVE has ended': /\bSAVE\b|Saving on a Valuable Education/,
    'the 90-day window to choose a new plan': /\b90[\s-]days?\b/i,
    'which plan a borrower who does not choose lands on': /do nothing|don['’]t (pick|choose)|do not (pick|choose)|never (pick|choose)|without (picking|choosing)|no choice|if you ignore/i,
    'that PAYE and ICR end by July 1, 2028': /\b(PAYE|ICR)\b[^.]{0,200}\b2028\b|\b2028\b[^.]{0,200}\b(PAYE|ICR)\b/,
  };
  const missing = Object.entries(required).filter(([, re]) => !re.test(text)).map(([what]) => what);
  const count = re => (text.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`)) ?? []).length;
  expect(missing, `The Plans tab for 8 loans paid out 2022–25 (every section opened, 16 Nov 2026) never says ${missing.join('; ')} ` +
    `(SAVE ${count(/\bSAVE\b/)}, PAYE ${count(/\bPAYE\b/)}, ICR ${count(/\bICR\b/)}, "2028" ${count(/2028/)}, "90 day" ${count(/90[\s-]day/i)} mentions)`).toEqual([]);
});

// ------------------------------------------------------------------------------------------- regression guards

test('a loan paid out on July 1, 2014 is a new borrower\'s loan: IBR stays at 10% of discretionary income over 20 years', async ({ page }) => {
  await openApp(page, { loans: [loan('cutoff', 'Loan from July 2014', { balance: 40000, rate: 6.8, date: '2014-07-01' })], profile: profile(), snapshots: null });
  await goTo(page, 'plans');
  await setIncome(page, 60000);
  const shown = await readPlan(page, 'IBR');
  const pay = ibrPayment({ income: 60000, household: 1, balance: 40000, rate: 6.8, newBorrower: true }); // $300.50
  const path = idrPath(40000, 6.8, pay, 20); // 240 payments, $72,120, about $2,459 left
  expect(near(shown.monthly, pay), `IBR shows ${usd(shown.monthly)} a month; 10% of discretionary income is ${usdCents(pay)}`).toBe(true);
  expect(shown.termYears, `IBR runs ${shown.termLabel}; a new borrower's IBR runs 20 years`).toBe(20);
  expect(near(shown.total, path.totalPaid, 2), `IBR totals ${usd(shown.total)}; 240 payments of ${usdCents(pay)} are ${usd(path.totalPaid)}`).toBe(true);
});

test('RAP takes $50 a month off for each dependent, down to its $10 floor, at the largest household on the list', async ({ page }) => {
  await openApp(page, { loans: [loan('rap', 'Graduate loan', { balance: 60000, rate: 6, date: '2022-09-01' })], profile: profile({ employment: 'private' }), snapshots: null });
  await goTo(page, 'plans');
  await setHousehold(page, 8);
  for (const income of [80000, 50000]) {
    await setIncome(page, income);
    const rap = await readPlan(page, 'RAP');
    const rule = rapPayment(income, 8); // $116.67 at $80,000; the $10 floor at $50,000
    expect(near(rap.monthly, rule), `household of 8 at ${usd(income)}: RAP shows ${usd(rap.monthly)}, the rule gives ${usdCents(rule)}`).toBe(true);
  }
});

test('the first and last award years in the rate table fill in their published rates and name the year', async ({ page }) => {
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const date = page.getByLabel('Date it was paid out');
  const rate = page.getByLabel('Interest rate');
  await page.getByRole('button', { name: '2022–23' }).click();
  await expect(date).toHaveValue('2022-09-01');
  await expect(rate, 'the 2022–23 undergraduate rate is 4.99%').toHaveValue('4.99');
  expect(await describedBy(rate)).toContain('2022–23');
  await date.fill('2027-06-30');
  await expect(rate, 'June 30, 2027 is the last day of the 2026–27 award year, published at 6.52%').toHaveValue('6.52');
  expect(await describedBy(rate)).toContain('2026–27');
});

test('the rate field accepts its smallest and largest allowed rates, 0.01% and 25%, exactly as typed', async ({ page, freshApp }) => {
  const save = async (tab, rateText) => {
    await tab.getByRole('button', { name: 'Add my first loan' }).click();
    await tab.getByRole('button', { name: '2022–23' }).click();
    await tab.getByLabel('What you owe on it today').fill('1000');
    await tab.getByLabel('Interest rate').fill(rateText);
    await tab.getByRole('button', { name: 'Save loan' }).click();
    await expect(tab.getByRole('heading', { name: 'Your loan' }), `a ${rateText}% loan was refused`).toBeVisible();
    return ((await stored(tab, KEYS.loans)) ?? []).map(l => [l.balance, l.rate]);
  };
  await openApp(page, { seeded: false });
  expect(await save(page, '0.01')).toEqual([[1000, 0.01]]);
  expect(await save(await freshApp({ seeded: false }), '25')).toEqual([[1000, 25]]);
});

test('Extended is closed with its reason at $29,999.99 and open at $30,000.01, priced at the 25-year payment', async ({ page, freshApp }) => {
  await openApp(page, { loans: [loan('below', 'Loan just under', { balance: 29999.99, rate: 6.53, date: '2022-09-01' })], profile: profile(), snapshots: null });
  await goTo(page, 'plans');
  await openPlanNames(page);
  await expect(page.getByText('Requires more than $30,000 in Direct Loans')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Extended as my plan' })).toHaveCount(0);

  const above = await freshApp({ loans: [loan('above', 'Loan just over', { balance: 30000.01, rate: 6.53, date: '2022-09-01' })], profile: profile(), snapshots: null });
  await goTo(above, 'plans');
  const ext = await readPlan(above, 'Extended');
  const pay = amortized(30000.01, 6.53, 25); // $203.12
  expect(near(ext.monthly, pay), `Extended shows ${usd(ext.monthly)}; the 25-year payment is ${usdCents(pay)}`).toBe(true);
  expect(ext.termYears, `Extended runs ${ext.termLabel}`).toBe(25);
  expect(near(ext.total, pay * 300, 2), `Extended totals ${usd(ext.total)}; 300 x ${usdCents(pay)} is ${usd(pay * 300)}`).toBe(true);
});

test('a payoff counted from January 31 lands in January or February, never rolling over into March', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2027, 0, 31, 12, 0, 0)); // a month end, the classic setMonth rollover
  await openApp(page, { loans: [loan('small', 'Small loan', { balance: 100, rate: 6, date: '2022-09-01' })], profile: profile({ selectedPlan: 'standard', extraPerMonth: 200 }), snapshots: null });
  await goTo(page, 'payoff');
  const { finish, done } = await payoffMonths(page);
  // One payment clears it, made this month or next depending on the app's timing; either is honest, March is not.
  expect(['January 2027', 'February 2027'], `Payoff says "finish in ${finish}"`).toContain(finish);
  if (done) expect(done.toLowerCase(), 'the Done figure names the same month').toBe(`${finish.slice(0, 3)} 2027`.toLowerCase());
});
