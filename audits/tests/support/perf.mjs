// Helpers that only perf.spec.mjs needs: bigger portfolios, long snapshot histories, init scripts that count work in
// the page, and a Chrome DevTools Protocol session for CPU throttling, main-thread time and DOM counters.
// The suite runs Chromium only, so the CDP calls are safe here.
import { LOANS } from '../helpers.mjs';

/** One 60 Hz frame, in milliseconds: the budget for a continuous input such as a slider drag. */
export const FRAME_MS = 1000 / 60;

const SERVICERS = ['Nelnet', 'MOHELA', 'Aidvantage', 'EdFinancial'];

/** n distinct loans with varied balances and rates, all disbursed before July 2026, so every plan stays open. */
export const manyLoans = n => Array.from({ length: n }, (_, i) => ({
  id: `p-${i}`,
  nickname: `Loan ${i + 1}`,
  servicer: SERVICERS[i % SERVICERS.length],
  kind: i % 2 ? 'direct_unsub' : 'direct_sub',
  subsidy: i % 2 ? 'unsubsidized' : 'subsidized',
  principal: 1500 + ((i * 311) % 4000),
  balance: 1600 + ((i * 311) % 4200),
  rate: Math.round((3.73 + (i % 11) * 0.37) * 100) / 100,
  disbursementDate: `${2015 + (i % 10)}-09-01`,
  minPayment: 0,
}));

/** n weekly snapshots of the same loans from January 2010, oldest first: what years of regular saving leave behind. */
export function weeklySnapshots(n, loans = LOANS) {
  const totalBalance = loans.reduce((sum, l) => sum + l.balance, 0);
  return Array.from({ length: n }, (_, i) => ({
    takenAt: new Date(Date.UTC(2010, 0, 1) + i * 7 * 86_400_000).toISOString(),
    loans,
    totalBalance,
  }));
}

/**
 * Init script: counts how many number and date formatters the page builds. Date#toLocaleDateString builds a date
 * formatter internally without going through the global Intl.DateTimeFormat constructor, so it has its own count.
 */
export function countFormatters() {
  const count = (window.__auditFormatters = { numberFormat: 0, dateTimeFormat: 0, toLocaleDateString: 0 });
  const spy = (Ctor, key) => new Proxy(Ctor, {
    construct(target, args, newTarget) { count[key]++; return Reflect.construct(target, args, newTarget); },
    apply(target, self, args) { count[key]++; return Reflect.apply(target, self, args); },
  });
  Intl.NumberFormat = spy(Intl.NumberFormat, 'numberFormat');
  Intl.DateTimeFormat = spy(Intl.DateTimeFormat, 'dateTimeFormat');
  const toLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (...args) {
    count.toLocaleDateString++;
    return toLocaleDateString.apply(this, args);
  };
}

/** Init script: records every layout shift that did not follow the person's own input. */
export function recordLayoutShifts() {
  const shifts = (window.__auditLayoutShifts = []);
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      shifts.push({ value: e.value, at: Math.round(e.startTime), moved: (e.sources || []).map(s => s.node?.nodeName ?? '?') });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

/** Init script: logs the size of every localStorage write. */
export function recordStorageWrites() {
  const writes = (window.__auditWrites = []);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === window.localStorage) writes.push({ key, bytes: String(value).length });
    return setItem.call(this, key, value);
  };
}

/** A DevTools session on the page: CPU throttling, main-thread task time, and DOM counters after a full GC. */
export async function devtools(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  return {
    throttleCpu: rate => cdp.send('Emulation.setCPUThrottlingRate', { rate }),
    /** Main-thread time spent in tasks since the page started, in milliseconds. */
    async taskMs() {
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find(m => m.name === 'TaskDuration').value * 1000;
    },
    /**
     * Live DOM nodes and JS event listeners after a full GC. For a few milliseconds after a click the section that
     * just closed is still referenced, so this reads until two readings 100ms apart agree.
     */
    async domCounters() {
      let last = null;
      for (let i = 0; i < 20; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        const now = await cdp.send('Memory.getDOMCounters');
        if (last && now.nodes === last.nodes && now.jsEventListeners === last.jsEventListeners) return now;
        last = now;
        await new Promise(r => setTimeout(r, 100));
      }
      return last;
    },
  };
}

/**
 * Collects every response whose path ends in .js, tagged with the phase that was current when it arrived, with its
 * body. Covers <script>, preload, prefetch and dynamic import() alike.
 */
export function trackScripts(page) {
  const seen = [];
  let phase = 'load';
  page.on('response', response => {
    if (!new URL(response.url()).pathname.endsWith('.js')) return;
    seen.push({ url: response.url(), phase, body: response.text().catch(() => '') });
  });
  return {
    setPhase: next => { phase = next; },
    in: p => Promise.all(seen.filter(s => s.phase === p).map(async s => ({ url: s.url, body: await s.body }))),
  };
}

/**
 * The words in the page's main area, charts left out (their axis labels are placed after a resize measurement, so a
 * fresh page can lack them for a moment), read until two readings 200ms apart agree.
 */
export async function settledWords(page) {
  const read = () => page.locator('#main').evaluate(main => {
    const words = [];
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) words.push(node.textContent);
      else if (node.nodeType === Node.ELEMENT_NODE && !(node instanceof SVGElement)) for (const child of node.childNodes) walk(child);
    };
    walk(main);
    return words.join(' ').replace(/\s+/g, ' ').trim();
  });
  let last = await read();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(200);
    const now = await read();
    if (now === last) return now;
    last = now;
  }
  return last;
}

/** Where two texts first differ, as a few words of each around that point; null when they are the same. */
export function firstDifference(a, b) {
  if (a === b) return null;
  const x = a.split(' ');
  const y = b.split(' ');
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const around = words => words.slice(Math.max(0, i - 8), i + 8).join(' ');
  return { word: i, a: around(x), b: around(y) };
}

/** Font weight descriptor ("700", "200 800", "bold") as a [min, max] range. */
export function weightRange(descriptor) {
  const named = { normal: 400, bold: 700 };
  const [lo, hi = lo] = String(descriptor).trim().split(/\s+/).map(w => named[w] ?? Number(w));
  return [lo, hi];
}

/**
 * In the page: every @font-face rule (family, weight descriptor, file), every loaded face, and for each family the
 * computed weights its text is drawn at, counted by element.
 */
export const fontReport = page => page.evaluate(() => {
  const unquote = s => s.trim().replace(/^["']|["']$/g, '');
  const first = list => unquote(list.split(',')[0]);
  const rules = [];
  for (const sheet of document.styleSheets) {
    let cssRules;
    try { cssRules = sheet.cssRules; } catch { continue; }
    for (const rule of cssRules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      for (const [, url] of rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        rules.push({
          family: unquote(rule.style.getPropertyValue('font-family')),
          weight: rule.style.getPropertyValue('font-weight') || 'normal',
          url: new URL(url, sheet.href || location.href).href,
        });
      }
    }
  }
  const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => ({ family: unquote(f.family), weight: f.weight }));
  const drawn = {};
  for (const el of document.body.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const family = first(style.fontFamily);
    drawn[family] ??= {};
    drawn[family][style.fontWeight] = (drawn[family][style.fontWeight] ?? 0) + 1;
  }
  return { rules, loaded, drawn };
});
