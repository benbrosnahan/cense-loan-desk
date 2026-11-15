// Helpers used only by ux-copy.spec.mjs. They read copy and layout the way a borrower meets them: visible text,
// page positions and what assistive technology is pointed at. Expected values are computed here or in the spec,
// never by importing the app's code.
import { goTo } from '../helpers.mjs';

/** Whole dollars, as the app prints money ("$2,256"). Formatted here so no expected figure comes from the app. */
export const dollars = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** "Highest rate first", the order Payoff documents: ties go to the smaller balance. */
export const byRateThenBalance = loans => [...loans].sort((a, b) => b.rate - a.rate || a.balance - b.balance);

/** "Smallest balance first": ties go to the higher rate. */
export const byBalanceThenRate = loans => [...loans].sort((a, b) => a.balance - b.balance || b.rate - a.rate);

/** "2024–25" for a loan paid out on 2024-09-01: the label of the form's school-year button (award year from July 1). */
export function schoolYear(iso) {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

export const KIND_LABEL = { direct_sub: 'Subsidized', direct_unsub: 'Unsubsidized' };

export const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How often `re` occurs in `text`, with up to `n` short quotes around the hits for an expect message. */
export function occurrences(re, text, n = 2) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const hits = [...text.matchAll(new RegExp(re.source, flags))];
  const quotes = hits
    .slice(0, n)
    .map(m => `"…${text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim()}…"`);
  return { count: hits.length, quotes };
}

/** First `max` characters of a text, for quoting in a message. */
export const clip = (text, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Opens every collapsed disclosure on the page, the footer's included, with real clicks. Loan rows open one at a
 * time, so they stay closed.
 */
export async function openEveryDisclosure(page) {
  const closed = page.locator('#main button[aria-expanded="false"]:not(li button)');
  for (let i = 0; i < 30 && (await closed.count()); i++) await closed.first().click();
}

/** What the page says below the header, without the footer. */
export async function sectionText(page) {
  const all = await page.locator('#main').innerText();
  const footer = await page.locator('#main footer').innerText().catch(() => '');
  return footer ? all.replace(footer, '') : all;
}

/** Switches section, opens everything in it, and returns what the page says there, footer included. */
export async function readSection(page, tab) {
  await goTo(page, tab);
  await openEveryDisclosure(page);
  return page.locator('#main').innerText();
}

/**
 * The message a form field announces, found the way assistive technology finds it (aria-errormessage, then
 * aria-describedby, preferring the role=alert part), plus the field's and the message's boxes in page coordinates.
 */
export const fieldMessage = field =>
  field.evaluate(input => {
    const box = el => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) };
    };
    const clean = el => (el ? el.innerText.replace(/^\s*!\s*/, '').replace(/\s+/g, ' ').trim() : '');
    const ids = `${input.getAttribute('aria-errormessage') || ''} ${input.getAttribute('aria-describedby') || ''}`
      .split(/\s+/)
      .filter(Boolean);
    const targets = ids.map(id => document.getElementById(id)).filter(Boolean);
    const alert = targets.map(t => (t.getAttribute('role') === 'alert' ? t : t.querySelector('[role="alert"]'))).find(Boolean);
    return {
      alert: clean(alert),
      alertBox: alert ? box(alert) : null,
      described: targets.map(clean).join(' '),
      field: box(input),
      invalid: input.getAttribute('aria-invalid') === 'true',
    };
  });

/**
 * Visible blocks outside the footer that tell the borrower to instruct a servicer: text that matches `who` and an
 * instruction word. Deepest matches only, each with its top in page coordinates.
 */
export const servicerInstructions = (page, who) =>
  page.evaluate(
    ({ source, flags }) => {
      const whoRe = new RegExp(source, flags);
      const act = /\b(tell|ask|instruct|in writing|principal|due date)\b/i;
      const norm = el => el.innerText.replace(/\s+/g, ' ').trim();
      const hits = [...document.querySelectorAll('#main *')].filter(el => {
        if (!(el instanceof HTMLElement) || el.closest('footer') || !el.getClientRects().length) return false;
        const t = norm(el);
        return whoRe.test(t) && act.test(t);
      });
      return hits
        .filter(el => !hits.some(o => o !== el && el.contains(o)))
        .map(el => ({ top: Math.round(el.getBoundingClientRect().top + scrollY), text: norm(el) }));
    },
    { source: who.source, flags: who.flags },
  );

