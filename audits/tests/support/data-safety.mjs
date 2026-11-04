// Helpers used only by data-safety.spec.mjs.
import { isDeepStrictEqual } from 'node:util';
import { expect, KEYS } from '../helpers.mjs';

const DATA_KEYS = { loans: KEYS.loans, profile: KEYS.profile, snapshots: KEYS.snapshots };

/** The three data keys, parsed. A missing key is null; a value that is not JSON comes back as its raw string. */
export const appData = page => page.evaluate(keys => Object.fromEntries(Object.entries(keys).map(([name, key]) => {
  const raw = localStorage.getItem(key);
  try { return [name, raw === null ? null : JSON.parse(raw)]; } catch { return [name, raw]; }
})), DATA_KEYS);

/** The three data keys exactly as stored. */
export const rawData = page => page.evaluate(
  keys => Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, localStorage.getItem(key)])),
  DATA_KEYS,
);

/** Balances of the stored loans, in stored order. */
export const balances = async page => {
  const { loans } = await appData(page);
  return Array.isArray(loans) ? loans.map(l => l?.balance) : [];
};

/** Whole dollars the way a person reads them, formatted here rather than by the app. */
export const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Opens one row of the loan list (its button's name starts with the loan's name). */
export async function openRow(page, nickname) {
  const row = page.getByRole('button', { name: new RegExp(`^${escapeRe(nickname)}\\b`) }).first();
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
}

/** Fills the open loan form the quick way (a school-year chip fills the date and rate) and saves it. */
export async function addLoan(page, { year = '2025–26', balance, save = 'Save loan' }) {
  await page.getByRole('button', { name: year, exact: true }).click();
  await page.getByLabel('What you owe on it today').fill(String(balance));
  await page.getByRole('button', { name: save, exact: true }).click();
}

/** Text of every non-empty live status region (the toast, and any inline status). */
export const statusTexts = async page =>
  (await page.getByRole('status').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Visible text of the page, one trimmed line per entry. */
export const pageLines = async page =>
  (await page.locator('body').innerText()).split('\n').map(s => s.trim()).filter(Boolean);

/** Visible lines matching a pattern. */
export const visibleLines = async (page, re) => (await pageLines(page)).filter(line => re.test(line));

/** Lines of the floating toast, so a check can tell a lasting message from a passing one. */
export const toastLines = page => page.evaluate(() => [...document.querySelectorAll('[role="status"]')]
  .filter(el => getComputedStyle(el).position === 'fixed')
  .flatMap(el => el.innerText.split('\n').map(s => s.trim()).filter(Boolean)));

/** Text of a locator, or '' when it is not on the page. */
export const textOf = async locator => ((await locator.count()) ? (await locator.first().innerText()).replace(/\s+/g, ' ').trim() : '');

/** First words on the page, for failure messages. */
export const pageStart = async page => short((await page.locator('body').innerText()).replace(/\s+/g, ' ').trim(), 140);

/**
 * Waits until the app has either hydrated (#main) or replaced the loading skeleton with something else, such as
 * an error screen. Never throws: the test then asserts on what is there.
 */
export async function appSettled(page) {
  await page.waitForFunction(
    () => document.querySelector('#main') || (!document.querySelector('.animate-pulse') && document.body?.innerText.trim()),
    null,
    { timeout: 10_000 },
  ).catch(() => {});
}

/** Makes every write to the app's keys fail the way a full or refused store does (QuotaExceededError). */
export async function refuseWrites(page) {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && String(key).startsWith('cense.loandesk.')) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
}

/** Blocks site storage the way Chrome's "Don't allow sites to save data" does: reading localStorage throws. */
export async function blockStorage(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
    });
  });
}

/**
 * A person moving from one tab to another. Headless pages never change visibility, so this also sends the
 * visibilitychange, blur and focus events a real tab switch would, in case the app listens for those.
 */
export async function switchTab(from, to) {
  const show = visible => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(visible ? 'focus' : 'blur'));
  };
  await from.evaluate(show, false);
  await to.bringToFront();
  await to.evaluate(show, true);
}

/** What a browser that never used the app holds after its first visit (a fresh context, same baseURL). */
export async function firstVisitData(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('#main').waitFor();
    return await appData(page);
  } finally {
    await context.close();
  }
}

/** Everything in a store that a first visit would not hold, described for a failure message. */
export function leftovers(data, fresh) {
  const out = [];
  const loans = Array.isArray(data.loans) ? data.loans : [];
  if (loans.length) out.push(`${loans.length} loans`);
  const snaps = Array.isArray(data.snapshots) ? data.snapshots : [];
  if (snaps.length) {
    const rows = snaps.flatMap(s => s?.loans ?? []);
    const servicers = [...new Set(rows.map(l => l?.servicer).filter(Boolean))];
    out.push(`${snaps.length} dated records holding ${rows.length} loan rows (${servicers.join(', ')})`);
  }
  // A first visit that stores no profile gives nothing to compare with; the on-screen checks cover that case.
  if (fresh.profile && data.profile && !isDeepStrictEqual(data.profile, fresh.profile)) {
    const changed = Object.fromEntries(Object.entries(data.profile).filter(([k, v]) => !isDeepStrictEqual(v, fresh.profile[k])));
    out.push(`answers ${JSON.stringify(changed)}`);
  }
  return out;
}

