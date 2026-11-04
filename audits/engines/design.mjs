// Design audit. Adapted from PerfMaster's design engine.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sleep } from '../lib/browser.mjs';
import {
  engineRuleId,
  themeIdForRule,
  coerceRenderContext,
  PAGE_LEVEL_RULE_IDS,
  WCAG_BY_RULE,
} from './finding-postprocess.mjs';

// Must match the version reported by vendor/m3-audit.standalone.js.
export const ENGINE_VERSION = '1.3.0';

const M3_RUN_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 20_000;

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// --- Engine source loader ---

let m3Src = null;
function loadM3AuditSource() {
  if (m3Src) return m3Src;
  m3Src = readFileSync(new URL('./vendor/m3-audit.standalone.js', import.meta.url), 'utf8');
  return m3Src;
}

// --- In-page snapshots and probes ---

const ANIMATION_SNAPSHOT = `(() => {
  const anims = document.getAnimations().map((a) => {
    let target = "?", name = "";
    try {
      const t = a.effect && a.effect.target;
      target = t ? (t.tagName.toLowerCase() + (t.className && typeof t.className === "string" ? "." + t.className.trim().split(/\\s+/).slice(0,2).join(".") : "")) : "?";
      name = a.animationName || a.transitionProperty || a.constructor.name;
    } catch {}
    let dur = 0, iter = 1;
    try { const tm = a.effect.getComputedTiming(); dur = tm.duration || 0; iter = tm.iterations; } catch {}
    return { target, name, dur: Math.round(dur), infinite: iter === Infinity, state: a.playState };
  });
  return { count: anims.length, running: anims.filter((a) => a.state === "running").length, anims: anims.slice(0, 40) };
})()`;

export async function snapshotAnimations(page) {
  try {
    return await withTimeout(page.evaluate(ANIMATION_SNAPSHOT), PROBE_TIMEOUT_MS, 'animation snapshot');
  } catch {
    return undefined;
  }
}

// Native lazy images never fetch and content-visibility:auto sections never render until they are
// scrolled to, so force both eager. Then scroll with a re-measured height (lazy loaders grow the
// page mid-pass) in viewport-sized steps so IntersectionObserver reveals and JS lazy-loaders fire,
// ending with a bottom dwell.
export async function runScrollPass(page) {
  try {
    await withTimeout(
      page.evaluate(() => {
        document.querySelectorAll('img[loading="lazy"]').forEach(img => {
          img.loading = 'eager';
        });
        document.querySelectorAll('*').forEach(el => {
          if (getComputedStyle(el).contentVisibility === 'auto') {
            el.style.setProperty('content-visibility', 'visible', 'important');
          }
        });
      }),
      PROBE_TIMEOUT_MS,
      'capture prep',
    );
    await withTimeout(
      page.evaluate(async () => {
        let y = 0;
        let lastH = 0;
        for (let guard = 0; guard < 80; guard++) {
          const h = document.body.scrollHeight;
          if (y >= h && h === lastH) break;
          lastH = h;
          window.scrollTo(0, y);
          y += Math.max(400, Math.round(window.innerHeight * 0.8));
          await new Promise(r => setTimeout(r, 200));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 600));
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 400));
      }),
      45_000,
      'scroll pass',
    );
    // Let the eager-loaded images and any scroll-triggered fetches settle.
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => {});
  } catch {
    /* non-fatal */
  }
}

// Hover up to 6 primary controls and record whether anything visually changes.
export async function runHoverProbe(page) {
  const results = [];
  try {
    const hoverables = await page.$$('a[href], button');
    for (const el of hoverables.slice(0, 6)) {
      try {
        // Label for the prose, selector for the evidence: a finding needs the node, not just its text.
        const { label, selector } = await el.evaluate(n => ({
          label: (n.textContent || n.getAttribute('aria-label') || '').trim().slice(0, 30),
          selector: n.tagName.toLowerCase()
            + (n.id ? `#${n.id}` : '')
            + (typeof n.className === 'string' && n.className.trim()
              ? `.${n.className.trim().split(/\s+/)[0]}`
              : ''),
        }));
        const styleKey = n => {
          const c = getComputedStyle(n);
          return c.backgroundColor + '|' + c.color + '|' + c.transform + '|' + c.boxShadow;
        };
        const before = await el.evaluate(styleKey);
        await withTimeout(el.hover(), 2000, 'hover');
        await sleep(250);
        const after = await el.evaluate(styleKey);
        results.push({ label, selector, changes: before !== after });
      } catch {
        /* detached or unhoverable */
      }
    }
  } catch {
    /* non-fatal */
  } finally {
    // Park the cursor and dismiss any menu or tooltip the probe opened.
    try { await page.mouse.move(0, 0); } catch { /* noop */ }
    try { await page.keyboard.press('Escape'); } catch { /* noop */ }
  }
  return results;
}

