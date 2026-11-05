// Money core: the plan figures, the pick and the payoff projection a borrower acts on.
// Known issues MONEY-01 to MONEY-12 assert the corrected behaviour, so today they fail as expected. The tests
// without knownIssue() guard what the audit verified is right. Every expected dollar figure is worked out here,
// from the regulations, in ./support/money-core.mjs, never by calling the app's code.
import { test, expect, openApp, goTo, stored, knownIssue, KEYS, LOANS } from './helpers.mjs';
import {
  amortized, blendedRate, browserMonth, cardFigures, described, dollars, extraField, fieldNumber, frames,
  graduatedLowestStart, hero, ibrMonthly, ibrSimple, incomeField, loanByLoan, moneyOf, monthsUntilDate, openDetail,
  openPlanNames, payDown, payoff, planCard, povertyLine, rapMonthly, rapPath, sentencesWith, termMonths, totalOf,
  typeInto, usd, usdCents, useButton,
} from './support/money-core.mjs';

// The loan form reads typed dates in US order, the way this app's borrowers write them.
test.use({ locale: 'en-US' });

const loan = (nickname, balance, rate, disbursementDate, kind = 'direct_unsub') => ({
  id: `t-${nickname.replace(/\W+/g, '-').toLowerCase()}`, nickname, servicer: 'Nelnet', kind,
  subsidy: kind === 'direct_sub' ? 'subsidized' : 'unsubsidized',
  principal: balance, balance, rate, disbursementDate, minPayment: 0,
});

/** The app's own first-run answers, written out so a second page in the same browser starts from them too. */
const FRESH = { income: 0, householdSize: 1, employment: 'unsure', goal: 'unsure', extraPerMonth: 0, selectedPlan: null };

const BOTTOM_LINE = `$${totalOf(LOANS).toLocaleString('en-US')} over ${LOANS.length} loans`;

async function openPlans(page, loans, profile = FRESH) {
  await openApp(page, { loans, profile, snapshots: null });
  await goTo(page, 'plans');
  await page.getByRole('heading', { level: 2, name: /open to you/ }).first().waitFor();
}

/** Closes this page and opens another in the same browser, for a second portfolio within one test. */
async function anotherPage(page) {
  const next = await page.context().newPage();
  await page.close();
  return next;
}

const choose = (page, answer) => page.getByRole('radio', { name: answer, exact: true }).click();

/** Plans tab text with every plan's "How this plan works" open. */
async function plansWithDetail(page) {
  for (const name of await openPlanNames(page)) await openDetail(planCard(page, name));
  return page.locator('#main').innerText();
}

/**
 * Every place a priced plan card contradicts the figures on screen: interest above what the plan collects, or a
 * "$X more" or "$X less" in total than the pick that is not the gap between the two totals. Which plan is picked
 * is left to the fix (MONEY-01's own fix weighs the tax on a forgiven balance), so only the arithmetic is checked.
 */
