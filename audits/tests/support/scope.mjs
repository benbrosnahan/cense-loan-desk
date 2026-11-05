// Helpers for scope.spec.mjs only: who and what the plan answers cover.
//
// The money half re-derives every expected figure from 34 CFR 685.208 and 685.209 and the 2026 HHS poverty
// guidelines. It imports nothing from the app, so a figure the app gets wrong cannot also be wrong here.
// The page half reads the Plans tab the way a person does: by headings, labels and the words on screen.
import { expect } from '../helpers.mjs';

// ---------------------------------------------------------------- money, from the rules

/** 2026 HHS poverty guidelines, 48 contiguous states and DC (ASPE). Each person above 6 adds $5,680. */
const POVERTY_2026 = [0, 15960, 21640, 27320, 33000, 38680, 44360];
export const povertyLine = size => (size <= 6 ? POVERTY_2026[size] : POVERTY_2026[6] + (size - 6) * 5680);

/** Level monthly payment that clears `balance` in `months` at `annualPct`. */
export function amortized(balance, annualPct, months) {
  const r = annualPct / 1200;
  return r ? (balance * r) / (1 - (1 + r) ** -months) : balance / months;
}

/** Months a level `payment` takes to clear `balance` at `annualPct` (fractional; the last payment is smaller). */
export function monthsToClear(balance, annualPct, payment) {
  const r = annualPct / 1200;
  return r ? -Math.log(1 - (balance * r) / payment) / Math.log(1 + r) : balance / payment;
}

export const totalOwed = loans => loans.reduce((sum, l) => sum + l.balance, 0);
export const blendedRate = loans => loans.reduce((sum, l) => sum + l.balance * l.rate, 0) / totalOwed(loans);

/** The 10-year Standard payment on today's balance: the IBR cap for someone starting IBR now (685.209(f)(2)(ii)). */
export const tenYearPayment = loans => amortized(totalOwed(loans), blendedRate(loans), 120);

/**
 * IBR for a new borrower (first loan after July 1, 2014): 10% of AGI above 150% of the poverty line for the
 * family size, over 12 (685.209(b)(1)(ii), (b)(4)(ii), (f)(2)), never above the cap.
 */
export const ibrMonthly = (agi, familySize, cap = Infinity) =>
  Math.min((Math.max(0, agi - 1.5 * povertyLine(familySize)) * 0.1) / 12, cap);

/**
 * RAP: the AGI bracket's percentage of all AGI ($120 a year at $10,000 or less), over 12, less $50 a month per
 * dependent, never below $10 (685.209(b)(2), (f)(5)).
 */
export function rapMonthly(agi, dependents) {
  const brackets = [[10000, null], [20000, 1], [30000, 2], [40000, 3], [50000, 4], [60000, 5], [70000, 6],
    [80000, 7], [90000, 8], [100000, 9], [Infinity, 10]];
  const pct = brackets.find(([ceiling]) => agi <= ceiling)[1];
  const yearly = pct === null ? 120 : (agi * pct) / 100;
  return Math.max(10, yearly / 12 - 50 * dependents);
}

/** "$1,234", rounded the way a whole-dollar display rounds. */
export const usd = n => (n === null || n === undefined ? 'nothing' : `$${Math.round(n).toLocaleString('en-US')}`);

/** True when a whole-dollar figure on screen is within a dollar of the exact amount. */
export const near = (shown, exact) => shown !== null && shown !== undefined && Math.abs(shown - Math.round(exact)) <= 1;

