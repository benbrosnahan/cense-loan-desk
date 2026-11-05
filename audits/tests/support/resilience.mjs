// Helpers that only tests/resilience.spec.mjs uses.
import { openApp } from '../helpers.mjs';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A page in a browser context of its own, so it has its own storage, clock and time zone. Opened like openApp()
 * unless open is false. The caller closes it.
 */
export async function isolatedPage(browser, baseURL, { viewport, timezoneId, reducedMotion, javaScriptEnabled, open = true, ...data } = {}) {
  const options = Object.fromEntries(
    Object.entries({ baseURL, viewport, timezoneId, reducedMotion, javaScriptEnabled }).filter(([, v]) => v !== undefined),
  );
  const context = await browser.newContext(options);
  const page = await context.newPage();
  if (open) await openApp(page, data);
  return { page, close: () => context.close() };
}

/** True once the locator shows up within ms, false otherwise. For things that may or may not appear. */
export const appears = (locator, ms = 1000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

/** The expandable row of a loan. Its accessible name starts with the loan's name. */
export const loanRow = (page, name) => page.getByRole('button', { name: new RegExp(`^${escapeRe(name)}`) });

/** Opens a loan's row, if it is closed, and presses Edit or Remove inside it. */
export async function inLoanRow(page, name, action) {
  const row = loanRow(page, name);
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  const panel = page.locator(`[id="${await row.getAttribute('aria-controls')}"]`);
  await panel.getByRole('button', { name: action, exact: true }).click();
}

/** Loan ids in the order the list shows them. */
export const shownOrder = page =>
  page.locator('button[aria-controls^="loan-"]').evaluateAll(rows => rows.map(r => r.getAttribute('aria-controls').slice(5)));

export const undoButtons = page => page.getByRole('button', { name: /^Undo\b/ });

/** The text of the toast, or '' when none is up. The toast is the only element with an explicit role="status". */
export const toastText = async page => {
  const toast = page.locator('[role="status"]');
  return (await toast.count()) ? (await toast.last().innerText()).replace(/\s+/g, ' ').trim() : '';
};

/** Clicks the first Undo on screen and waits for that button to go away. False when no Undo shows up within ms. */
export async function pressUndo(page, ms = 1000) {
  if (!(await appears(undoButtons(page), ms))) return false;
  const button = await undoButtons(page).first().elementHandle();
  await button.click();
  await button.waitForElementState('hidden', { timeout: 1000 }).catch(() => {});
  await sleep(150);
  return true;
}

/**
 * Presses Undo the way a person would: while one is offered and something is still missing. A fix may chain the
 * restores behind one Undo, stack one toast per removal or offer the next Undo after the first, so this accepts all
 * three. Returns how many presses it took.
 */
export async function pressUndoWhileOffered(page, stillMissing, max = 3) {
  let presses = 0;
  while (presses < max && (await stillMissing()) && (await pressUndo(page))) presses++;
  return presses;
}

/** The box of an element once it has stopped moving, so a tap lands where a person would tap after an entrance animation. */
export async function settledBox(locator) {
  let box = await locator.boundingBox();
  for (let i = 0; i < 10; i++) {
    await sleep(100);
    const next = await locator.boundingBox();
    if (JSON.stringify(next) === JSON.stringify(box)) break;
    box = next;
  }
  return box;
}

const ANSWERS = {
  keep: /keep|stay|continue|go back|back to|cancel|^no\b|don.t/i,
  discard: /discard|leave|lose|throw|^yes\b|^ok\b/i,
};

/** If the page asks "discard your changes?" in a dialog of its own, answers it: 'keep' editing or 'discard'. */
export async function answerIfAsked(page, choice) {
  const question = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  if (!(await appears(question, 300))) return;
  const answer = question.first().getByRole('button', { name: ANSWERS[choice] }).first();
  if (await answer.isVisible()) await answer.click();
}

/** Clicks a control that starts a download and returns the file name the browser was given. */
export async function downloadName(page, control) {
  const [download] = await Promise.all([page.waitForEvent('download'), control.click()]);
  return download.suggestedFilename();
}

/**
 * True when a file name carries this calendar date in any common form: 2026-11-02, 2026_11_02, 20261102, 11-02-2026,
 * 2-11-2026, Nov-2-2026 or 2 November 2026.
 */
export function namesDate(name, iso) {
  const [y, m, d] = iso.split('-');
  const mon = new Date(`${iso}T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const sep = '[-_. ]?';
  const must = '[-_. ]';
  const month = `0?${Number(m)}`;
  const day = `0?${Number(d)}(?!\\d)`;
  return [
    new RegExp(`(?<!\\d)${y}${sep}${m}${sep}${d}(?!\\d)`),
    new RegExp(`(?<!\\d)${month}${must}${day}${must}${y}(?!\\d)`),
    new RegExp(`(?<!\\d)${day}${must}${month}${must}${y}(?!\\d)`),
    new RegExp(`${mon}[a-z]*${sep}${day},?${sep}${y}`, 'i'),
    new RegExp(`(?<!\\d)${day}${sep}${mon}[a-z]*${sep}${y}`, 'i'),
  ].some(re => re.test(name));
}

/** The lines of text in `after` that were not in `before`. */
export function addedLines(before, after) {
  const had = new Set(before.split('\n').map(l => l.trim()));
  return after.split('\n').map(l => l.trim()).filter(l => l && !had.has(l));
}

/** How far the page scrolls sideways, in CSS px. */
export const sidewaysScroll = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Runs in the page. Returns the first text on screen that tells the borrower to reload, or null. "On screen" means
 * laid out inside the viewport, not hidden and at least half opaque: Playwright's toBeVisible counts opacity 0 as
 * visible, and a fade-in line is in the DOM from the first paint.
 */
export function visibleReloadAdvice() {
  const advice = /\b(reload|refresh|reopen|restart|try again)\b|open (the|this) page again/i;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!advice.test(node.nodeValue)) continue;
    const parent = node.parentElement;
    if (!parent || getComputedStyle(parent).visibility !== 'visible') continue;
    let opacity = 1;
    for (let el = parent; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    if (onScreen && opacity >= 0.5) return node.nodeValue.trim();
  }
  return null;
}

/**
 * Runs in the page. An offline model of what a page translator does to the DOM, with no network and English kept:
 * Google's translator rewrites each block that mixes words with inline elements as one run of copies and empties
 * React's originals in place, and every other text node is swapped for <font><font>text</font></font>, as Chrome's
 * built-in translation does. React keeps editing the nodes it made, so any text it then changes in place stays stale
 * on screen. Running it again translates only what is new, like a translator watching the page.
 * translate="no" (or class notranslate) is honoured on a figure, date or name, up to four words, and a sentence that
 * holds one is then translated piece by piece around it. On anything bigger it is ignored: opting sentences, sections
 * or the page out of translation is not a fix for the people who need it.
 */
export function translatePage() {
  const INLINE = new Set(['SPAN', 'STRONG', 'B', 'EM', 'I', 'A', 'SMALL', 'CODE', 'ABBR']);
  const SKIP = new Set(['SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'TEXTAREA']);
  const font = () => {
    const f = document.createElement('font');
    f.style.verticalAlign = 'inherit';
    return f;
  };
  const textNodes = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  };
  const main = document.getElementById('main');
  if (!main) return 0;
  const OPT_OUT = '[translate="no" i], .notranslate';
  const keptAsIs = node => {
    const holder = (node.nodeType === 1 ? node : node.parentElement)?.closest(OPT_OUT);
    return !!holder && holder !== main && main.contains(holder) && holder.textContent.trim().split(/\s+/).length <= 4;
  };
  const isMixed = el => {
    const kids = [...el.childNodes];
    return (
      kids.some(k => k.nodeType === 3 && k.nodeValue.trim()) &&
      kids.some(k => k.nodeType === 1 && INLINE.has(k.tagName)) &&
      !el.querySelector('input,select,textarea,button,svg') &&
      !keptAsIs(el) &&
      ![...el.querySelectorAll(OPT_OUT)].some(keptAsIs)
    );
  };
  const candidates = [...main.querySelectorAll('*')].filter(el => !el.closest('svg') && !el.closest('font') && !SKIP.has(el.tagName));
  const mixed = candidates.filter(isMixed);
  const outer = mixed.filter(el => !mixed.some(o => o !== el && o.contains(el)));
  for (const el of outer) {
    const kids = [...el.childNodes];
    const run = font();
    const inner = font();
    run.appendChild(inner);
    for (const k of kids) inner.appendChild(k.cloneNode(true));
    el.insertBefore(run, el.firstChild);
    for (const k of kids) {
      if (k.nodeType === 3) {
        if (k.nodeValue.trim()) el.replaceChild(font(), k);
      } else if (k.nodeType === 1) {
        for (const t of textNodes(k)) if (t.nodeValue.trim()) t.parentNode.replaceChild(font(), t);
      }
    }
  }
  let swapped = 0;
  for (const t of textNodes(main)) {
    const p = t.parentNode;
    if (!t.nodeValue.trim() || !p || p.closest('svg') || p.closest('font') || SKIP.has(p.tagName) || keptAsIs(t)) continue;
    const outerFont = font();
    const innerFont = font();
    innerFont.textContent = t.nodeValue;
    outerFont.appendChild(innerFont);
    p.replaceChild(outerFont, t);
    swapped++;
  }
  return outer.length + swapped;
}

/** Visible text of #main, or null once the app has unmounted (a client-side crash leaves no #main). */
const mainText = page => page.evaluate(() => document.getElementById('main')?.innerText ?? null);
const squash = s => s.replace(/\s+/g, '');

/** Word-level differences between two texts, each with a few words of context before it. Whitespace-only changes are dropped. */
export function wordDiff(control, shown, limit = 3) {
  const A = control.split(/\s+/).filter(Boolean);
  const B = shown.split(/\s+/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  let del = [];
  let ins = [];
  const flush = () => {
    if ((del.length || ins.length) && squash(del.join('')) !== squash(ins.join(''))) {
      out.push({ context: A.slice(Math.max(0, i - del.length - 4), i - del.length).join(' '), control: del.join(' '), shown: ins.join(' ') });
    }
    del = [];
    ins = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) ins.push(B[j++]);
    else del.push(A[i++]);
  }
  flush();
  return out.slice(0, limit);
}

/**
 * Waits until the translated page reads the same as the untranslated control, ignoring whitespace, or the deadline
 * passes. The Payoff summary for screen readers settles 700 ms after a change, so a fixed wait would be fragile.
 * Returns null when they match, { crashed, shown } when the app unmounted, or { diffs } when text stayed different.
 */
export async function compareWithControl(control, translated, deadline = 4000) {
  const start = Date.now();
  for (;;) {
    const [want, got] = await Promise.all([mainText(control), mainText(translated)]);
    if (got === null) {
      const shown = await translated.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
      return { crashed: true, shown: shown.slice(0, 90) };
    }
    if (want !== null && squash(want) === squash(got)) return null;
    if (Date.now() - start > deadline) return { crashed: false, diffs: wordDiff(want ?? '', got) };
    await sleep(200);
  }
}

/** One line describing what went wrong on the translated page. */
export function describeDifference(result) {
  if (result.crashed) return `the app crashed to "${result.shown}" with no way back`;
  return result.diffs
    .map(d => `shows "${[d.context, d.shown].join(' ').trim()}" where the untranslated page shows "${[d.context, d.control].join(' ').trim()}"`)
    .join('; ');
}