// Reload under prefers-reduced-motion: reduce and count surviving animations. The emulation persists
// on the page, so it must be cleared afterwards or it silently applies to the next pass.
export async function runReducedMotionProbe(page) {
  try {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await sleep(1200);
    const snapshot = (await snapshotAnimations(page)) ?? null;
    return { emulated: true, snapshot, ungatedCount: snapshot ? snapshot.running : null };
  } catch {
    return { emulated: false, snapshot: null, ungatedCount: null };
  } finally {
    try { await page.emulateMediaFeatures([]); } catch { /* noop */ }
  }
}

// --- M3 engine run ---

async function runM3Audit(page, opts = {}) {
  try {
    const src = loadM3AuditSource();
    // evaluate(string) goes through CDP Runtime.evaluate and is immune to page CSP (addScriptTag is
    // not). The flag must be set before the source runs or the standalone trailer autoruns the audit
    // a second time.
    await withTimeout(page.evaluate(`window.M3AuditAutorun = false;\n${src}`), M3_RUN_TIMEOUT_MS, 'M3 inject');
    // Live Element refs (`el`) in examples are unserializable over CDP, so strip them in the page
    // before the report crosses the boundary. Run options are JSON-encoded, never interpolated raw.
    const runOpts = JSON.stringify({
      json: true,
      ...(opts.viewport ? { viewport: opts.viewport } : {}),
      ...(opts.siteType ? { siteType: opts.siteType } : {}),
    });
    const report = await withTimeout(
      page.evaluate(
        `JSON.parse(JSON.stringify(window.M3Audit.run(${runOpts}), (k, v) => (k === 'el' ? undefined : v)))`,
      ),
      M3_RUN_TIMEOUT_MS,
      'M3 run',
    );
    if (!report || !report.buckets) {
      return { report: null, error: 'M3Audit returned no report' };
    }
    return { report: sanitizeReport(report) };
  } catch (err) {
    return { report: null, error: String(err.message || err).slice(0, 300) };
  }
}

// Cap the fat section arrays so the report stays a few KB.
export function sanitizeReport(report) {
  const s = report.sections || {};
  const cap = (obj, key, n) => {
    if (obj && Array.isArray(obj[key])) obj[key] = obj[key].slice(0, n);
  };
  cap(s.color, 'failures', 25);
  cap(s.typography, 'smallBody', 25);
  cap(s.typography, 'smallLabels', 25);
  cap(s.typography, 'tightLeading', 25);
  return report;
}

// The per-viewport audit: snapshot, scroll, snapshot, M3 run. Non-fatal by design: an engine or probe
// failure returns a null report or an empty probe, never a thrown error.
export async function runDesignAudit(page, opts = {}) {
  const started = Date.now();
  const probes = {};
  probes.animationsAtLoad = await snapshotAnimations(page);
  await runScrollPass(page);
  probes.animationsAfterScroll = await snapshotAnimations(page);
  const { report, error } = await runM3Audit(page, opts);
  return { report, probes, ...(error ? { error } : {}), durationMs: Date.now() - started };
}

// --- Finding mapping ---

const SEVERITY_MAP = {
  error: 'P1',
  warn: 'P2',
  info: 'P3',
};

// Coverage and meta notes, not issues. They stay in the report, not in the finding list.
const COVERAGE_NOTE_RE = /skipped|unknown|unreadable|not scored|cannot be scanned/i;

// A finding one bucket scores that already belongs to another bucket. The engine re-lists three
// motion rules (layout-animated, duration-too-long, infinite-loop) in the performance bucket as
// shallow copies tagged reusedFrom:'motion'. Bucket scores need both listings, so never filter them
// out of report.buckets. Flat, per-finding exports need exactly one: one defect, one entry.
function isReusedListing(f) {
  return typeof f.reusedFrom === 'string' && f.reusedFrom.length > 0;
}