/** "November 2032": the calendar month `months` after `from`. */
export const monthAfter = (from, months) =>
  new Date(from.getFullYear(), from.getMonth() + months, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** Whole months from the month of `from` to a "November 2032" label, or null when the label is not a month. */
export function monthsUntil(from, label) {
  const d = new Date(`1 ${label}`);
  return isNaN(d) ? null : (d.getFullYear() - from.getFullYear()) * 12 + d.getMonth() - from.getMonth();
}

// ---------------------------------------------------------------- the page

export const PLAN_NAMES = ['Standard', 'Graduated', 'Extended', 'IBR', 'Tiered Standard', 'RAP'];
export const FIXED_PLANS = ['Standard', 'Graduated', 'Extended'];
const PLAN_HEADING = new RegExp(`^(${PLAN_NAMES.join('|')})$`);

const money = s => Number(s.replace(/[^\d.]/g, ''));

/** Picks one answer to a Plans question, the way a person taps it, and waits until it shows as chosen. */
export async function choose(page, name) {
  const option = page.getByRole('radio', { name, exact: true });
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

/** The income question. Its label may change from "Yearly income" to an AGI wording, so either is accepted. */
export const incomeField = page => page.getByRole('textbox', { name: /income|\bAGI\b/i }).first();

/** Types a yearly amount into the income question and waits for the page to take it. */
export async function typeIncome(page, amount) {
  const field = incomeField(page);
  await field.fill(String(amount));
  const digits = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',?');
  await expect(field).toHaveValue(new RegExp(`^\\$?\\s*${digits}(\\.0+)?$`));
}

/**
 * Answers the household question for `size` people: you plus your dependents. A fix may reword it ("You and your
 * dependents") or count dependents only, offering 0; then the same person answers `size - 1`.
 */
export async function setHousehold(page, size) {
  const select = page.getByRole('combobox', { name: /household|dependents|people/i }).first();
  const values = await select.locator('option').evaluateAll(options => options.map(o => o.value));
  const value = String(values.includes('0') ? size - 1 : size);
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

/** An open plan's card: the box that holds the plan's heading and its "Per month" figure. */
const planCard = (page, name) =>
  page.locator('div')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
    .filter({ hasText: /Per month/ })
    .last();

/**
 * The figures on an open plan's card, or null when the plan is not in the list of plans open to you.
 * `term` is the card's own words ("over 10 yr"), `years` the same as a number.
 */
export async function readPlan(page, name) {
  const card = planCard(page, name);
  if (!(await card.count())) return null;
  const text = await card.innerText();
  const monthly = text.match(/Per month[^$\n]*\s*\$([\d,]+)/);
  const total = text.match(/In total, over ([\d.]+) (yr|mo)\s*\$([\d,]+)/);
  return {
    text,
    monthly: monthly ? money(monthly[1]) : null,
    total: total ? money(total[3]) : null,
    years: total ? Number(total[1]) / (total[2] === 'mo' ? 12 : 1) : null,
    term: total ? `over ${total[1]} ${total[2]}` : 'no term shown',
  };
}

/** Names of the plans shown as open cards, top pick first. */
export const openPlans = async page =>
  (await page.getByRole('heading', { level: 3, name: PLAN_HEADING }).allInnerTexts()).map(s => s.trim());

/** The recommended plan and its monthly figure, read from the recommendation box, or null when there is none. */
export async function readPick(page) {
  const heading = page.getByRole('heading', { level: 2, name: PLAN_HEADING });
  if (!(await heading.count())) return null;
  const plan = (await heading.first().innerText()).trim();
  const above = await textAbovePlanList(page);
  const amount = above.match(new RegExp(`${plan}\\s*\\$([\\d,]+) a month(, to start)?`));
  return { plan, monthly: amount ? money(amount[1]) : null, label: amount ? `${plan} ${amount[0].slice(plan.length).trim()}` : plan };
}

/**
 * Everything a person reads on the Plans tab before the list of open plans: the summary, the questions, any notices
 * and the recommendation box. The list heading is found by role, so its wording ("All 4 plans open to you",
 * "4 plans here are open to you") can change.
 */
export async function textAbovePlanList(page) {
  const text = await page.locator('#main').innerText();
  const heading = page.getByRole('heading', { level: 2, name: /open to you/i });
  if (!(await heading.count())) return text;
  const at = text.indexOf(await heading.first().innerText());
  return at === -1 ? text : text.slice(0, at);
}

/** Opens every plan's "How this plan works" detail. */
export async function openPlanDetails(page) {
  const folded = page.getByRole('button', { name: 'How this plan works' });
  for (let left = await folded.count(); left > 0; left--) await folded.first().click();
}

/** The text of every open plan detail, with the plan it belongs to (the one card heading that contains it). */
export const planDetails = page =>
  page.locator('#main').evaluate(main =>
    [...main.querySelectorAll('button[aria-expanded="true"][aria-controls]')]
      .map(button => {
        let card = button;
        while (card && card.querySelectorAll('h3').length === 0) card = card.parentElement;
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        return card?.querySelectorAll('h3').length === 1 && panel
          ? { plan: card.querySelector('h3').innerText.trim(), text: panel.innerText }
          : null;
      })
      .filter(Boolean));

/** What a person reads at a form field: its label and the hint under it. */
export const fieldText = field =>
  field.evaluate(el => {
    let block = el;
    while (block.parentElement && !(block.querySelector('label') && [...block.querySelectorAll('label')].some(l => l.control === el))) {
      block = block.parentElement;
    }
    const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.innerText ?? '');
    const text = [block.innerText, ...described.filter(d => !block.innerText.includes(d))].join(' ');
    return text.replace(/\s+/g, ' ').trim();
  });

/** The first sentence (or line) of `text` that matches `pattern`, for quoting in a failure message. */
export const sentence = (text, pattern) =>
  text.split(/\n+/).flatMap(line => line.match(/[^.!?]+[.!?]?/g) || []).map(s => s.trim()).find(s => pattern.test(s)) ?? '';

// ---------------------------------------------------------------- loans typed into the form

/**
 * Adds a loan through the "Add a loan" form with real typing. `type` is matched against the loan type choices,
 * so it still finds "Unsubsidized" if the choices become "Direct Unsubsidized". `detail` fills fields under
 * "Add more detail" by label.
 */
export async function addLoan(page, { paidOut, type, owe, rate, detail = {} }) {
  const form = page.getByRole('form', { name: /loan/i });
  await form.getByLabel(/paid out|disburse/i).first().fill(paidOut);
  await form.getByRole('radio', { name: type }).first().click();
  await form.getByLabel(/What you owe/i).fill(owe);
  await form.getByLabel(/Interest rate/i).fill(rate);
  if (Object.keys(detail).length) {
    await form.getByRole('button', { name: 'Add more detail' }).click();
    for (const [label, value] of Object.entries(detail)) await form.getByLabel(new RegExp(label, 'i')).first().fill(value);
  }
  await form.getByRole('button', { name: 'Save loan' }).click();
  await form.waitFor({ state: 'detached' });
}

// ---------------------------------------------------------------- questions a fix may add
// SCOPE-02, -06 and -07 can only be fixed by asking something new. These helpers answer such a question if the page
// asks it, in the person's own terms, and do nothing when it does not, so the final assertion measures the outcome.

/** Text boxes and number fields, with the words a person reads as their names. */
async function namedFields(page) {
  const fields = page.getByRole('textbox').or(page.getByRole('spinbutton'));
  const names = await fields.evaluateAll(els => els.map(el =>
    [...(el.labels || [])].map(l => l.innerText).join(' ') || el.getAttribute('aria-label') || ''));
  return names.map((name, i) => ({ name: name.replace(/\s+/g, ' ').trim(), field: fields.nth(i) }));
}

/** The words a person reads as a control's name: its aria-label, the text it points to, its labels or its own text. */
const nameOf = control => control.evaluate(el => {
  const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.innerText ?? '').join(' ');
  return (el.getAttribute('aria-label') || by.trim() || [...(el.labels || [])].map(l => l.innerText).join(' ') || el.innerText || '')
    .replace(/\s+/g, ' ').trim();
});

