// Lighthouse scan and user flow. Adapted from PerfMaster's Lighthouse engine.
import lighthouse, { generateReport, startFlow } from 'lighthouse';
import { launchBrowser, sleep } from '../lib/browser.mjs';
import { clickTab, clickText } from '../lib/fixtures.mjs';

// emulatedUserAgent is Lighthouse's own device emulation; it swaps in the running Chrome's version.
export const MOBILE_SETTINGS = {
  formFactor: 'mobile',
  throttling: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 4,
    requestLatencyMs: 562.5,
    downloadThroughputKbps: 1474.56,
    uploadThroughputKbps: 675,
  },
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
};

export const DESKTOP_SETTINGS = {
  formFactor: 'desktop',
  throttling: {
    rttMs: 40,
    throughputKbps: 10240,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 10240,
    uploadThroughputKbps: 5120,
  },
  screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  emulatedUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
};

export const configFor = formFactor => ({
  extends: 'lighthouse:default',
  settings: formFactor === 'desktop' ? DESKTOP_SETTINGS : MOBILE_SETTINGS,
});

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

const OPPORTUNITY_AUDITS = [
  'render-blocking-resources', 'unused-css-rules', 'unused-javascript',
  'modern-image-formats', 'offscreen-images', 'unminified-css', 'unminified-javascript',
  'efficient-animated-content', 'duplicated-javascript', 'legacy-javascript',
  'uses-responsive-images', 'uses-optimized-images', 'uses-text-compression',
  'server-response-time', 'redirects', 'uses-rel-preconnect', 'uses-rel-preload',
  'font-display', 'third-party-summary', 'lcp-lazy-loaded', 'prioritize-lcp-image',
];

const DIAGNOSTIC_AUDITS = [
  'total-byte-weight', 'dom-size', 'critical-request-chains', 'user-timings',
  'bootup-time', 'mainthread-work-breakdown', 'network-requests', 'network-rtt',
  'network-server-latency', 'long-tasks', 'unsized-images', 'viewport',
  'no-document-write', 'uses-passive-event-listeners', 'layout-shifts',
];

// Load failures where the server gave a definite answer, so a re-run won't change it.
const PERMANENT_LOAD_ERRORS = new Set([
  'ERRORED_DOCUMENT_REQUEST', // server responded 4xx/5xx
  'INVALID_URL',              // malformed URL, will never resolve
  'NOT_HTML',                 // served something that isn't a document
]);

// When Lighthouse can't load the page it scores every category null and repeats the same error
// on every audit. Without this a 404 looks like a clean run with no data.
function extractLoadError(lhr) {
  const runtimeError = lhr.runtimeError;
  if (!runtimeError?.code || runtimeError.code === 'NO_ERROR') return null;

  const message = runtimeError.message || 'Lighthouse was unable to load the page';
  // ERRORED_DOCUMENT_REQUEST carries the HTTP status only in its message.
  const statusMatch = /\(Status code: (\d{3})\)/.exec(message);

  return {
    code: runtimeError.code,
    message,
    statusCode: statusMatch ? Number(statusMatch[1]) : null,
    permanent: PERMANENT_LOAD_ERRORS.has(runtimeError.code),
  };
}

function extractOpportunities(audits) {
  const opportunities = [];
  for (const auditId of OPPORTUNITY_AUDITS) {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      const opportunity = {
        id: auditId,
        title: audit.title || auditId,
        description: audit.description || '',
        score: audit.score,
        scoreDisplayMode: audit.scoreDisplayMode || 'numeric',
        displayValue: audit.displayValue || null,
        numericValue: audit.numericValue || null,
        numericUnit: audit.numericUnit || null,
      };
      const details = audit.details;
      if (details?.overallSavingsMs) opportunity.savingsMs = Math.round(details.overallSavingsMs);
      if (details?.overallSavingsBytes) opportunity.savingsBytes = Math.round(details.overallSavingsBytes);
      if (details?.items && Array.isArray(details.items)) {
        opportunity.items = details.items.slice(0, 10).map(item => ({
          url: item.url || null,
          wastedBytes: item.wastedBytes || null,
          wastedMs: item.wastedMs || null,
          totalBytes: item.totalBytes || null,
        }));
      }
      opportunities.push(opportunity);
    }
  }
  return opportunities.sort((a, b) => {
    const aMs = a.savingsMs || 0;
    const bMs = b.savingsMs || 0;
    if (aMs !== bMs) return bMs - aMs;
    return (b.savingsBytes || 0) - (a.savingsBytes || 0);
  });
}