const CATEGORY_RULES = [
  { re: /below WCAG contrast/i, category: 'Color/Contrast' },
  { re: /focus-visible|focus indicator/i, category: 'Accessibility' },
  { re: /:hover styles/i, category: 'Accessibility' },
  { re: /tap target/i, category: 'Accessibility' },
  { re: /missing alt|accessible name/i, category: 'Accessibility' },
  { re: /landmark/i, category: 'Accessibility' },
  { re: /heading-order|<h1>|type hierarchy/i, category: 'Visual Hierarchy' },
  { re: /distinct text colors|border-radius|box-shadow recipes/i, category: 'Design Consistency' },
  { re: /font-famil|font-size|reading-copy|line-height/i, category: 'Typography' },
  { re: /reduced-motion|animation|transition|easing|ease-in|decorative loop/i, category: 'Motion' },
  { re: /DOM elements/i, category: 'Performance Indicators' },
];

const BUCKET_FALLBACK_CATEGORY = {
  accessibility: 'Accessibility',
  consistency: 'Design Consistency',
  motion: 'Motion',
  performance: 'Performance Indicators',
};

const RECOMMENDATION_RULES = [
  { re: /below WCAG contrast/i, text: 'Darken the text or lighten the background until the ratio reaches 4.5:1 (3:1 for large text).' },
  { re: /tap target/i, text: 'Enlarge the control or add padding so its hit area is at least 48×48px.' },
  { re: /missing alt|accessible name/i, text: 'Add descriptive alt text (or aria-label for role=img); use alt="" only for purely decorative images.' },
  { re: /focus-visible|focus indicator/i, text: 'Add a :focus-visible outline (e.g. 2px solid with 2px offset) so keyboard focus is always visible.' },
  { re: /:hover styles/i, text: 'Add :hover feedback (background, color, or elevation change) to interactive elements.' },
  { re: /landmark/i, text: 'Add the missing landmark elements (main, nav, header, footer) so assistive tech can navigate the page.' },
  { re: /heading-order|<h1>/i, text: 'Keep heading levels sequential and use exactly one h1 per page.' },
  { re: /type hierarchy/i, text: 'Differentiate heading levels by size/weight so the visual hierarchy matches the document outline.' },
  { re: /reading-copy/i, text: 'Raise reading copy to at least 16px (12px absolute minimum for any text).' },
  { re: /line-height/i, text: 'Increase line-height to at least 1.4 on wrapping body text.' },
  { re: /distinct text colors|font-famil|font-size|border-radius|box-shadow recipes/i, text: 'Consolidate to a small token set: define CSS variables for the sanctioned values and replace ad-hoc ones.' },
  { re: /prefers-reduced-motion/i, text: 'Add an @media (prefers-reduced-motion: reduce) block that disables non-essential animation.' },
  { re: /under \d+ms|over \d+ms/i, text: 'Keep animation durations within the 50–1000ms scale — long enough to read, short enough to feel responsive.' },
  { re: /linear easing|ease-in/i, text: 'Use decelerating (ease-out/emphasized) curves for entrances and movement; avoid linear and ease-in.' },
  { re: /layout props/i, text: 'Animate transform/opacity instead of layout properties (width/height/top/left/margin) to avoid jank.' },
  { re: /decorative loop/i, text: 'Reserve infinite animation for progress indicators; give decorative loops a finite iteration count.' },
  { re: /DOM elements/i, text: 'Reduce DOM size — virtualize long lists and remove hidden or duplicated markup.' },
];

function ruleText(message) {
  for (const r of RECOMMENDATION_RULES) if (r.re.test(message)) return r.text;
  return 'Fix it once in the shared style or component that produces it, so every instance changes together.';
}

function categoryFor(message, bucket) {
  for (const r of CATEGORY_RULES) if (r.re.test(message)) return r.category;
  return BUCKET_FALLBACK_CATEGORY[bucket] || 'Design Consistency';
}

function fmtExample(e) {
  const parts = [];
  if (e.sig || e.tag) parts.push(String(e.sig || e.tag));
  if (e.sample) parts.push(`"${e.sample}"`);
  const measured = measuredOf(e);
  if (measured) parts.push(`(${measured})`);
  return parts.join(' ');
}

function measuredOf(e) {
  if (typeof e.ratio === 'number') return `${e.ratio}:1`;
  if (typeof e.w === 'number' && typeof e.h === 'number') return `${e.w}×${e.h}px`;
  if (typeof e.lineHeight === 'number') return `line-height ${e.lineHeight}`;
  if (typeof e.px === 'number') return `${e.px}px`;
  if (typeof e.dur === 'number') return `${e.dur}ms`;
  return undefined;
}