async function costContradictions(page, situation) {
  const pick = await hero(page);
  const cards = {};
  for (const name of await openPlanNames(page)) {
    const card = planCard(page, name);
    const figures = await cardFigures(card);
    if (figures.total === null) continue;
    await openDetail(card);
    cards[name] = {
      ...figures,
      interest: moneyOf(await described(card, 'Interest you would pay')),
      text: await card.innerText(),
    };
  }
  const out = [];
  const top = pick && cards[pick.plan];
  for (const [name, c] of Object.entries(cards)) {
    if (c.interest !== null && c.interest > c.total + 1) {
      out.push(`${situation}: ${name} shows 'Interest you would pay ${usd(c.interest)}', more than its 'In total ${usd(c.total)}'`);
    }
    if (!top || name === pick.plan) continue;
    const gap = c.total - top.total;
    const between = `${name} totals ${usd(c.total)} and ${pick.plan} ${usd(top.total)}`;
    for (const m of c.text.matchAll(/\$([\d,]+) more (?:overall|in total)/g)) {
      const said = Number(m[1].replace(/,/g, ''));
      if (Math.abs(said - gap) > 1) out.push(`${situation}: ${name} says it costs '${m[0]}' than ${pick.plan}, but ${between}`);
    }
    for (const m of c.text.matchAll(/(?:costs|pays) \$([\d,]+) less(?! a month| each month| per month)/g)) {
      const said = Number(m[1].replace(/,/g, ''));
      if (Math.abs(said + gap) > 1) out.push(`${situation}: ${name} says '${m[0]}' than ${pick.plan}, but ${between}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- known issues

test('MONEY-01 every "more overall" figure is the gap between the totals on screen, and no plan shows more interest than it collects', async ({ page }) => {
  knownIssue('MONEY-01');
  await openPlans(page, LOANS);
  await choose(page, 'Pay the least overall');
  await choose(page, 'Private sector');
  await typeInto(page, incomeField(page), '40000');
  const problems = await costContradictions(page, 'income $40,000, Pay the least overall, Private sector');

  await choose(page, 'I do not know yet');
  await choose(page, 'Not sure');
  await typeInto(page, incomeField(page), '30000');
  problems.push(...await costContradictions(page, 'income $30,000, goal and employer left at their defaults'));

  expect(problems, `On ${BOTTOM_LINE}, the plan cards contradict their own figures:\n  ${problems.join('\n  ')}\n`).toEqual([]);
});

test('MONEY-02 a public-service borrower sees what 120 qualifying payments cost and what is left to cancel', async ({ page }) => {
  knownIssue('MONEY-02');
  await openPlans(page, [loan('2024–25 unsubsidized', 60000, 6.53, '2024-09-01')]);
  await choose(page, 'Going for forgiveness');
  await choose(page, 'Government');
  await typeInto(page, incomeField(page), '50000');

  const rapPay = rapMonthly(50000);
  const path = rapPath(60000, 6.53, rapPay, 120); // $20,000 paid, $54,000 left to cancel
  const ibrGap = ibrMonthly(50000) * 120 - path.paid; // IBR costs $6,060 more over the same 120 payments
  const shows = text => ({
    paidOver120Payments: dollars(text).some(v => Math.abs(v - path.paid) <= 1),
    leftToCancel: dollars(text).some(v => Math.abs(v - path.left) <= 1),
  });
  const rap = await cardFigures(planCard(page, 'RAP'));
  const ibrCard = planCard(page, 'IBR');
  const forgiveness = await plansWithDetail(page);
  const said = sentencesWith(forgiveness, /would still be left after/).filter(s => s.includes('30 years')).join(' ');
  expect(shows(forgiveness), `Going for forgiveness in government work on $60,000 at 6.53%, income $50,000: RAP is the pick, and 120 qualifying payments of ${usdCents(rapPay)} cost ${usd(path.paid)} and leave ${usd(path.left)} to cancel tax free, but neither figure is anywhere on Plans. The RAP card prices the 30-year path instead: 'In total, over ${rap.term} ${usd(rap.total)}', "${said}"`).toEqual({ paidOver120Payments: true, leftToCancel: true });

  // Only claims about the 120 payments: a full-term "more in total" is a different, legitimate figure.
  const ibrText = await ibrCard.innerText();
  const ibrClaims = [...ibrText.matchAll(/\$([\d,]+) more (?!a month)[^.$]*?\b120\b[a-z ]*/g)];
  for (const m of ibrClaims) {
    expect(Math.abs(Number(m[1].replace(/,/g, '')) - ibrGap), `IBR says it '${m[0].trim()}' than RAP; over the 120 payments that earn forgiveness the gap is ${usd(ibrGap)}`).toBeLessThanOrEqual(1);
  }

  await choose(page, 'Pay the least overall');
  const pick = await hero(page);
  expect(shows(await plansWithDetail(page)), `Asking to pay the least in government work, the pick is ${pick?.plan}, and nothing says that with 120 qualifying RAP payments the borrower would pay ${usd(path.paid)} and have ${usd(path.left)} cancelled`).toEqual({ paidOver120Payments: true, leftToCancel: true });
});

test('MONEY-03 Standard and Tiered Standard bill at least $50 a month and total what that payment really costs', async ({ page }) => {
  knownIssue('MONEY-03');
  await openPlans(page, [loan('2023–24 subsidized', 3500, 5.5, '2023-09-01', 'direct_sub')]);
  const standard = await cardFigures(planCard(page, 'Standard'));
  const floor = payDown(3500, 5.5, 50); // 85 payments, $4,230.30
  expect(standard.perMonth, `$3,500 at 5.5% on Standard shows ${usd(standard.perMonth)} a month and ${usd(standard.total)} over ${standard.term}. Standard bills at least $50 (34 CFR 685.208(b)(1)(ii)), which repays it in ${floor.months} payments totalling ${usdCents(floor.paid)}`).toBeGreaterThanOrEqual(50);
  expect(Math.abs(standard.total - floor.paid), `Standard on $3,500 at 5.5% totals ${usd(standard.total)} over ${standard.term}; at $50 a month it is ${floor.months} payments, ${usdCents(floor.paid)}`).toBeLessThanOrEqual(1);

  const tieredPage = await anotherPage(page);
  await openPlans(tieredPage, [loan('2026–27 subsidized', 3500, 6.52, '2026-09-01', 'direct_sub')]);
  const tiered = await cardFigures(planCard(tieredPage, 'Tiered Standard'));
  const tieredFloor = payDown(3500, 6.52, 50); // 89 payments, $4,416.03
  expect(tiered.perMonth, `Tiered Standard on $3,500 at 6.52% shows ${usd(tiered.perMonth)} a month`).toBeGreaterThanOrEqual(50);
  expect(Math.abs(tiered.total - tieredFloor.paid), `Tiered Standard on $3,500 at 6.52% bills ${usd(tiered.perMonth)} a month but totals ${usd(tiered.total)} over ${tiered.term}; at $50 a month it is repaid in ${tieredFloor.months} payments, ${usdCents(tieredFloor.paid)}`).toBeLessThanOrEqual(1);
});

test('MONEY-04 Graduated starts where a schedule within the 3x cap must start, and shows how high it climbs', async ({ page }) => {
  knownIssue('MONEY-04');
  await openPlans(page, LOANS);
  const graduated = await cardFigures(planCard(page, 'Graduated'));
  const start = graduated.perMonth;
  // Blended, as the card prices it today, or loan by loan: whichever floor is lower.
  const lowest = Math.min(
    graduatedLowestStart(totalOf(LOANS), blendedRate(LOANS)),
    LOANS.reduce((s, l) => s + graduatedLowestStart(l.balance, l.rate), 0),
  );
  expect(start, `Graduated on ${BOTTOM_LINE} starts at ${usd(start)} a month. Stepping up every two years and repaid in 10, a schedule whose last payment is at most 3 times its first (34 CFR 685.208(b)(6)) cannot start below ${usdCents(lowest)}; ${usd(start)} needs a last payment about 4.5 times the first`).toBeGreaterThanOrEqual(Math.floor(lowest));

  // Whatever else the card prices, the total and any "$X more/less" comparison are not the climb.
  const rest = graduated.text.replace(/In total, over [^$]*\$\s?[\d,]+/g, '').replace(/Not picked because[^\n]*/g, '')
    .replace(/\$[\d,]+ (?:more|less)\b[^.\n]*/g, '');
  const higher = dollars(rest).filter(v => v > start + 1);
  const peak = higher.length ? Math.max(...higher) : null;
  expect(peak, `The Graduated card shows a ${usd(start)} start and never says how high the payment climbs`).not.toBeNull();
  expect(peak, `Graduated climbs to ${usd(peak)}, more than 3 times its ${usd(start)} start`).toBeLessThanOrEqual(3 * start + 2);
});

test('MONEY-05 IBR leaves the balance that uncompounded unpaid interest gives after 20 years', async ({ page }) => {
  knownIssue('MONEY-05');
  await openPlans(page, [loan('2024–25 unsubsidized', 60000, 6.53, '2024-09-01')]);
  await typeInto(page, incomeField(page), '50000');
  const card = planCard(page, 'IBR');
  await openDetail(card);
  const pay = Math.min(ibrMonthly(50000), amortized(60000, 6.53, 120)); // $217.17, under $326.50 of monthly interest
  const rule = ibrSimple(60000, 6.53, pay, 240); // $86,240 left after 240 payments
  const text = await card.innerText();
  const said = sentencesWith(text, /forgiv|left after/i).filter(s => /\$/.test(s)).join(' ');
  expect(dollars(text).some(v => Math.abs(v - rule.left) <= 1), `IBR on $60,000 at 6.53%, income $50,000, pays ${usdCents(pay)} a month, less than the interest. The card says "${said}" Unpaid interest earns no interest while the borrower stays on IBR (34 CFR 685.209(j)(2)), so ${usd(rule.left)} is left after 240 payments`).toBe(true);
});

test('MONEY-06 Payoff runs the chosen plan: Graduated ends within its 10 years and IBR never runs past forgiveness', async ({ page }) => {
  knownIssue('MONEY-06');
  await openPlans(page, LOANS);
  await useButton(planCard(page, 'Graduated'), 'Graduated').click();
  await goTo(page, 'payoff');
  const now = await browserMonth(page);
  const graduated = await payoff(page);
  const graduatedEnds = monthsUntilDate(graduated.headline, now, /Debt free in\s+/);
  expect(graduatedEnds ?? Infinity, `Graduated is a 10-year plan (its card says 'over 10 yr'), but Payoff says "${graduated.headline}": ${graduated.text.split(/(?<=\.)\s/)[0]}`).toBeLessThanOrEqual(120);

  const ibrPage = await anotherPage(page);
  await openApp(ibrPage, {
    loans: [loan('2024–25 unsubsidized', 40000, 6.53, '2024-09-01')],
    profile: { ...FRESH, income: 52000, selectedPlan: 'ibr' },
    snapshots: null,
  });
  await goTo(ibrPage, 'payoff');
  const ibr = await payoff(ibrPage);
  const ibrEnds = monthsUntilDate(ibr.headline, now, /Debt free in\s+/);
  expect(ibrEnds ?? 0, `IBR on $40,000 at 6.53%, income $52,000, forgives what is left after 240 payments, but Payoff says "${ibr.headline}" (${ibrEnds} months away)`).toBeLessThanOrEqual(240);

  await ibrPage.getByRole('button', { name: '$25', exact: true }).click();
  const withExtra = await payoff(ibrPage);
  const claims = `${withExtra.headline} ${withExtra.text}`.match(/\d+ (?:years?|months?)(?: \d+ months?)? sooner|\$[\d,]+ less in interest/g) ?? [];
  expect(claims, `With $25 extra the IBR balance still runs to forgiveness at payment 240, so the extra saves no time and no interest, yet Payoff says "${withExtra.headline}"`).toEqual([]);
});

test('MONEY-07 a fixed plan shows one payment, one end date and one interest total on Plans and on Payoff', async ({ page }) => {
  knownIssue('MONEY-07');
  const mix = [
    loan('Undergrad 2020', 12000, 3.73, '2020-09-01'),
    loan('Undergrad 2022', 15000, 4.99, '2022-09-01'),
    loan('Graduate 2023', 40000, 6.54, '2023-09-01'),
    loan('Graduate 2024', 35000, 9.08, '2024-09-01'),
  ];
  await openPlans(page, mix);
  const card = planCard(page, 'Extended');
  const figures = await cardFigures(card);
  await openDetail(card);
  const cardInterest = moneyOf(await described(card, 'Interest you would pay'));
  const cardMonths = termMonths(await described(card, 'How long'));
  await useButton(card, 'Extended').click();
  await goTo(page, 'payoff');
  const now = await browserMonth(page);
  const shown = await payoff(page);
  const months = monthsUntilDate(shown.headline, now, /Debt free in\s+/);
  const payoffInterest = moneyOf(shown.interest);
  const each = loanByLoan(mix, 300); // $715.89 a month, $112,766 of interest, every loan clear at month 300
  const story = `Extended on $102,000 at 3.73% to 9.08%. Plans: ${usd(figures.perMonth)} a month, ${cardMonths} months, ${usd(cardInterest)} of interest. Payoff: "${shown.headline}" (${months} months), ${usd(payoffInterest)} of interest. Each loan repaid over 25 years at its own rate: ${usdCents(each.monthly)} a month, 300 months, ${usd(each.interest)}`;
  expect(months ?? Infinity, `${story}. Extended must repay within 25 years (34 CFR 685.208(b)(4))`).toBeLessThanOrEqual(300);
  expect(months, story).toBeGreaterThanOrEqual(cardMonths - 1);
  expect(Math.abs(payoffInterest - cardInterest), story).toBeLessThanOrEqual(1);
  expect(Math.abs(cardInterest - each.interest), story).toBeLessThanOrEqual(50);
  expect(Math.abs(figures.perMonth - each.monthly), story).toBeLessThanOrEqual(1);
});

test('MONEY-08 with income blank, the pick and its badges never claim a minimum over IBR and RAP, which are open but unpriced', async ({ page }) => {
  knownIssue('MONEY-08');
  const superlatives = /^(Lowest monthly payment|Lowest starting payment|Least interest overall)$/;
  const review = async target => {
    const names = await openPlanNames(target);
    const cards = await Promise.all(names.map(async name => ({ name, ...(await cardFigures(planCard(target, name))) })));
    const unpriced = cards.filter(c => c.perMonth === null).map(c => c.name);
    const badges = cards.flatMap(c => c.text.split('\n').map(l => l.trim()).filter(l => superlatives.test(l)).map(l => `${c.name} wears '${l}'`));
    return { pick: await hero(target), unpriced, badges };
  };

  await openPlans(page, [loan('2026–27 unsubsidized', 18000, 6.52, '2026-09-01')]);
  await choose(page, 'Going for forgiveness');
  await choose(page, 'Government');
  await frames(page);
  const forgiveness = await review(page);
  const problems = [];
  if (forgiveness.unpriced.length) {
    const waiting = `${forgiveness.unpriced.join(' and ')} (open, earns PSLF credit, waiting for income)`;
    if (forgiveness.pick?.plan === 'Tiered Standard') problems.push(`the pick is Tiered Standard, which never earns PSLF credit, over ${waiting}: "${forgiveness.pick.text}"`);
    else if (/none of the plans[^.]*earn[^.]*forgiveness/i.test(forgiveness.pick?.text ?? '')) problems.push(`the pick says no open plan earns forgiveness credit, beside ${waiting}`);
    problems.push(...forgiveness.badges.map(b => `${b} while ${forgiveness.unpriced.join(' and ')} cannot be priced`));
  }
  expect(problems, `Going for forgiveness in government work, income left blank, one $18,000 loan from 2026–27:\n  ${problems.join('\n  ')}\n`).toEqual([]);

  const legacy = await anotherPage(page);
  await openPlans(legacy, [loan('2024–25 unsubsidized', 40000, 6.53, '2024-09-01')]);
  await choose(legacy, 'Lowest monthly payment');
  await frames(legacy);
  const lowest = await review(legacy);
  const claims = [];
  if (lowest.unpriced.length) {
    const said = sentencesWith(lowest.pick?.text ?? '', /(smaller|smallest|lowest|least)\b[^.]*\bopen to you/i);
    claims.push(...said.map(s => `the pick (${lowest.pick.plan}) says "${s.trim()}" while ${lowest.unpriced.join(' and ')} could be $0 or $10`));
    claims.push(...lowest.badges.map(b => `${b} while ${lowest.unpriced.join(' and ')} cannot be priced`));
  }
  expect(claims, `'Lowest monthly payment', income left blank, $40,000 from 2024–25:\n  ${claims.join('\n  ')}\n`).toEqual([]);
});

test('MONEY-09 typing 0 as income prices IBR at $0 and RAP at $10, and the 0 stays visible after a reload', async ({ page }) => {
  knownIssue('MONEY-09');
  await openPlans(page, [loan('2024–25 unsubsidized', 30000, 6.53, '2024-09-01')]);
  const read = async () => ({
    field: await incomeField(page).inputValue(),
    ibr: (await cardFigures(planCard(page, 'IBR'))).perMonth,
    rap: (await cardFigures(planCard(page, 'RAP'))).perMonth,
  });
  const atZero = { field: '0', ibr: Math.round(ibrMonthly(0)), rap: Math.round(rapMonthly(0)) }; // $0 and $10

  await typeInto(page, incomeField(page), '0');
  const typed = await read();
  expect(typed, `Typed 0 in 'Yearly income, before tax': the field reads "${typed.field}" and IBR and RAP still say 'Add my income' (IBR ${typed.ibr ?? 'no price'}, RAP ${typed.rap ?? 'no price'}). With no income IBR is $0 a month and RAP $10 (34 CFR 685.209(f), (g)(3)(ii))`).toEqual(atZero);

  await page.reload();
  await page.locator('#main').waitFor();
  await goTo(page, 'plans');
  expect(await read(), 'a typed 0 survives a reload').toEqual(atZero);

  await typeInto(page, incomeField(page), '');
  expect(await read(), 'a cleared field means no income given, so IBR and RAP wait for it again').toEqual({ field: '', ibr: null, rap: null });
});

test('MONEY-10 a $0 IBR payment is a real plan: Payoff projects it and offers the extra-payment control', async ({ page }) => {
  knownIssue('MONEY-10');
  await openPlans(page, [loan('2024–25 unsubsidized', 5000, 6.53, '2024-09-01')]);
  await choose(page, 'Lowest monthly payment');
  await typeInto(page, incomeField(page), '20000');
  await useButton(planCard(page, 'IBR'), 'IBR').click();
  await goTo(page, 'payoff');
  const shown = await payoff(page);
  const controls = await extraField(page).count();
  const why = `IBR is chosen at ${usd(ibrMonthly(20000))} a month (income $20,000 is under 150% of the poverty line, ${usd(1.5 * povertyLine(1))}), yet Payoff says "${shown.headline}" and ${controls ? 'shows' : 'offers no'} 'Extra each month' field`;
  expect(shown.headline, why).not.toMatch(/^Pick a repayment plan/);
  expect(controls, why).toBe(1);

  await typeInto(page, extraField(page), '100');
  const now = await browserMonth(page);
  const withExtra = await payoff(page);
  const months = monthsUntilDate(`${withExtra.headline} ${withExtra.text}`, now);
  const clears = payDown(5000, 6.53, 100).months; // 59 months at $0 + $100
  expect(months, `$100 a month on top of the $0 IBR payment clears $5,000 at 6.53% in ${clears} months; Payoff says "${withExtra.headline}"`).not.toBeNull();
  expect(Math.abs(months - clears), `Payoff's date with $100 extra is ${months} months away, against ${clears}`).toBeLessThanOrEqual(1);

  const live = page.locator('output[aria-live]');
  const spoken = async () => ((await live.count()) ? (await live.first().textContent()) ?? '' : '');
  await expect.poll(spoken, { message: 'the screen-reader summary gives the new date', timeout: 3000 }).toMatch(/\d{4}/);
  expect(await spoken(), 'the screen-reader summary matches the page, which shows $100 extra').not.toContain('required amount only');
});

test('MONEY-11 a decimal point in income or extra is read as cents, never as more digits', async ({ page }) => {
  knownIssue('MONEY-11');
  await openPlans(page, LOANS);
  const income = incomeField(page);
  const rapAt = Math.round(rapMonthly(52000)); // $217, the same at $52,000.50
  const check = async how => {
    const field = await income.inputValue();
    const rap = (await cardFigures(planCard(page, 'RAP'))).perMonth;
    const why = `${how} as yearly income: the field reads "${field}" and RAP shows ${usd(rap)} a month, where $52,000.50 a year puts RAP at ${usd(rapAt)}`;
    expect(fieldNumber(field), why).toBeGreaterThanOrEqual(52000);
    expect(fieldNumber(field), why).toBeLessThanOrEqual(52000.5);
    expect(rap, why).toBe(rapAt);
  };

  await typeInto(page, income, '52000.50');
  await check('Typed 52000.50');

  await income.click();
  await income.press('ControlOrMeta+a');
  await page.keyboard.insertText('$52,000.50');
  await income.press('Tab');
  await frames(page);
  await check('Pasted $52,000.50');

  await useButton(planCard(page, 'Standard'), 'Standard').click();
  await goTo(page, 'payoff');
  await typeInto(page, extraField(page), '12.50');
  const field = await extraField(page).inputValue();
  const shown = await payoff(page);
  const why = `Typed 12.50 as extra each month: the field reads "${field}" and Payoff says "${shown.headline}"`;
  expect(fieldNumber(field), why).toBeLessThanOrEqual(12.5);
  expect(fieldNumber(field), why).toBeGreaterThanOrEqual(12);
  const said = shown.headline.match(/\$([\d,.]+) extra/);
  if (said) expect(Number(said[1].replace(/,/g, '')), why).toBeLessThanOrEqual(13);
});

test('MONEY-12 a date typed with a two-digit year is never saved as year 0026', async ({ page }) => {
  knownIssue('MONEY-12');
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByLabel('What you owe on it today').pressSequentially('20000');
  await page.getByLabel('Interest rate').pressSequentially('6.52');
  const date = page.getByLabel('Date it was paid out');
  await date.pressSequentially('070126'); // July 1, '26, the way people write it
  const read = await date.inputValue();
  await page.getByRole('button', { name: 'Save loan' }).click();
  await frames(page);

  const saved = (await stored(page, KEYS.loans)) ?? [];
  const thisYear = new Date().getFullYear();
  const implausible = saved.map(l => l.disbursementDate)
    .filter(d => !/^\d{4}-/.test(d) || Number(d.slice(0, 4)) < 1965 || Number(d.slice(0, 4)) > thisYear + 2);
  expect(implausible, `Typed 07/01/26 into 'Date it was paid out': the field read "${read}" and Save stored ${JSON.stringify(saved.map(l => l.disbursementDate))}. Year 0026 sorts before the July 1, 2026 cutoff, so the loan is treated as old and the plans it closes are shown as open`).toEqual([]);

  if (saved.length) {
    await goTo(page, 'plans');
    await page.getByRole('heading', { level: 2, name: /open to you/ }).first().waitFor();
    expect((await openPlanNames(page)).sort(), `the loan was saved as ${saved[0].disbursementDate}, so only the post-cutoff plans are open`).toEqual(['RAP', 'Tiered Standard']);
  } else {
    await expect(page.getByRole('button', { name: 'Save loan' }), 'nothing was saved, so the form stays open to fix the date').toBeVisible();
  }
});

// ------------------------------------------------------------------------------------------- guards

test('the July 1, 2026 cutoff is exact: June 30 keeps the older plans, July 1 leaves Tiered Standard and RAP and warns', async ({ page }) => {
  await openPlans(page, [loan('Senior-year loan', 18000, 6.39, '2026-06-30')]);
  const before = await openPlanNames(page);
  expect(before, 'a loan paid out June 30, 2026 keeps the older plans').toEqual(expect.arrayContaining(['Standard', 'Graduated', 'IBR', 'RAP']));
  expect(before).not.toContain('Tiered Standard');

  await goTo(page, 'loans');
  await page.getByRole('button', { name: /^Senior-year loan/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  // Warned in the form before saving, and on Loans after it; read by what the warning says, not its title.
  const warning = page.getByText(/(?:disbursed|paid out) on or after July 1, 2026/i).first();
  await expect(warning, 'June 30 needs no warning').toBeHidden();
  await page.getByLabel('Date it was paid out').fill('2026-07-01');
  await expect(warning, 'the form warns that this date changes the options').toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeHidden();
  await expect(warning, 'Loans keeps warning once the loan is saved').toBeVisible();

  await goTo(page, 'plans');
  await page.getByRole('heading', { level: 2, name: /open to you/ }).first().waitFor();
  expect((await openPlanNames(page)).sort(), 'one loan paid out July 1, 2026 leaves only the two new plans').toEqual(['RAP', 'Tiered Standard']);
});

test('Standard on one loan matches the amortization formula on Plans and on Payoff', async ({ page }) => {
  await openPlans(page, [loan('One loan', 50000, 6, '2024-09-01')]);
  const card = planCard(page, 'Standard');
  const pay = amortized(50000, 6, 120); // $555.10
  expect(await cardFigures(card)).toMatchObject({ perMonth: Math.round(pay), total: Math.round(pay * 120), term: '10 yr' });

  await useButton(card, 'Standard').click();
  await goTo(page, 'payoff');
  const now = await browserMonth(page);
  const shown = await payoff(page);
  expect([119, 120], `Payoff says "${shown.headline}"`).toContain(monthsUntilDate(shown.headline, now, /Debt free in\s+/));
  expect(moneyOf(shown.interest)).toBe(Math.round(pay * 120 - 50000)); // $16,612
});

test('IBR and RAP payments follow the regulation formulas for income and household size', async ({ page }) => {
  await openPlans(page, LOANS);
  await typeInto(page, incomeField(page), '52000');
  const read = async () => ({
    ibr: (await cardFigures(planCard(page, 'IBR'))).perMonth,
    rap: (await cardFigures(planCard(page, 'RAP'))).perMonth,
  });
  expect(await read(), 'household of 1').toEqual({ ibr: Math.round(ibrMonthly(52000, 1)), rap: Math.round(rapMonthly(52000, 1)) });
  await page.getByLabel('People in your household').selectOption('3');
  await frames(page);
  expect(await read(), 'household of 3').toEqual({ ibr: Math.round(ibrMonthly(52000, 3)), rap: Math.round(rapMonthly(52000, 3)) });
});

test('the chosen plan reads the same monthly payment in the summary, on its card and on Payoff', async ({ page }) => {
  await openPlans(page, LOANS);
  for (const plan of ['Standard', 'Graduated']) {
    await goTo(page, 'plans');
    const card = planCard(page, plan);
    const onCard = (await cardFigures(card)).perMonth;
    await useButton(card, plan).click();
    const summary = await page.getByRole('region', { name: 'Summary' }).innerText();
    await goTo(page, 'payoff');
    const shown = await payoff(page);
    const inSummary = moneyOf(summary.match(new RegExp(`\\$[\\d,]+[^$]*? on ${plan}\\b`))?.[0]);
    const onPayoff = moneyOf(shown.text.match(new RegExp(`\\b${plan}\\b[^$]*\\$[\\d,]+`, 'i'))?.[0]);
    expect({ inSummary, onPayoff }, `${plan}: card ${usd(onCard)}, summary "${summary.replace(/\s+/g, ' ')}", Payoff "${shown.text.slice(0, 60)}"`).toEqual({ inSummary: onCard, onPayoff: onCard });
    // $311 on the example loans, whether priced at the blended rate or loan by loan (the MONEY-07 fix).
    if (plan === 'Standard') {
      expect([Math.round(amortized(totalOf(LOANS), blendedRate(LOANS), 120)), Math.round(loanByLoan(LOANS, 120).monthly)]).toContain(onCard);
    }
  }
});

test('the extra-payment headline is the difference between the two schedules it summarises', async ({ page }) => {
  const balance = 30000;
  const rate = 6.53;
  await openApp(page, { loans: [loan('One loan', balance, rate, '2024-09-01')], profile: { ...FRESH, selectedPlan: 'standard' }, snapshots: null });
  await goTo(page, 'payoff');
  const now = await browserMonth(page);
  const required = await payoff(page);
  await page.getByRole('button', { name: '$100', exact: true }).click();
  const extra = await payoff(page);

  const pay = amortized(balance, rate, 120);
  const sooner = payDown(balance, rate, pay).months - payDown(balance, rate, pay + 100).months; // 34 months
  const words = extra.headline.match(/gets you out (?:(\d+) years?)? ?(?:(\d+) months?)? sooner/);
  const saved = moneyOf(extra.text.match(/about \$[\d,]+ less in interest/)?.[0]);
  const m0 = monthsUntilDate(required.headline, now, /Debt free in\s+/);
  const m1 = monthsUntilDate(extra.text, now, /finish in\s+/);
  const story = `$0 extra: "${required.headline}", interest ${required.interest}; $100 extra: "${extra.headline}", "${extra.text.slice(0, 160)}", interest ${extra.interest}`;
  expect(words, story).not.toBeNull();
  expect(Number(words[1] ?? 0) * 12 + Number(words[2] ?? 0), story).toBe(sooner);
  expect(m0 - m1, story).toBe(sooner);
  expect(Math.abs(saved - (moneyOf(required.interest) - moneyOf(extra.interest))), story).toBeLessThanOrEqual(10);
  expect(moneyOf(await described(page.locator('#main'), 'Monthly')), story).toBe(Math.round(pay + 100));
});

test('the loan form keeps the cents in a pasted balance', async ({ page }) => {
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const balance = page.getByLabel('What you owe on it today');
  await balance.click();
  await page.keyboard.insertText('$2,256.40');
  await expect(balance).toHaveValue('2,256.40');
  await page.getByRole('button', { name: '2024–25', exact: true }).click();
  await page.getByRole('button', { name: 'Save loan' }).click();
  await expect.poll(async () => (await stored(page, KEYS.loans))?.[0]?.balance).toBe(2256.4);
});