function extractDiagnostics(audits) {
  const diagnostics = [];
  for (const auditId of DIAGNOSTIC_AUDITS) {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 1) {
      diagnostics.push({
        id: auditId,
        title: audit.title || auditId,
        description: audit.description || '',
        score: audit.score,
        displayValue: audit.displayValue || null,
        numericValue: audit.numericValue || null,
      });
    }
  }
  return diagnostics;
}

// Timings are milliseconds. cls is the metric itself (0.1 is the "good" line), not a percentage.
export function summarize(lhr) {
  const categories = lhr.categories || {};
  const audits = lhr.audits || {};
  const score = id => (categories[id]?.score != null ? Math.round(categories[id].score * 100) : null);
  const value = id => (audits[id]?.numericValue != null ? Math.round(audits[id].numericValue * 1000) / 1000 : null);
  // A paint or load time of exactly 0 means nothing was measured.
  const timing = id => (audits[id]?.numericValue > 0 ? value(id) : null);

  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    lcp: timing('largest-contentful-paint'),
    fcp: timing('first-contentful-paint'),
    cls: value('cumulative-layout-shift'),
    tbt: value('total-blocking-time'),
    si: timing('speed-index'),
    tti: timing('interactive'),
    inp: value('interaction-to-next-paint'),
    failing: Object.values(audits)
      .filter(a => a.score !== null && a.score < 1
        && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'notApplicable')
      .map(a => ({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue ?? null })),
    opportunities: extractOpportunities(audits),
    diagnostics: extractDiagnostics(audits),
    formFactor: lhr.configSettings?.formFactor || 'mobile',
    loadError: extractLoadError(lhr),
  };
}

// The report to keep on disk: the fields that explain a run, without the screenshots.
export function trimReport(lhr) {
  const trimmed = {
    categories: lhr.categories,
    audits: lhr.audits,
    configSettings: lhr.configSettings,
    environment: lhr.environment,
    fetchTime: lhr.fetchTime,
    finalUrl: lhr.finalUrl,
    requestedUrl: lhr.requestedUrl,
    runWarnings: lhr.runWarnings,
    lighthouseVersion: lhr.lighthouseVersion,
    // The one field that names why a run produced nothing.
    runtimeError: lhr.runtimeError
      ? { code: lhr.runtimeError.code ?? null, message: lhr.runtimeError.message ?? null }
      : null,
  };
  if (trimmed.audits && typeof trimmed.audits === 'object') {
    const auditsCopy = { ...trimmed.audits };
    delete auditsCopy['full-page-screenshot'];
    delete auditsCopy['final-screenshot'];
    delete auditsCopy['screenshot-thumbnails'];
    trimmed.audits = auditsCopy;
  }
  return trimmed;
}