// Pick the most damning example for the evidence line.
function worstExample(f) {
  const ex = f.examples || [];
  if (!ex.length) return undefined;
  if (ex.every(e => typeof e.ratio === 'number')) {
    return ex.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
  }
  if (ex.every(e => typeof e.w === 'number' && typeof e.h === 'number')) {
    return ex.reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));
  }
  if (ex.every(e => typeof e.px === 'number')) {
    return ex.reduce((a, b) => (a.px <= b.px ? a : b));
  }
  return ex[0];
}

// Legacy fallback only. The engine emits its own `required` and that value always wins.
function requiredOf(message) {
  if (/below WCAG contrast/i.test(message)) return '≥4.5:1 (3:1 large)';
  if (/tap target|pointer target/i.test(message)) return '≥48×48px';
  if (/reading-copy/i.test(message)) return '≥16px';
  if (/line-height/i.test(message)) return '≥1.4';
  if (/under \d+ms|over \d+ms/i.test(message)) return '50–1000ms';
  return undefined;
}

function titleOf(message) {
  const cut = message.split(' — ')[0].split('. ')[0];
  return cut.length > 80 ? `${cut.slice(0, 77)}…` : cut;
}

// "Tap" is touch vocabulary, and touch is what a desktop measurement did not test. At a pointer
// viewport the same rule is a pointer target finding.
function pointerVocab(text, viewport) {
  if (!viewport || viewport.isMobile) return text;
  return text
    .replace(/tap target/g, 'pointer target')
    .replace(/Tap target/g, 'Pointer target');
}

function hasPixelMeasurement(measured) {
  return !!measured && /\d\s*(?:px|×)/i.test(measured);
}

// A pixel figure has to name the viewport it was measured at.
function withViewportClause(text, viewport) {
  if (!viewport) return text;
  return `${text} Measured at the ${viewport.width}×${viewport.height}px ` +
    `${viewport.isMobile ? 'mobile' : 'desktop'} viewport.`;
}

// Top offenders for a scope:'page' finding: a count with no location is only a statistic. The engine
// builds these itself and gives page findings no examples, so its array wins. Deriving from
// `examples` is the fallback for page-ish rules that still ship examples.
function contributorsOf(f) {
  const own = (Array.isArray(f.contributors) ? f.contributors : [])
    .map(c => ({ selector: String(c?.selector ?? '').trim(), value: String(c?.value ?? '').trim() }))
    .filter(c => c.selector);
  if (own.length) return own.slice(0, 5);
  const rows = (f.examples || [])
    .map(e => ({
      selector: String(e.sig || e.tag || '').trim(),
      value: measuredOf(e) || String(e.sample || '').slice(0, 40),
    }))
    .filter(r => r.selector);
  return rows.length ? rows.slice(0, 5) : undefined;
}

// A count is a measurement. Only rules whose examples carry a number (a ratio, a w×h, a px, a
// duration) produce one via measuredOf; the rest measure a count ("12 image(s)") or an absence, both
// just as reproducible. Without this the severity cap would demote every deterministic `error` rule
// that has no per-example number.
const COUNT_NOUN_BY_RULE = {
  'missing-alt': 'image(s) with no accessible name',
  'no-visible-focus': 'element(s) with no visible focus indicator',
  'layout-animated': 'transition(s) animating layout properties',
  'dom-size': 'DOM element(s)',
};

function countMeasurement(f, ruleId, contributors) {
  const n = typeof f.count === 'number'
    ? f.count
    : (f.examples && f.examples.length ? f.examples.length : undefined);
  if (typeof n === 'number') return `${n} ${COUNT_NOUN_BY_RULE[ruleId] || 'occurrence(s)'}`;
  // Absence rules (no :focus-visible rule, no reduced-motion block, no <h1>) read the document and
  // found zero of the required thing. That zero is the measurement, and the contributor names what
  // was looked for. No '×' here: hasPixelMeasurement would read it as a dimension.
  const first = contributors && contributors[0];
  return first ? `0 matches for ${first.selector}` : undefined;
}