/**
 * The notice about late fees: the smallest visible block that mentions late fees and the 90 or 270 day timeline
 * and has bold text. Returns its bold text, which is what a skimming reader takes in, and its full text.
 */
export const lateFeeNotice = page =>
  page.evaluate(() => {
    const isBold = el => Number.parseInt(getComputedStyle(el).fontWeight, 10) >= 600;
    const boldText = root => {
      const parts = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        if (n.data.trim() && el.getClientRects().length && !el.closest('[aria-hidden="true"]') && isBold(el)) {
          parts.push(n.data.trim());
        }
      }
      return parts.join(' ');
    };
    const hits = [...document.querySelectorAll('#main *')].filter(
      el =>
        el instanceof HTMLElement &&
        !el.closest('footer') &&
        el.getClientRects().length &&
        /late fee/i.test(el.innerText) &&
        /\b(90|270) days\b/i.test(el.innerText) &&
        boldText(el),
    );
    const box = hits.find(el => !hits.some(o => o !== el && el.contains(o)));
    return box ? { bold: boldText(box), text: box.innerText.replace(/\s+/g, ' ').trim() } : null;
  });

/**
 * The latest date, up to today, that a text gives for when something was last checked, reviewed, verified or
 * updated, such as "Rules last checked November 2026" or "Reviewed 2026-10-30". A date the rules take effect
 * ("updated rules apply after July 1, 2026") is not a checked date. Returns { date, quote } or null.
 */
export function lastCheckedDate(text, now = new Date()) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const re =
    /\b(?:checked|reviewed|verified|updated|current as of)\b(?:(?!\b(?:after|before|since|until|from|effective|apply|applies|starting)\b)[^.\n]){0,40}?(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b|\b(\d{4})-(\d{2})(?:-(\d{2}))?\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b)/gi;
  let best = null;
  for (const m of text.matchAll(re)) {
    const date = m[1]
      ? new Date(Number(m[3]), months.indexOf(m[1].toLowerCase()), Number(m[2] ?? 1))
      : m[4]
        ? new Date(Number(m[4]), Number(m[5]) - 1, Number(m[6] ?? 1))
        : new Date(Number(m[9]), Number(m[7]) - 1, Number(m[8]));
    if (!Number.isNaN(date.getTime()) && date <= now && (!best || date > best.date)) {
      best = { date, quote: m[0].replace(/\s+/g, ' ').trim() };
    }
  }
  return best;
}

/** The Payoff order list, found by the first and last loan in "highest rate first" order. */
export const payoffOrderList = (page, loans) => {
  const order = byRateThenBalance(loans);
  return page.getByRole('list').filter({ hasText: order[0].nickname }).filter({ hasText: order.at(-1).nickname });
};

/** Each row of a list: its visible text and its top in page coordinates. */
export const listRows = list =>
  list
    .getByRole('listitem')
    .evaluateAll(items => items.map(li => ({ top: Math.round(li.getBoundingClientRect().top + scrollY), text: li.innerText })));

/**
 * The explanatory sentences of each order row, with the row's own facts taken out (rank, name, rate and balance,
 * "Gone by" date, badge) and every number replaced by #, so one stock sentence about different loans reads the same.
 * Returns the sentences that more than one row carries, and which rows (1-based) carry one.
 */
export function stockSentences(rowTexts, nicknames) {
  const perRow = rowTexts.map(text =>
    text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !/^\d+$/.test(line) && !nicknames.includes(line) && !/^Gone by\b/i.test(line))
      .map(line => line.replace(/Extra goes here/gi, ' '))
      .filter(line => line.replace(/[\d.,%$·\s]/g, '').length)
      .join(' ')
      .replace(/\d+(?:[.,]\d+)*/g, '#')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      // Prose only: a facts line such as "#% · $# · MOHELA" is not a sentence.
      .filter(s => (s.match(/[a-z]{2,}/gi) ?? []).length >= 4),
  );
  const rowsBySentence = new Map();
  perRow.forEach((sentences, i) => {
    for (const s of new Set(sentences)) rowsBySentence.set(s, [...(rowsBySentence.get(s) ?? []), i + 1]);
  });
  const repeated = [...rowsBySentence].filter(([, rows]) => rows.length > 1);
  return { repeated, rows: [...new Set(repeated.flatMap(([, rows]) => rows))].sort((a, b) => a - b) };
}