// A stack trace holds absolute paths from this machine and says nothing the code and message don't.
// These reports can end up in a public repo, and a failed load puts one on every audit.
function dropErrorStacks(lhr) {
  if (lhr.runtimeError) lhr.runtimeError = { code: lhr.runtimeError.code, message: lhr.runtimeError.message };
  for (const audit of Object.values(lhr.audits ?? {})) delete audit.errorStack;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// A timed-out run keeps going inside Lighthouse, which can't be cancelled. Closing the browser under
// it or starting the next run on top of it breaks both, so give it time to end first.
const unwind = run => withTimeout(run, 30_000, 'Cleanup').catch(() => {});

// A browser that won't close gets killed, so it can't hold up the next call.
const closeBrowser = browser => withTimeout(browser.close(), 10_000, 'Closing the browser')
  .catch(() => browser.process()?.kill('SIGKILL'));

// Lighthouse keeps global performance marks per process, so overlapping runs break each other.
let lastRun = Promise.resolve();

// Calls work(browser, track) in a fresh browser once every earlier call has finished. track(run) names
// the Lighthouse run that cleanup has to wait for. A failed or timed-out call rejects at once; the next
// call still waits for its cleanup.
function inFreshBrowser(work) {
  let finished;
  const turn = lastRun;
  lastRun = new Promise(resolve => { finished = resolve; });
  return turn.then(async () => {
    let browser = null;
    let run = Promise.resolve();
    const cleanUp = () => unwind(run)
      .then(() => browser && closeBrowser(browser))
      .then(() => unwind(run))
      .catch(() => {})
      .finally(finished);
    try {
      browser = await launchBrowser();
      const result = await work(browser, started => (run = started));
      await cleanUp();
      return result;
    } catch (error) {
      cleanUp();
      throw error;
    }
  });
}

/**
 * One Lighthouse navigation in a fresh browser, so the HTTP cache is cold.
 * `seed` is a script that runs before any app code (for example to fill localStorage); it needs
 * disableStorageReset or Lighthouse would wipe what it wrote. Third-party requests are not blocked, so
 * a page's own tags count toward its scores.
 *
 * Returns { summary, lhr, rawReport, html }. rawReport is trimReport(lhr): write that one to disk.
 * The security engine takes either report; it is a separate call, in security.mjs.
 */
export function runLighthouse(url, formFactor = 'mobile', { seed = null, timeoutMs = 60_000 } = {}) {
  return inFreshBrowser(async (browser, track) => {
    const page = await browser.newPage();
    if (seed) await page.evaluateOnNewDocument(seed);

    const flags = { output: ['json', 'html'], logLevel: 'error', onlyCategories: CATEGORIES };
    if (seed) flags.disableStorageReset = true;

    const result = await withTimeout(track(lighthouse(url, flags, configFor(formFactor), page)), timeoutMs, 'Lighthouse');
    if (!result || !result.lhr) throw new Error('Lighthouse returned no results');

    const { lhr } = result;
    dropErrorStacks(lhr);
    const summary = summarize(lhr);
    // A page that never loaded has nothing worth rendering.
    const html = summary.loadError ? null : generateReport(lhr, 'html');
    return { summary, lhr, rawReport: trimReport(lhr), html };
  });
}

// Notes when the page last shifted, so settling can wait for it to stop moving, and keeps the shifts with
// no recent input until they are read.
const SHIFT_CLOCK = `(() => {
  let last = 0;
  let unread = [];
  const note = entries => {
    if (entries.length) last = performance.now();
    for (const entry of entries) if (!entry.hadRecentInput) unread.push(entry.value);
  };
  const observer = new PerformanceObserver(list => note(list.getEntries()));
  observer.observe({ type: 'layout-shift', buffered: true });
  window.__lastLayoutShift = () => {
    note(observer.takeRecords());
    return last;
  };
  window.__readShifts = () => {
    note(observer.takeRecords());
    const read = unread;
    unread = [];
    return read;
  };
})();`;

// Chrome flags shifts as input-driven for 500ms after an input. Clicking after a longer quiet spell
// keeps one action's shifts from being attributed to the next.
const QUIET_BEFORE_CLICK_MS = 600;
// A step stays open until the page has been still this long, so a shift up to this long after the last
// activity lands in its trace. One later than that can fall between two traces and count nowhere, the
// same as with Lighthouse alone. runUserFlow warns when that happens.
const QUIET_BEFORE_STEP_END_MS = 6000;

// Waits for an idle network, then for `quietMs` with no layout shift, finite animation or loading font.
// A page that never goes quiet gets `patienceMs` more than that.
async function waitForSettle(page, quietMs = QUIET_BEFORE_CLICK_MS, patienceMs = 5000) {
  await page.waitForNetworkIdle({ idleTime: 300, timeout: patienceMs }).catch(() => {});
  await page.evaluate(async (quietMs, timeoutMs) => {
    const begin = performance.now();
    const lastShift = () => window.__lastLayoutShift?.() ?? 0;
    const busy = () => document.fonts.status !== 'loaded' || document.getAnimations().some(a =>
      a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    let seenShift = lastShift();
    let quietFrom = begin;
    while (performance.now() - begin < timeoutMs) {
      await new Promise(resolve => {
        requestAnimationFrame(resolve);
        setTimeout(resolve, 100);
      });
      const shift = lastShift();
      if (shift !== seenShift || busy()) {
        seenShift = shift;
        quietFrom = performance.now();
      } else if (performance.now() - quietFrom >= quietMs) {
        return;
      }
    }
  }, quietMs, quietMs + patienceMs);
}

// CLS as the web defines it: the worst session window (shifts under 1s apart, 5s at most) over
// entries with hadRecentInput false. Timestamps are milliseconds.
export function largestShiftWindow(entries) {
  let max = 0;
  let current = 0;
  let first = Number.NEGATIVE_INFINITY;
  let prev = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (entry.hadRecentInput) continue;
    if (entry.startTime - first > 5000 || entry.startTime - prev > 1000) {
      first = entry.startTime;
      current = 0;
    }
    prev = entry.startTime;
    current += entry.value;
    max = Math.max(max, current);
  }
  return max;
}

const isShift = event => event.name === 'LayoutShift' && Boolean(event.args?.data);
const isInputShift = event => isShift(event) && Boolean(event.args.data.had_recent_input);

// The trace's shifts in every frame, as largestShiftWindow reads them.
const traceShifts = trace => (trace?.traceEvents ?? []).filter(isShift)
  .map(event => ({ startTime: event.ts / 1000, value: event.args.data.weighted_score_delta, hadRecentInput: isInputShift(event) }))
  .sort((a, b) => a.startTime - b.startTime);

const countShifts = shifts => ({
  counted: shifts.filter(s => !s.hadRecentInput).length,
  excluded: shifts.filter(s => s.hadRecentInput).length,
});

// The shifts the page saw with no recent input that no step's trace holds.
function shiftsOutsideTraces(seen, gatherSteps) {
  const traced = gatherSteps.flatMap(({ artifacts }) => traceShifts(artifacts.Trace))
    .filter(s => !s.hadRecentInput).map(s => s.value);
  return seen.filter(({ value }) => {
    const match = traced.findIndex(other => Math.abs(other - value) < 1e-6);
    if (match === -1) return true;
    traced.splice(match, 1);
    return false;
  });
}

// A timespan's CLS audit counts shifts flagged hadRecentInput when they land in the first 500ms of its
// trace, a rule meant for page load. In a timespan those come from a click. So Lighthouse audits each
// timespan from a trace without those events: the CLS audit, the performance score, layout-shifts,
// cls-culprits-insight and the report then all agree. The flow keeps the trace it gathered.
async function auditWithoutInputShifts(flow) {
  const replaced = [];
  for (const { artifacts } of flow.createArtifactsJson().gatherSteps) {
    const trace = artifacts.Trace;
    if (artifacts.GatherContext.gatherMode !== 'timespan' || !trace?.traceEvents?.some(isInputShift)) continue;
    replaced.push({ artifacts, trace });
    artifacts.Trace = { ...trace, traceEvents: trace.traceEvents.filter(event => !isInputShift(event)) };
  }
  try {
    return await flow.createFlowResult();
  } finally {
    for (const { artifacts, trace } of replaced) artifacts.Trace = trace;
  }
}

// A real mouse click on the first visible button whose text matches. hadRecentInput only reacts
// to trusted input, so element.click() from page script would have its own shift counted.
async function clickButton(page, pattern) {
  const handle = await page.evaluateHandle((source, flags) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const re = new RegExp(source, flags);
    return [...document.querySelectorAll('button')].find(e => re.test(norm(e.innerText)) && e.offsetParent) || null;
  }, pattern.source, pattern.flags);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

// First load -> example loans -> plans -> choose plan -> payoff slider -> records.
// Reaches the states a URL can't.
export async function loanDeskJourney({ page, navigate, timespan, snapshot, settle, warn }) {
  await navigate('First load (empty)');

  await timespan('Load example loans', async () => {
    await clickText(page, 'Look around with example loans');
    await sleep(800);
  });
  await snapshot('Loans tab');

  await timespan('Open plans and answer questions', async () => {
    await clickTab(page, 'plans');
    await settle();
    const focused = await page.evaluate(() => {
      const input = document.querySelector('#income');
      input?.focus();
      return Boolean(input);
    });
    if (!focused) warn('Open plans and answer questions: no #income field to type in');
    await page.keyboard.type('52000', { delay: 60 });
    await sleep(600);
  });
  await snapshot('Plans tab');

  await timespan('Choose a plan and open payoff', async () => {
    const chose = await clickButton(page, /^(Choose|Use|Select|Pick)\b/i);
    if (!chose) warn('Choose a plan and open payoff: no plan button to choose');
    await sleep(500);
    await settle();
    await clickTab(page, 'payoff');
    await sleep(500);
  });

  await timespan('Drag extra payment slider', async () => {
    await page.evaluate(() => document.querySelector('input[type="range"]')?.scrollIntoView({ block: 'center' }));
    await settle();
    const rect = await page.evaluate(() => {
      const box = document.querySelector('input[type="range"]')?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
    });
    if (rect) {
      const y = rect.y + rect.h / 2;
      await page.mouse.move(rect.x + 4, y);
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) {
        await page.mouse.move(rect.x + 4 + (rect.w - 8) * (i / 24), y);
        await sleep(40);
      }
      await page.mouse.up();
    } else {
      warn('Drag extra payment slider: no slider on the page');
    }
    await sleep(600);
  });
  await snapshot('Payoff tab');

  await timespan('Records and snapshot', async () => {
    await clickTab(page, 'records');
    await settle();
    const saved = await clickButton(page, /snapshot/i);
    if (!saved) warn('Records and snapshot: no snapshot button');
    await sleep(600);
  });
  await snapshot('Records tab');
}