// Map the M3 report's bucket findings to finding entries, one per aggregate finding, not per example.
// Stamps a stable themeId (from the rule id), scope and contributors, the viewport the numbers came
// from, renderContext and the WCAG criterion where one can be attributed.
export function m3FindingsToUXFindings(report, device, opts = {}) {
  const { viewport } = opts;
  const out = [];
  for (const [bucketName, bucket] of Object.entries(report.buckets)) {
    for (const f of bucket.findings || []) {
      if (!f || typeof f.message !== 'string') continue;
      if (f.severity === 'info' && COVERAGE_NOTE_RE.test(f.message)) continue;
      // The bucket that owns the finding exports it; a re-listing never does.
      if (isReusedListing(f)) continue;
      const worst = worstExample(f);
      const examples = (f.examples || []).slice(0, 3).map(fmtExample).filter(Boolean);
      const ruleId = engineRuleId(f.message, f.ruleId);
      const selector = worst?.sig || worst?.tag;
      const contributors = contributorsOf(f);
      const measured = (worst ? measuredOf(worst) : undefined)
        ?? countMeasurement(f, ruleId, contributors);
      // A rule that cannot name its node is page-level by definition. It must never ship as
      // scope:'element' with no selector.
      const scope = f.scope === 'page' || f.scope === 'element'
        ? f.scope
        : PAGE_LEVEL_RULE_IDS.has(ruleId) || !selector ? 'page' : 'element';
      const body = examples.length ? `${f.message} Examples: ${examples.join('; ')}.` : f.message;
      const wcagCriterion = f.wcagCriterion || WCAG_BY_RULE[ruleId];

      out.push({
        id: randomUUID(),
        severity: SEVERITY_MAP[f.severity] || 'P3',
        category: categoryFor(f.message, bucketName),
        device,
        title: pointerVocab(titleOf(f.message), viewport),
        description: pointerVocab(
          hasPixelMeasurement(measured) ? withViewportClause(body, viewport) : body,
          viewport,
        ),
        recommendation: pointerVocab(ruleText(f.message), viewport),
        source: 'engine',
        themeId: themeIdForRule(ruleId),
        scope,
        renderContext: coerceRenderContext(worst?.renderContext),
        observedOn: opts.observedOn ?? 1,
        sampleSize: opts.sampleSize ?? 1,
        ...(viewport ? { viewport } : {}),
        ...(wcagCriterion ? { wcagCriterion } : {}),
        ...(f.exceptionApplied ? { exceptionApplied: f.exceptionApplied } : {}),
        evidence: {
          measured,
          // The engine knows its own threshold; requiredOf is the legacy shim.
          required: (typeof f.required === 'string' && f.required) || requiredOf(f.message),
          selector,
          sample: worst?.sample,
          count: typeof f.count === 'number' ? f.count : (f.examples ? f.examples.length : undefined),
          ...(scope === 'page' && contributors ? { contributors } : {}),
        },
      });
    }
  }
  return out;
}

// What the engine actually covered, so a consumer can tell "the rule passed" apart from "the rule
// never got to look". A contrast pass that skipped background-image nodes has not cleared them.
// Deliberately does not skip reused listings: this is a set of which rules spoke, so a duplicate costs
// nothing, while skipping one could make a rule that fired read as never run.
export function engineCoverageFrom(report) {
  if (!report || !report.buckets) return null;
  const ruleIds = new Set();
  for (const bucket of Object.values(report.buckets)) {
    for (const f of bucket.findings || []) {
      if (!f || typeof f.message !== 'string') continue;
      if (f.severity === 'info' && COVERAGE_NOTE_RE.test(f.message)) continue;
      ruleIds.add(engineRuleId(f.message, f.ruleId));
    }
  }
  const color = report.sections?.color || {};
  const meta = report.meta || {};

  // A missing counter is not a zero: "the engine reported no skips" and "the engine reported nothing
  // at all" must stay different values.
  const count = v => (typeof v === 'number' ? v : null);
  const noneSkipped = (...vals) => vals.every(v => {
    const n = count(v);
    return n !== null && n === 0;
  });

  const sampled = count(color.sampled);

  return {
    ruleIds,
    // Complete only when something was sampled and every skip counter is present and zero. An absent
    // counter yields false (unknown means not complete).
    contrastComplete: sampled !== null && sampled > 0
      && noneSkipped(color.skippedUnknownBg, color.skippedUnparseable, color.skippedRenderContext),
    cssomComplete: noneSkipped(meta.sheetsSkipped),
    sampleComplete: meta.sampleCapped === false,
  };
}