/**
 * Presses the control under "Clear my data" that removes everything (today "Clear every loan"; a fix may call it
 * "Erase everything" or "Clear everything"), accepting a confirmation if the fix asks for one.
 */
export async function eraseEverything(page) {
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  const disclosure = page.getByRole('button', { name: /^(clear|erase|delete|remove) (my|all) data$/i });
  await disclosure.click();
  const id = await disclosure.getAttribute('aria-controls');
  const scope = id ? page.locator(`[id="${id}"]`) : page;
  await scope.getByRole('button', { name: /\b(every|everything|all)\b/i }).first().click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
  if (await confirm.waitFor({ state: 'visible', timeout: 500 }).then(() => true, () => false)) {
    await confirm.getByRole('button', { name: /\b(yes|confirm|erase|clear|delete)\b/i }).first().click();
  }
}

/** Controls that load a saved file back in. */
export const RESTORE = /\brestore\b|\bimport\b|\bupload\b|\bload\b.*\b(backup|file|copy|data)\b/i;

/** Words that tell a person their entries are not being kept. */
export const NOT_SAVING = /\bnot (being )?(saved|saving|kept|keeping|stored)\b|\bn[o’']t (be )?(saved|saving|kept|stored)\b|\b(can ?not|can[’']t|could ?not|couldn[’']t|unable to|won[’']t) (save|keep|store)\b|\bwill (be )?(erased?|lost)\b|\bwill erase\b|\b(for )?this visit only\b|\bonly (for|during) this visit\b/i;

/** A storage claim about the device. "Run on your device" (where the math happens) is about computing, not storage. */
export const DEVICE_CLAIM = /(?<!\brun )\bon (your|this) device\b/i;

/** A line that tells a returning borrower their loans may be in another browser or app. */
export const OTHER_PLACE = /\b(each|every|another|other|different|usual|default) (web )?browsers?\b|\bin-app\b|\binside an app\b|\bhome screen\b/i;

/** A notice that some saved data could not be used. */
export const UNREADABLE = /\bcould ?n[o’']t (be )?read\b|\bcan ?not be read\b|\bcan[’']t be read\b|\bunreadable\b|\bnot readable\b|\bset aside\b|\bleft out\b/i;

/** A message that something did not work. */
export const FAILED = /\bcould ?n[o’']t\b|\bcan ?not\b|\bcan[’']t\b|\bfailed\b|\bunable\b|\bwent wrong\b|\bdid ?n[o’']t\b|\bno (internet|connection|network)\b|\boffline\b|\btry again\b/i;

/** Texts of the live regions on the page (status, alert, aria-live). */
export const liveTexts = page => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')]
  .map(el => el.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));

/** Text on screen right now (inside the viewport) that matches a pattern. */
export const inViewLines = (page, re) => page.evaluate(([source, flags]) => {
  const match = new RegExp(source, flags);
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text || !match.test(text)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) out.push(text);
  }
  return out;
}, [re.source, re.flags]);

/** Counts this tab's writes to the app's keys from now on (window.__appWrites). Lost if the tab reloads. */
export const countWrites = page => page.evaluate(keys => {
  window.__appWrites = 0;
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === window.localStorage && keys.includes(key)) window.__appWrites++;
    return setItem.call(this, key, value);
  };
}, [KEYS.loans, KEYS.profile, KEYS.snapshots, 'cense.loandesk.hideAmounts.v1']);

/** Texts of live regions on the page, and of the focused element, which is what a screen reader reads out. */
export const announced = page => page.evaluate(() => {
  const live = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')];
  const focused = document.activeElement && document.activeElement !== document.body ? [document.activeElement] : [];
  return [...live, ...focused].map(el => el.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
});

/**
 * Clicks a control and returns the failure lines that appeared because of it (lines matching FAILED that were not on
 * the page before), polling up to `within` ms. Never throws.
 */
export async function clickAndRead(page, control, within = 2000) {
  const before = new Set(await pageLines(page));
  await control.click();
  const deadline = Date.now() + within;
  let fresh = [];
  while (Date.now() < deadline) {
    fresh = (await pageLines(page)).filter(line => !before.has(line) && FAILED.test(line));
    if (fresh.length) break;
    await page.waitForTimeout(100);
  }
  return fresh;
}

export { short };
