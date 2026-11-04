// Readable probe: when a borrower sees real content. The app paints a pulsing skeleton until React hydrates, and
// Lighthouse's simulated LCP sees only that skeleton, so this loads the page cold on Lighthouse's slow-4G numbers
// applied for real (devtools throttling, not simulated) with 4x CPU, and reads its marks from inside the page.
// Usage: node probes/readable.mjs <url> <outFile> [runs]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../lib/browser.mjs';
import { seedScript } from '../lib/fixtures.mjs';

// A first visit with empty storage, and a returning borrower with the eight-loan fixture in localStorage.
export const SCENARIOS = { first: { seeded: false }, returning: { seeded: true } };
export const MARKS = ['fp', 'fcp', 'skeleton', 'real', 'readable', 'lcp'];
export const THROTTLE = { latencyMs: 562.5, downloadKbps: 1474.56, uploadKbps: 675, cpu: 4 };
export const VIEWPORT = { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true };

// Marks are ms from navigation start. skeleton: the first frame with .animate-pulse in the DOM. real: the first frame
// with main h1 and no .animate-pulse. readable: the first frame where the first .rise block has faded in, or real when
// there is none. fp and fcp come from Paint Timing, lcp from the last largest-contentful-paint entry.
const OBSERVER = `(() => {
  const R = window.__readable = { marks: {}, lcpElement: null };
  const mark = (k, t = performance.now()) => { if (R.marks[k] == null) R.marks[k] = Math.round(t); };
  new PerformanceObserver(l => { for (const e of l.getEntries()) mark(e.name === 'first-paint' ? 'fp' : 'fcp', e.startTime); })
    .observe({ type: 'paint', buffered: true });
  new PerformanceObserver(l => {
    for (const e of l.getEntries()) {
      R.marks.lcp = Math.round(e.startTime);
      R.lcpElement = e.element ? e.element.tagName.toLowerCase() + ' "' + (e.element.textContent || '').trim().slice(0, 40) + '"' : e.url || null;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  const poll = () => {
    if (document.querySelector('.animate-pulse')) mark('skeleton');
    else if (document.querySelector('main h1')) {
      mark('real');
      const rise = document.querySelector('.rise');
      if (!rise || Number(getComputedStyle(rise).opacity) >= 0.99) mark('readable');
    }
    if (R.marks.readable == null) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})()`;

// One cold load in a fresh browser: its marks, the LCP element, and an error when the page never became readable.
async function load(url, scenario) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    if (scenario.seeded) await page.evaluateOnNewDocument(seedScript());
    await page.evaluateOnNewDocument(OBSERVER);
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: THROTTLE.latencyMs,
      downloadThroughput: (THROTTLE.downloadKbps * 1024) / 8,
      uploadThroughput: (THROTTLE.uploadKbps * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    let error = null;
    try {
      await page.waitForFunction(() => window.__readable?.marks.readable != null, { polling: 250, timeout: 30000 });
    } catch (e) {
      if (e?.name !== 'TimeoutError') throw e;
      error = 'not readable within 30 s of the load event';
    }
    // Paint and LCP entries reach the observers a little after the frame that produced them.
    await sleep(1000);
    const r = await page.evaluate(() => window.__readable);
    return { ...Object.fromEntries(MARKS.map(k => [k, r.marks[k] ?? null])), lcpElement: r.lcpElement, ...(error ? { error } : {}) };
  } finally {
    await browser.close();
  }
}

// The middle value; with an even count, the higher of the two middle ones.
const median = values => {
  const s = values.filter(v => typeof v === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * Loads the page `runs` times per scenario, each time in a fresh browser with a cold cache, taking the scenarios in
 * turn so a busy spell on the machine lands on both. Returns { first, returning }, each { runs, median }: runs holds
 * { run, fp, fcp, skeleton, real, readable, lcp, lcpElement } per load, plus error when it failed, and median holds
 * each mark's median over the loads without an error. A mark the page never reached is null.
 */
export async function runReadableProbe(url, { runs = 3, log = () => {} } = {}) {
  const out = Object.fromEntries(Object.keys(SCENARIOS).map(name => [name, { runs: [], median: {} }]));
  for (let run = 1; run <= runs; run++) {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      // Chrome sometimes fails to start on a busy machine; only that is tried again.
      for (let attempt = 1; ; attempt++) {
        try {
          const row = { run, ...(await load(url, scenario)) };
          out[name].runs.push(row);
          log(`${name} run${run} ${MARKS.map(k => `${k} ${row[k] ?? '–'}`).join(' ')}${row.lcpElement ? ` (lcp on ${row.lcpElement})` : ''}${row.error ? ` FAILED ${row.error}` : ''}`);
        } catch (e) {
          const message = String(e?.message ?? e).slice(0, 300);
          if (attempt < 3 && /Failed to launch the browser process/i.test(message)) continue;
          out[name].runs.push({ run, error: message });
          log(`${name} run${run} FAILED ${message}`);
        }
        break;
      }
    }
  }
  for (const s of Object.values(out)) {
    const done = s.runs.filter(r => !r.error);
    for (const k of MARKS) s.median[k] = median(done.map(r => r[k]));
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [url, outFile, runs = '3'] = process.argv.slice(2);
  if (!url || !outFile || !Number.isInteger(Number(runs)) || Number(runs) < 1) {
    console.error('Usage: node probes/readable.mjs <url> <outFile> [runs]');
    process.exit(2);
  }
  mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  writeFileSync(outFile, JSON.stringify(await runReadableProbe(url, { runs: Number(runs), log: console.log }), null, 1));
}