/** Rates that a text prints two ways, such as 5.50% and 5.5%. */
export function mixedRateFormats(text) {
  const byValue = new Map();
  for (const [s] of text.matchAll(/\d+(?:\.\d+)?%/g)) {
    const value = Number(s.slice(0, -1));
    byValue.set(value, new Set([...(byValue.get(value) ?? []), s]));
  }
  return [...byValue.values()].filter(forms => forms.size > 1).map(forms => [...forms]);
}

/**
 * What one closed loan row shows: its visible text, where its rate starts and ends on screen, and how many pixels
 * of the July 1, 2026 tag are cut off by any clipping ancestor or the viewport.
 */
export const loanRowFacts = row =>
  row.evaluate(button => {
    const text = button.innerText.replace(/\s+/g, ' ').trim();
    let rate = null;
    let tag = null;
    const walk = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.parentElement.getClientRects().length) continue;
      const rangeBox = (from, to) => {
        const r = document.createRange();
        r.setStart(n, from);
        r.setEnd(n, to);
        return r.getBoundingClientRect();
      };
      const m = !rate && /\d+(?:\.\d+)?\s?%/.exec(n.data);
      if (m) {
        const b = rangeBox(m.index, m.index + m[0].length);
        rate = { text: m[0], left: b.left, right: b.right };
      }
      const t = !tag && /(?:after\s+)?Jul(?:y)?\.?\s+1,?\s+2026/i.exec(n.data);
      if (t) {
        const b = rangeBox(t.index, t.index + t[0].length);
        let left = 0;
        let right = document.documentElement.clientWidth;
        for (let el = n.parentElement; el && el !== document.documentElement; el = el.parentElement) {
          if (getComputedStyle(el).overflowX === 'visible') continue;
          const c = el.getBoundingClientRect();
          left = Math.max(left, c.left);
          right = Math.min(right, c.right);
        }
        tag = { text: t[0], cutPx: Math.round(Math.max(0, b.right - right, left - b.left) * 10) / 10 };
      }
    }
    return { text, rate, tag };
  });

/**
 * Fills the open "Add a loan" form the way a person on a phone does: taps a control only when it does not already
 * show what they need, types the balance, then taps "Save and add another". A select costs two taps (open, pick).
 * Returns the list of taps it took.
 */
export async function addLoanCountingTaps(page, loan) {
  const form = page.getByRole('form', { name: 'Add a loan' });
  const taps = [];
  const date = form.getByLabel('Date it was paid out', { exact: true });
  if ((await date.inputValue()) !== loan.disbursementDate) {
    await form.getByRole('button', { name: schoolYear(loan.disbursementDate), exact: true }).click();
    taps.push('year');
  }
  const kind = form.getByRole('radio', { name: KIND_LABEL[loan.kind], exact: true });
  if ((await kind.getAttribute('aria-checked')) !== 'true') {
    await kind.click();
    taps.push('type');
  }
  const rate = form.getByLabel('Interest rate', { exact: true });
  if (Number(await rate.inputValue()) !== loan.rate) {
    await rate.fill(String(loan.rate));
    taps.push('rate');
  }
  const balance = form.getByLabel('What you owe on it today', { exact: true });
  await balance.click();
  await balance.pressSequentially(String(loan.balance));
  taps.push('balance');
  const servicer = form.getByLabel('Who do you pay?', { exact: true });
  if ((await servicer.inputValue()) !== loan.servicer) {
    await servicer.selectOption(loan.servicer);
    taps.push('servicer', 'servicer');
  }
  await form.getByRole('button', { name: 'Save and add another' }).click();
  taps.push('save');
  return taps;
}