/**
 * Ticks a checkbox, switch or radio the way a person does, and waits until it shows as ticked. A styled control
 * often hides the real input under its label (Tailwind's sr-only), so the label is clicked when there is one.
 */
async function tick(control) {
  if (await control.isChecked()) return;
  const target = await control.evaluateHandle(el => (el.labels && el.labels[0]) || el);
  await target.asElement().click();
  await target.dispose();
  await expect(control).toBeChecked();
}

/** A question answered with radios: a radiogroup, or a fieldset whose legend asks it. */
const questionGroup = (page, name) => page.getByRole('radiogroup', { name }).or(page.getByRole('group', { name }));

/** Opens any folded question about repayment history on the Plans tab (never a plan's own detail). */
async function unfoldHistoryQuestions(page) {
  const asks = /already|repaying|in repayment|payments? (made|so far|toward)|forgiveness (credit|count)|qualifying payments/i;
  for (let i = 0; i < 4; i++) {
    const folded = page.getByRole('button', { name: asks, expanded: false })
      .or(page.locator('details:not([open]) > summary').filter({ hasText: asks }));
    if (!(await folded.count())) return;
    await folded.first().click();
  }
}

/** Says "married, filing jointly" if the page has any way to. Returns the words of the control used, or null. */
export async function sayMarriedFilingJointly(page) {
  const joint = /jointly|joint (tax )?return/i;
  const box = page.getByRole('checkbox', { name: joint }).or(page.getByRole('switch', { name: joint }));
  if (await box.count()) {
    await tick(box.first());
    return (await nameOf(box.first())) || 'married, filing jointly';
  }
  const option = page.getByRole('radio', { name: joint });
  if (await option.count()) {
    await tick(option.first());
    return (await nameOf(option.first())) || 'married, filing jointly';
  }
  const group = questionGroup(page, joint);
  if (await group.count()) {
    const yes = group.first().getByRole('radio', { name: /^yes/i });
    if (await yes.count()) {
      await tick(yes.first());
      return 'yes to filing jointly';
    }
  }
  const select = page.getByRole('combobox', { name: /filing|file (your )?taxes|marital|married/i });
  if (await select.count()) {
    const labels = await select.first().locator('option').allInnerTexts();
    const label = labels.find(l => joint.test(l));
    if (label) {
      await select.first().selectOption({ label });
      return label.trim();
    }
  }
  return null;
}

