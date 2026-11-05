// Helpers that only money-core.spec.mjs needs.
//
// The arithmetic here is written from the regulations and the audit's issue records, not from the app's code,
// so a test can say what a figure should be without asking the app. The readers turn what the page shows into
// numbers, and never wait for something that may not exist: a missing figure comes back as null, so a test
// fails at its own assertion with the measured values, never on a selector timeout.

// ---------------------------------------------------------------- arithmetic

/** 2026 HHS poverty guideline, 48 contiguous states and DC: $15,960 plus $5,680 per extra person. */
export const povertyLine = household => 15960 + 5680 * (Math.max(1, household) - 1);

/** IBR for a new borrower, 34 CFR 685.209(f)(1)(ii): 10% of income above 150% of the poverty line, over 12. */
export const ibrMonthly = (income, household = 1) => (Math.max(0, income - 1.5 * povertyLine(household)) * 0.1) / 12;

/** RAP, 34 CFR 685.209(b)(2) brackets ("not more than"), (f)(5) $50 per dependent, (g)(3)(ii) $10 floor. */
export function rapMonthly(income, household = 1) {
  const brackets = [[10000, null], [20000, 0.01], [30000, 0.02], [40000, 0.03], [50000, 0.04],
    [60000, 0.05], [70000, 0.06], [80000, 0.07], [90000, 0.08], [100000, 0.09]];
  const hit = brackets.find(([ceiling]) => income <= ceiling);
  const base = !hit ? income * 0.1 : hit[1] === null ? 120 : income * hit[1];
  return Math.max(10, base / 12 - 50 * (Math.max(1, household) - 1));
}

/** Level payment that repays `balance` in `months` at an annual percentage rate. */
export function amortized(balance, ratePct, months) {
  const r = ratePct / 1200;
  return r ? (balance * r) / (1 - Math.pow(1 + r, -months)) : balance / months;
}

export const totalOf = loans => loans.reduce((s, l) => s + l.balance, 0);
export const blendedRate = loans => loans.reduce((s, l) => s + l.balance * l.rate, 0) / totalOf(loans);

/** Every loan amortized on its own at its own rate over the same term, as a servicer bills a fixed plan. */
export function loanByLoan(loans, months) {
  const monthly = loans.reduce((s, l) => s + amortized(l.balance, l.rate, months), 0);
  return { monthly, interest: monthly * months - totalOf(loans) };
}

/** A fixed payment until the balance clears, the last payment being whatever is left. */
export function payDown(balance, ratePct, payment, maxMonths = 1200) {
  const r = ratePct / 1200;
  let owed = balance;
  let paid = 0;
  let months = 0;
  while (owed > 0.005 && months < maxMonths) {
    const due = Math.min(payment, owed * (1 + r));
    owed = owed * (1 + r) - due;
    paid += due;
    months++;
  }
  return { months, paid, interest: paid - balance, cleared: owed <= 0.005 };
}

/**
 * IBR while the borrower stays on it, 34 CFR 685.209(j)(2): unpaid interest sits beside principal and earns no
 * interest, and each payment goes to accrued interest first. Returns what is paid and what is left.
 */
export function ibrSimple(balance, ratePct, payment, months) {
  const r = ratePct / 1200;
  let principal = balance;
  let unpaid = 0;
  let paid = 0;
  for (let m = 0; m < months && principal + unpaid > 0.005; m++) {
    unpaid += principal * r;
    const pay = Math.min(payment, principal + unpaid);
    const toInterest = Math.min(pay, unpaid);
    unpaid -= toInterest;
    principal -= pay - toInterest;
    paid += pay;
  }
  return { paid, left: principal + unpaid };
}

/**
 * RAP, 34 CFR 685.209(h)(4)(i) and (o)(2)(i): interest the payment does not cover is waived, and when the payment
 * moves principal by less than $50, ED's match makes up the difference. Returns what is paid and what is left.
 */
