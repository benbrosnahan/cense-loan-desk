// Helpers that only money-edges.spec.mjs needs: extra seeded browser contexts, readers for plan cards and
// sentences, and the federal formulas the money tests compare against. The formulas are written from the
// regulations and HHS tables, never imported from the app, so a test can catch the app being wrong.
import { test as base, expect, openApp } from '../helpers.mjs';

/**
 * `freshApp(data, { clock })` opens the app in a new browser context seeded with `data` (the options openApp
 * takes), so one test can compare several portfolios. `clock` fixes the page's Date before load.
 * Every context it opens is closed when the test ends.
 */
export const test = base.extend({
  freshApp: async ({ browser }, use, testInfo) => {
    const contexts = [];
    await use(async (data = {}, { clock } = {}) => {
      const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
      contexts.push(context);
      const page = await context.newPage();
      if (clock) await page.clock.setFixedTime(clock);
      await openApp(page, data);
      return page;
    });
    await Promise.all(contexts.map(c => c.close()));
  },
});

/** 16 November 2026 at noon, local time: inside the audit window, mid-month so no month boundary is near. */
export const AUDIT_CLOCK = new Date(2026, 10, 16, 12, 0, 0);

export function loan(id, nickname, { balance, principal = balance, rate, date, kind = 'direct_unsub', servicer = 'Nelnet' }) {
  return {
    id, nickname, servicer, kind,
    subsidy: kind === 'direct_sub' ? 'subsidized' : 'unsubsidized',
    principal, balance, rate, disbursementDate: date, minPayment: 0,
  };
}

export const profile = overrides => ({
  income: 0, householdSize: 1, employment: 'private', goal: 'least_total', extraPerMonth: 0, selectedPlan: null,
  ...overrides,
});

// ---------------------------------------------------------------- federal arithmetic, written independently

/** HHS 2026 poverty guideline, 48 contiguous states and DC: $15,960 for one person, $5,680 for each additional. */
export const povertyLine = size => 15960 + 5680 * (Math.max(1, size) - 1);

/** Level monthly payment that clears `balance` in `years`. */
export function amortized(balance, ratePct, years) {
  const n = years * 12;
  const r = ratePct / 1200;
  return r === 0 ? balance / n : (balance * r) / (1 - (1 + r) ** -n);
}

/**
 * IBR monthly payment, 34 CFR 685.209: 10% of discretionary income for a new borrower ((f)(2)), 15% for one who
 * owed a loan before July 1, 2014 ((f)(3)), capped at the 10-year Standard amount, then (g)(1)(iii): a
 * calculated amount under $5 is $0 and one from $5 up to $10 is $10.
 */
export function ibrPayment({ income, household, balance, rate, newBorrower }) {
  const calculated = (Math.max(0, income - 1.5 * povertyLine(household)) * (newBorrower ? 0.1 : 0.15)) / 12;
  const capped = Math.min(calculated, amortized(balance, rate, 10));
  return capped < 5 ? 0 : capped < 10 ? 10 : capped;
}

/** Month by month at a flat payment, charging all accrued interest: months paid, total paid, balance left. */
export function idrPath(balance, ratePct, payment, maxYears) {
  const r = ratePct / 1200;
  let left = balance;
  let totalPaid = 0;
  let months = 0;
  while (months < maxYears * 12 && left > 0.005) {
    const due = left * (1 + r);
    const pay = Math.min(payment, due);
    left = due - pay;
    totalPaid += pay;
    months++;
  }
  return { months, totalPaid, left };
}

/** RAP monthly payment, 34 CFR 685.209: the AGI bracket's share over 12, minus $50 per dependent, never under $10. */
export function rapPayment(agi, household) {
  const brackets = [[20000, 0.01], [30000, 0.02], [40000, 0.03], [50000, 0.04], [60000, 0.05],
    [70000, 0.06], [80000, 0.07], [90000, 0.08], [100000, 0.09]];
  const yearly = agi <= 10000 ? 120 : agi * (brackets.find(([top]) => agi <= top)?.[1] ?? 0.1);
  return Math.max(10, yearly / 12 - 50 * (Math.max(1, household) - 1));
}

// ---------------------------------------------------------------- formatting and comparison

export const dollars = s => Number(String(s).replace(/[^0-9.]/g, ''));
export const usd = n => (n === null || n === undefined ? '(no figure)' : `$${Math.round(n).toLocaleString('en-US')}`);
export const usdCents = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** True when a whole-dollar figure on screen is the honest rounding of `expected`. */
export const near = (shown, expected, tolerance = 0.5) => shown !== null && Math.abs(shown - expected) <= tolerance + 1e-9;
export const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const sentences = text => text.split(/\n+|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
/** The sentence of `text` that matches `re`, for quoting in a failure message. */
export const quote = (text, re) => sentences(text).find(s => re.test(s)) ?? '';

/** Fails once, listing every problem: the first line names the first one, each other one follows on its own line. */
export function expectNoProblems(problems) {
  const message = problems.length ? [problems[0], ...problems.slice(1).map(p => `  also: ${p}`)].join('\n') : '';
  expect(problems, message).toEqual([]);
}

// ---------------------------------------------------------------- reading the page

/**
 * Every text node under `locator`, case as authored (CSS uppercase does not apply), joined with spaces.
 * Collapsed disclosures are not in the DOM, so open them first with expandAll.
 */
export const textOf = locator => locator.evaluate(root => {
  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement?.closest('script, style')) parts.push(n.textContent);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
});

/** Opens every collapsed disclosure (aria-expanded="false") under `scope`. */
export async function expandAll(scope) {
  const closed = scope.getByRole('button', { expanded: false });
  for (let i = 0; i < 40 && (await closed.count()); i++) await closed.first().click();
}