/**
 * A Lighthouse user flow in a fresh browser. `stepsFn` defaults to loanDeskJourney and receives:
 *
 *   page                                 the Puppeteer page
 *   navigate(name, target = url, flags)  a page load
 *   timespan(name, fn)                   interactions; settles before fn and before the step ends
 *   snapshot(name)                       the page as it stands
 *   settle()                             wait for the page to stop moving
 *   warn(message)                        adds to the result's warnings
 *
 * Click with real input (Puppeteer's mouse or ElementHandle.click), and settle() before every
 * click after a step's first.
 *
 * Returns { formFactor, steps, warnings, html, flowResult }, with each step being { name,
 * gatherMode, ...summarize(lhr), shiftEntries }. Lighthouse audits a timespan from its trace without
 * the shifts flagged hadRecentInput, so its cls only counts hadRecentInput false, in every frame and
 * across page loads, and performance, failing, diagnostics and the report agree with it. shiftEntries
 * says how many trace entries it counted and left out. A navigation keeps Lighthouse's own cls: no user
 * input happens during a load, and mobile emulation makes Chrome flag the first 500ms as input-driven,
 * so the filter would hide real load shifts there. A snapshot measures no cls. A shift between two
 * traces counts in no step, as with Lighthouse alone, and adds a warning. On later Chrome one in the
 * 500ms after a viewport change below comes flagged as input-driven, so it adds none.
 *
 * Lighthouse emulates the device through a CDP session of its own, which a navigation or timespan closes
 * when it ends. Chrome 146 kept the page at the emulated size after that. Later Chrome goes back to the
 * window's size, and a snapshot, which emulates nothing, would audit that layout. So the size is put
 * back as soon as a step ends, in a session that stays open. Only the size: dpr, touch and user agent
 * fall back on every Chrome, and that is what snapshots read. The page spends about 15ms at the
 * window's size, and settling before a snapshot lets it finish laying out again. Later Chrome also
 * flags the shifts of the next 500ms as input-driven when the page turns mobile, which Lighthouse does
 * just before a timespan's trace starts. Chrome 146 did not, so that session turns the page mobile
 * before settling into a timespan, and Lighthouse finds it done. dpr, touch and user agent still change
 * as the trace starts, as they did on Chrome 146.
 */