export function rapPath(balance, ratePct, payment, months) {
  const r = ratePct / 1200;
  let owed = balance;
  let paid = 0;
  for (let m = 0; m < months && owed > 0.005; m++) {
    const interest = owed * r;
    const pay = Math.min(payment, owed + interest);
    const charged = Math.min(interest, pay);
    const toPrincipal = pay - charged;
    owed -= toPrincipal;
    if (toPrincipal < 50) owed -= Math.min(50, pay) - toPrincipal;
    paid += pay + Math.min(0, owed);
    owed = Math.max(0, owed);
  }
  return { paid, left: owed };
}

/**
 * The lowest starting payment any Graduated schedule can have if it keeps the app's own shape (five levels, one
 * step every 24 months, repaid in 120) and the last payment is at most three times the first, 34 CFR
 * 685.208(b)(6)(i) and (iii). A smaller step ratio only raises the start, so this is a floor for every fix.
 */
export function graduatedLowestStart(balance, ratePct) {
  const r = ratePct / 1200;
  const g = Math.pow(3, 1 / 4);
  const level = r ? (1 - Math.pow(1 + r, -24)) / r : 24;
  let pv = 0;
  for (let s = 0; s < 5; s++) pv += Math.pow(g, s) * level * Math.pow(1 + r, -24 * s);
  return balance / pv;
}

// ---------------------------------------------------------------- reading the page

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const MONTH_YEAR = new RegExp(`\\b(${MONTHS.join('|')}) (\\d{4})\\b`);