// Findings synthesized from probe ground truth the CSSOM checks can't see.
export function probeFindings(design, device, opts = {}) {
  const stamp = {
    source: 'engine',
    scope: 'page',
    renderContext: 'dom',
    observedOn: opts.observedOn ?? 1,
    sampleSize: opts.sampleSize ?? 1,
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
  };
  const out = [];
  const motionFindings = design.report?.buckets.motion.findings || [];
  const a11yFindings = design.report?.buckets.accessibility.findings || [];

  const rm = design.probes.reducedMotion;
  const alreadyFlaggedRM = motionFindings.some(
    f => f.severity === 'error' && /prefers-reduced-motion/i.test(f.message),
  );
  // A failed probe reports ungatedCount: null. Only a measured count can fire, and silence from a
  // probe that never measured is not a pass.
  const rmMeasured = rm?.emulated === true && typeof rm.ungatedCount === 'number';
  if (rmMeasured && rm.ungatedCount > 0 && !alreadyFlaggedRM) {
    out.push({
      id: randomUUID(),
      severity: 'P2',
      category: 'Motion',
      device,
      title: `${rm.ungatedCount} animation(s) keep running under prefers-reduced-motion`,
      description:
        `Reloading with prefers-reduced-motion: reduce emulated left ${rm.ungatedCount} animation(s) ` +
        'still running — motion is not actually gated for reduced-motion users.',
      recommendation: 'Gate all non-essential animation behind @media (prefers-reduced-motion: reduce).',
      ...stamp,
      themeId: themeIdForRule('reduced-motion-ungated'),
      wcagCriterion: WCAG_BY_RULE['reduced-motion-ungated'],
      evidence: { measured: `${rm.ungatedCount} running`, required: '0 running' },
    });
  }

  const hover = design.probes.hoverProbe || [];
  const alreadyFlaggedHover = a11yFindings.some(f => /:hover styles/i.test(f.message));
  const noChange = hover.filter(h => !h.changes).length;
  if (hover.length >= 3 && noChange * 2 >= hover.length && !alreadyFlaggedHover) {
    out.push({
      id: randomUUID(),
      severity: 'P3',
      category: 'Accessibility',
      device,
      title: 'Primary controls show no hover feedback',
      description:
        `${noChange} of ${hover.length} sampled primary controls showed no visual change on hover ` +
        `(${hover.filter(h => !h.changes).map(h => h.label).filter(Boolean).slice(0, 3).join(', ')}).`,
      recommendation: 'Add :hover feedback (background, color, or elevation change) to interactive elements.',
      ...stamp,
      themeId: themeIdForRule('hover-no-feedback'),
      evidence: {
        measured: `${noChange}/${hover.length} unresponsive`,
        contributors: hover.filter(h => !h.changes && h.selector)
          .slice(0, 5)
          .map(h => ({ selector: h.selector, value: h.label || 'no hover change' })),
      },
    });
  }
  return out;
}

// --- Merge across viewports ---

export function letterGrade(score) {
  if (score == null || !isFinite(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function normBucket(r, key) {
  if (!r) return null;
  const b = r.buckets[key];
  if (!b || !b.max) return null;
  return Math.round((b.score / b.max) * 100);
}

function avgNullable(a, b) {
  if (a != null && b != null) return Math.round((a + b) / 2);
  return a ?? b;
}

// buckets are normalized 0-100 (round(score/max*100), averaged across viewports). measuredViewports
// names which viewports produced a report: a failed pass leaves a one-viewport score that otherwise
// looks exactly like a two-viewport average.
export function mergeDesignAudits(desktop, mobile) {
  const dr = desktop?.report ?? null;
  const mr = mobile?.report ?? null;
  const designScore = avgNullable(
    dr ? Math.round(dr.score) : null,
    mr ? Math.round(mr.score) : null,
  );
  const bucketKeys = ['accessibility', 'consistency', 'motion', 'performance'];
  const buckets = designScore == null
    ? null
    : Object.fromEntries(
        bucketKeys.map(k => [k, avgNullable(normBucket(dr, k), normBucket(mr, k))]),
      );

  // Hoist the static manual-checklist list to one top-level copy.
  const notAutoDetectable = dr?.notAutoDetectable ?? mr?.notAutoDetectable ?? [];
  if (dr) delete dr.notAutoDetectable;
  if (mr) delete mr.notAutoDetectable;

  const measuredViewports = [];
  if (dr) measuredViewports.push('desktop');
  if (mr) measuredViewports.push('mobile');

  return {
    engineVersion: ENGINE_VERSION,
    desktop,
    mobile,
    designScore,
    designGrade: letterGrade(designScore),
    measuredViewports,
    buckets,
    notAutoDetectable,
  };
}