/** The text a field's aria-describedby points at: its hint, or its error once it has one. */
export const describedBy = locator => locator.evaluate(el => (el.getAttribute('aria-describedby') || '')
  .split(/\s+/).filter(Boolean)
  .map(id => document.getElementById(id)?.textContent ?? '')
  .join(' ').replace(/^\s*!\s*/, '').replace(/\s+/g, ' ').trim());

/** Dollar figures under `locator` that a person could still read: no blurred, hidden or transparent ancestor. */
export const unblurredAmounts = locator => locator.evaluate(root => {
  const readable = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent;
    if (!/\$\s*\d|\d,\d{3}|\d\.\d{2}\b/.test(t)) continue;
    let hidden = false;
    for (let e = n.parentElement; e && !hidden; e = e === root ? null : e.parentElement) {
      const s = getComputedStyle(e);
      hidden = s.filter.includes('blur') || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0;
    }
    if (!hidden) readable.push(t.trim());
  }
  return readable;
});

export async function setIncome(page, amount) {
  const field = page.getByLabel('Yearly income, before tax');
  await field.fill(String(amount));
  await expect(field).toHaveValue(amount ? amount.toLocaleString('en-US') : '');
}

/** Sets the household size whether the field is a select (today) or a number input (one possible fix). */
export async function setHousehold(page, size) {
  const field = page.getByLabel('People in your household');
  if ((await field.evaluate(el => el.tagName)) === 'SELECT') await field.selectOption(String(size));
  else await field.fill(String(size));
  await expect(field).toHaveValue(String(size));
}

export async function choose(page, group, option) {
  const radio = page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option });
  await radio.click();
  await expect(radio).toBeChecked();
}

/** Names of the plans listed as open on the Plans tab (each open plan card has an h3). */
export async function openPlanNames(page) {
  const headings = page.getByRole('heading', { level: 3 });
  await expect(headings.first()).toBeVisible();
  return (await headings.allInnerTexts()).map(s => s.trim());
}

/** The open plan card headed `name`: the innermost block holding its heading and its detail toggle. */
export function planCard(page, name) {
  return page.locator('div')
    .filter({ has: page.getByRole('heading', { name, exact: true, level: 3 }) })
    .filter({ has: page.getByRole('button', { name: /^(How this plan works|Hide the detail)$/ }) })
    .last();
}

/** The figures an open plan card shows. With `detail`, opens "How this plan works" first. */
export async function readPlan(page, name, { detail = false } = {}) {
  const card = planCard(page, name);
  await expect(card).toContainText(/Per month|priced off what you earn/);
  if (detail) {
    const toggle = card.getByRole('button', { name: 'How this plan works' });
    if (await toggle.count()) await toggle.click();
    await expect(card).toContainText('Interest you would pay');
  }
  const text = await card.innerText();
  const monthly = text.match(/Per month(?:, to start)?\s*\$([\d,]+(?:\.\d+)?)/);
  const total = text.match(/In total, over ([\d.]+) (yr|mo)\s*\$([\d,]+(?:\.\d+)?)/);
  const interest = text.match(/Interest you would pay\s*\$([\d,]+(?:\.\d+)?)/);
  return {
    name,
    text,
    monthly: monthly ? dollars(monthly[1]) : null,
    total: total ? dollars(total[3]) : null,
    termLabel: total ? `${total[1]} ${total[2]}` : null,
    termYears: total ? Number(total[1]) / (total[2] === 'mo' ? 12 : 1) : null,
    interest: interest ? dollars(interest[1]) : null,
  };
}

/** The "Where we would start" recommendation: plan name, monthly figure and the reason given. */
export async function readTopPick(page) {
  const box = page.locator('div')
    .filter({ has: page.getByText('Where we would start', { exact: true }) })
    .filter({ has: page.getByRole('heading', { level: 2 }) })
    .last();
  await expect(box).toBeVisible();
  const name = (await box.getByRole('heading', { level: 2 }).innerText()).trim();
  const paragraphs = (await box.locator('p').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  const monthly = paragraphs.join('\n').match(/\$([\d,]+) a month/);
  const reason = paragraphs.filter(t => t.length > 40 && !/^An estimate/.test(t)).join(' ');
  return { name, reason, monthly: monthly ? dollars(monthly[1]) : null };
}

/** Text of the "Four questions" card, which holds the goal and employer hints. */
export async function questionsText(page) {
  const card = page.locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Four questions, so the plans fit you' }) })
    .last();
  return card.innerText();
}

/** Opens a loan row on the Loans tab: its detail panel and that panel's text. */
export async function openLoanRow(page, nickname) {
  const row = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(nickname)}\\b`) });
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator(`[id="${await row.getAttribute('aria-controls')}"]`);
  await expect(panel).toBeVisible();
  return { panel, text: (await panel.innerText()).replace(/\s+/g, ' ').trim() };
}

/** Edits a loan's balance through its row's Edit form, the way a person does. */
export async function editBalance(page, nickname, balance) {
  const { panel } = await openLoanRow(page, nickname);
  await panel.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('form', { name: 'Edit this loan' });
  await form.getByLabel('What you owe on it today').fill(String(balance));
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();
}

/** The Loans summary: what it says you owe, its legend figures, and its "Interest added so far" (0 when absent). */
export async function readSummary(page) {
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toBeVisible();
  const text = await textOf(summary);
  const owe = text.match(/You owe \$([\d,]+)/);
  const interest = text.match(/Interest added so far \$([\d,]+)/);
  const legend = (await summary.getByRole('definition').allInnerTexts()).map(t => (/[−-]\s*\$/.test(t) ? -1 : 1) * dollars(t));
  return { text, owe: owe ? dollars(owe[1]) : null, interest: interest ? dollars(interest[1]) : 0, legend };
}