/** The field for a spouse's own federal student loans, if the page has one. */
export async function spouseLoanField(page) {
  return (await namedFields(page)).find(f => /spouse|partner/i.test(f.name) && /loan|owe|balance|debt/i.test(f.name))?.field ?? null;
}

/** A field that works out AGI from pay, for pre-tax 401(k) or health deductions, if the page has one. */
export async function preTaxDeductionField(page) {
  return (await namedFields(page)).find(f => /pre-?tax|deduct|401\(?k|403\(?b|retirement/i.test(f.name) && !/spouse/i.test(f.name))?.field ?? null;
}

/**
 * Tells the page this borrower has been on the Standard plan since November 2022 (48 bills paid), in whichever
 * form it asks: yes to "on Standard now", Standard as the plan they are on, the month repayment began, or the
 * number of payments made. Returns what was answered, or null when nothing asks.
 */
export async function sayOnStandardSince(page, { began, paymentsMade }) {
  await unfoldHistoryQuestions(page);
  const onStandard = /standard plan|repaying (now|on)|already repaying|in repayment/i;
  const group = questionGroup(page, onStandard);
  if (await group.count()) {
    const yes = group.first().getByRole('radio', { name: /^yes/i });
    if (await yes.count()) {
      await tick(yes.first());
      return 'yes, on Standard now';
    }
  }
  // Or "Which plan are you on now?", answered Standard (never Tiered Standard).
  const currentPlan = /plan (are )?you('re| are)? (on|repaying)|current(ly)? .*plan|repaying on/i;
  const standard = /^\s*(the )?(10-year )?Standard\b/i;
  const planGroup = questionGroup(page, currentPlan);
  if (await planGroup.count()) {
    const option = planGroup.first().getByRole('radio', { name: standard });
    if (await option.count()) {
      await tick(option.first());
      return 'on Standard now';
    }
  }
  const planSelect = page.getByRole('combobox', { name: currentPlan });
  if (await planSelect.count()) {
    const label = (await planSelect.first().locator('option').allInnerTexts()).find(l => standard.test(l));
    if (label) {
      await planSelect.first().selectOption({ label });
      return `on ${label.trim()} now`;
    }
  }
  const box = page.getByRole('checkbox', { name: onStandard }).or(page.getByRole('switch', { name: onStandard }));
  if (await box.count()) {
    await tick(box.first());
    return 'ticked on Standard now';
  }
  const when = page.getByLabel(/enter(ed)? repayment|repayment (began|begin|started|start)|first (payment|bill)|start(ed)? repaying/i)
    .filter({ visible: true });
  if (await when.count()) {
    const type = await when.first().getAttribute('type');
    await when.first().fill(type === 'month' ? began.slice(0, 7) : began);
    return `repayment began ${began}`;
  }
  const made = (await namedFields(page)).find(f => /payments?|bills?/i.test(f.name) && /made|paid|so far/i.test(f.name) && !/forgiv|PSLF|income-driven|IDR/i.test(f.name));
  if (made) {
    await made.field.fill(String(paymentsMade));
    return `${paymentsMade} payments made`;
  }
  return null;
}

/**
 * Enters the number of payments already counted toward income-driven forgiveness, if the page asks. A count that
 * is only for PSLF is used only when nothing else asks. Returns the field's words, or null when nothing asks.
 */
export async function enterForgivenessCredit(page, count) {
  await unfoldHistoryQuestions(page);
  const asks = (await namedFields(page)).filter(f =>
    /payments?|months?/i.test(f.name) && /count|credit|qualif|made|already|toward|so far/i.test(f.name) &&
    !/owe|balance|\bincome\b(?![- ]driven)|\bAGI\b|extra|bill|minimum/i.test(f.name)); // "income-driven" is the count, not the income question
  const pick = asks.find(f => !/PSLF|public service/i.test(f.name)) ?? asks[0];
  if (!pick) return null;
  await pick.field.fill(String(count));
  return pick.name;
}