export function runUserFlow(url, formFactor = 'mobile', stepsFn = loanDeskJourney, { name = 'Loan Desk core journey', timeoutMs = 420_000 } = {}) {
  return inFreshBrowser(async (browser, track) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(SHIFT_CLOCK);
    const flow = await startFlow(page, { name, config: configFor(formFactor) });
    const { width, height, mobile } = configFor(formFactor).settings.screenEmulation;
    const viewport = await page.createCDPSession();
    const holdViewport = async () => {
      await viewport.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 0, mobile: false });
      await page.evaluate(async (w, h) => {
        for (let tries = 0; tries < 50 && (innerWidth !== w || innerHeight !== h); tries++) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }, width, height).catch(() => {});
    };

    const warnings = [];
    const seenShifts = [];
    const readShifts = async where => {
      const values = await page.evaluate(() => window.__readShifts?.() ?? []).catch(() => []);
      seenShifts.push(...values.map(value => ({ value, where })));
    };
    const context = {
      page,
      url,
      settle: () => waitForSettle(page),
      warn: message => warnings.push(message),
      navigate: async (stepName, target = url, flags = {}) => {
        await readShifts(`Before ${stepName}`);
        await flow.navigate(target, { name: stepName, onlyCategories: CATEGORIES, ...flags });
        await holdViewport();
      },
      timespan: async (stepName, fn) => {
        if (mobile) await viewport.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 0, mobile });
        await waitForSettle(page);
        await flow.startTimespan({ name: stepName });
        // Read once tracing has begun, so a shift during its setup is still put before this step.
        await readShifts(`Before ${stepName}`);
        await waitForSettle(page);
        await fn();
        await waitForSettle(page, QUIET_BEFORE_STEP_END_MS);
        await flow.endTimespan();
        await holdViewport();
      },
      snapshot: async stepName => {
        await waitForSettle(page);
        const size = await page.evaluate(() => `${innerWidth}x${innerHeight}`);
        if (size !== `${width}x${height}`) warnings.push(`${stepName}: audited at ${size}, not ${width}x${height}`);
        await flow.snapshot({ name: stepName, onlyCategories: CATEGORIES });
      },
    };
    const journey = async () => {
      await stepsFn(context);
      await readShifts('After the last step');
    };
    await withTimeout(track(journey()), timeoutMs, 'User flow');

    const flowResult = await auditWithoutInputShifts(flow);
    const { gatherSteps } = flow.createArtifactsJson();
    for (const { value, where } of shiftsOutsideTraces(seenShifts, gatherSteps)) {
      warnings.push(`${where}: a layout shift of ${value.toFixed(3)} with no recent input landed outside every trace, so no step counts it`);
    }
    const steps = flowResult.steps.map((step, i) => {
      const { lhr } = step;
      dropErrorStacks(lhr);
      let shiftEntries = null;
      if (lhr.gatherMode === 'timespan') {
        const shifts = traceShifts(gatherSteps[i].artifacts.Trace);
        shiftEntries = countShifts(shifts);
        const audit = lhr.audits['cumulative-layout-shift'];
        audit.description += ' Read from this step\'s trace, leaving out shifts with hadRecentInput.';
        // The audit has to match the rule above. If it ever stops doing so, say it.
        if (audit.numericValue != null && Math.abs(audit.numericValue - largestShiftWindow(shifts)) > 1e-6) {
          warnings.push(`${step.name}: cls ${audit.numericValue} is not the worst window of its shifts without recent input, ${largestShiftWindow(shifts)}`);
        }
      }
      return { name: step.name, gatherMode: lhr.gatherMode, ...summarize(lhr), shiftEntries };
    });
    return { formFactor, steps, warnings, html: generateReport(flowResult, 'html'), flowResult };
  });
}