/** Every dollar figure in a piece of text, as numbers. "$1,234.50" gives 1234.5. */
export const dollars = text => [...String(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')));

/** The first dollar figure in a piece of text, or null. */
export const moneyOf = text => dollars(text ?? '')[0] ?? null;

/** A typed field's text as a number: "52,000.50" gives 52000.5, "" gives null. */
export const fieldNumber = text => (/\d/.test(text) ? Number(String(text).replace(/[^\d.]/g, '')) : null);

export const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
export const usdCents = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "10 yr", "25.3 yr", "7 mo" to months. */
export function termMonths(label) {
  const m = String(label).match(/([\d.]+)\s*(yr|mo)/);
  if (!m) return null;
  return m[2] === 'yr' ? Number(m[1]) * 12 : Number(m[1]);
}

/** The browser's own calendar month, which is what the app counts debt-free dates from. */
export const browserMonth = page => page.evaluate(() => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
});

/** Months from `now` to the first "Month YYYY" after `lead` in the text, or null when there is no such date. */
export function monthsUntilDate(text, now, lead = /(?:Debt free in|finish in|gone in|done)\s+/) {
  const m = String(text).match(new RegExp(lead.source + MONTH_YEAR.source));
  if (!m) return null;
  return (Number(m[2]) - now.year) * 12 + (MONTHS.indexOf(m[1]) - now.month);
}

/** Waits two animation frames, so React has committed and the page has painted after an input. */
export const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// A card's disclosure reads "How this plan works" / "Hide the detail" today, and "How IBR works" / "Hide the IBR
// detail" once each one names its plan (A11Y-15). Both are accepted, so that fix does not break these readers.
const SHOW_DETAIL = /^How .+ works$/;
const HIDE_DETAIL = /^Hide the(?: .+)? detail$/;

/**
 * One plan's card on the Plans tab: the innermost element holding both the plan's heading and its
 * "How this plan works" control. Plan names are level-3 headings; the hero's name is level 2.
 */
export const planCard = (page, name) => page.locator('div')
  .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
  .filter({ has: page.getByRole('button', { name: new RegExp(`${SHOW_DETAIL.source}|${HIDE_DETAIL.source}`) }) })
  .last();

/** The card's button that makes this plan the one the app's numbers use ("Use IBR as my plan" today). */
export const useButton = (card, name) => card.getByRole('button', { name: new RegExp(`^Use ${name}\\b`) });

/** The names of the plans shown as open, in page order. */
export const openPlanNames = page => page.getByRole('heading', { level: 3 }).allInnerTexts();

/** A card's headline figures: monthly (the start, on Graduated), total and its term label. Null when unpriced. */
export async function cardFigures(card) {
  const text = (await card.count()) ? await card.innerText() : '';
  const month = text.match(/Per month(?:, to start)?\s*\$\s?([\d,]+)/);
  const total = text.match(/In total, over ([^\n$]+?)\s*\$\s?([\d,]+)/);
  return {
    text,
    perMonth: month ? Number(month[1].replace(/,/g, '')) : null,
    total: total ? Number(total[2].replace(/,/g, '')) : null,
    term: total ? total[1].trim() : null,
  };
}

/** Opens "How this plan works" on a card if it is closed. */
export async function openDetail(card) {
  const toggle = card.getByRole('button', { name: SHOW_DETAIL });
  if (await toggle.count()) await toggle.first().click();
  await card.getByRole('button', { name: HIDE_DETAIL }).first().waitFor();
}

/** The value beside a term in a description list (Plans detail, Payoff tiles), or null. */
export async function described(scope, term) {
  const dd = scope.getByRole('term').filter({ hasText: new RegExp(`^\\s*${term}\\s*$`, 'i') })
    .locator('xpath=following-sibling::dd[1]');
  return (await dd.count()) ? (await dd.first().innerText()).trim() : null;
}

// The recommendation's label: "Where we would start" today, "Our pick" after UX-17, and also spoken inside its
// heading as "Where we would start: Standard" after A11Y-17.
const HERO_LABEL = /^\s*(?:Where we would start|Our pick)\s*:?\s*/i;

/** The "Where we would start" panel: the plan it names and its text, or null when there is none. */
export async function hero(page) {
  const region = page.getByRole('region', { name: 'Recommended plan' });
  // Otherwise the nearest box around the visible label that also holds the plan's heading. A box holding plan
  // cards (level-3 headings) is not it: there the label is a card's "Our pick" badge and no panel is shown.
  const label = page.locator('xpath=//*[not(ancestor-or-self::h2)]'
    + '[normalize-space(.)="Where we would start" or normalize-space(.)="Our pick"]');
  const panel = (await region.count()) ? region.first()
    : label.first().locator('xpath=ancestor::*[self::div or self::section][.//h2][1][not(.//h3)]');
  if (!(await panel.count())) return null;
  const name = (await panel.getByRole('heading', { level: 2 }).first().innerText()).replace(/\s+/g, ' ').trim();
  return {
    plan: name.replace(HERO_LABEL, ''),
    text: (await panel.innerText()).replace(/\s+/g, ' ').trim(),
  };
}

/** Types into a field the way a person does: click, select what is there, type key by key, leave the field. */
export async function typeInto(page, field, text) {
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.press('Backspace');
  if (text) await field.pressSequentially(text);
  await field.press('Tab');
  await frames(page);
}

export const incomeField = page => page.getByLabel('Yearly income, before tax');
// The typed field, not the slider beside it, which may come to share its name (A11Y-14).
export const extraField = page => page.getByRole('textbox', { name: /^Extra each month/ });

/** Payoff's main card: its headline (the first level-2 heading on the tab) and the text under it. */
export async function payoff(page) {
  const headline = page.getByRole('heading', { level: 2 }).first();
  await headline.waitFor();
  const card = page.locator('div').filter({ has: headline }).filter({ hasNotText: 'Where should extra money go?' }).last();
  return {
    headline: (await headline.innerText()).replace(/\s+/g, ' ').trim(),
    text: (await card.innerText()).replace(/\s+/g, ' ').trim(),
    interest: await described(card, 'Interest'),
  };
}

/** Text of every sentence in `text` that matches `re`. */
export const sentencesWith = (text, re) => String(text).split(/(?<=[.!?])\s+|\n+/).filter(s => re.test(s));
