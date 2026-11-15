// Audit runner: every scan in one command. Writes one JSON per step, scoreboard.json and SUMMARY.md to --out, then
// checks budgets.json. Steps run one after another, so no scan shares the machine with another.
// Usage: node run.mjs --help
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launchBrowser, sleep } from './lib/browser.mjs';
import { STATES, seedScript } from './lib/fixtures.mjs';
import { ensureServer, firstLoadJs } from './lib/app-server.mjs';
import { runLighthouse, runUserFlow, trimReport } from './engines/lighthouse.mjs';
import { runSecurityScan } from './engines/security.mjs';
import { runGeoScan } from './engines/geo.mjs';
import { ENGINE_VERSION, mergeDesignAudits, probeFindings, runDesignAudit, runHoverProbe, runReducedMotionProbe } from './engines/design.mjs';
import { runDeterministicUXScan } from './engines/ux-heuristics.mjs';
import { collectPageContext } from './engines/page-context.mjs';
import { postProcessFindings } from './engines/finding-postprocess.mjs';
import {
  analyzeHeaders, analyzeRedirects, checkBrokenLinks, checkWebMcp, validateMeta, validateSitemap, validateStructuredData,
} from './engines/site-tools.mjs';
import { runResponsiveProbe, WIDTHS } from './probes/responsive.mjs';
import { runInpProbe, STEP_NAMES as INP_STEPS } from './probes/inp.mjs';
import { runReadableProbe, THROTTLE as READABLE_THROTTLE, VIEWPORT as READABLE_VIEWPORT } from './probes/readable.mjs';

const KIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LIVE_URL = 'https://cense-loan-desk.vercel.app/';
const STEPS = ['lighthouse', 'flow', 'security', 'geo', 'design', 'ux', 'tools', 'responsive', 'inp', 'readable'];
const FORM_FACTORS = ['mobile', 'desktop'];
// The viewports the UX and design steps measure at, and the site type they are given.
const UX_VIEWPORTS = {
  desktop: { width: 1440, height: 900, dpr: 1, isMobile: false },
  mobile: { width: 375, height: 812, dpr: 1, isMobile: true },
};
const SITE_TYPE = 'saas';
// A first visit, and a returning borrower with the eight-loan fixture in localStorage before any app code runs.
const LIGHTHOUSE_PAGES = [
  { page: 'empty', seeded: false },
  { page: 'seeded', seeded: true },
];
const TOOLS = [
  ['header-check', analyzeHeaders],
  ['meta-validate', validateMeta],
  ['structured-data', validateStructuredData],
  ['sitemap-validate', validateSitemap],
  ['redirect-check', analyzeRedirects],
  ['broken-links', checkBrokenLinks],
  ['webmcp-check', checkWebMcp],
];

const HELP = `Usage: node run.mjs [options]

Runs the audit steps one after another, then writes one JSON per step, scoreboard.json and SUMMARY.md.

  --target local|live  local (default) audits http://localhost:3100/. If nothing answers there, it builds the
                       app when there is no production build, runs next start -p 3100 from the repository
                       root, and stops it at the end. live audits ${LIVE_URL}
  --url <url>          audit this URL instead (another port, a preview deployment); starts nothing
  --only <steps>       comma list, all by default: ${STEPS.join(',')}
  --runs <n>           Lighthouse runs per page, where the median by performance score counts, and cold loads per
                       readable scenario, where each mark's median counts (default 3)
  --out <dir>          results folder (default results/latest); nothing is written outside it
  --compare <dir>      also report what changed against <dir>/scoreboard.json
  --keep-raw           also keep each page's Lighthouse report (JSON and HTML) and the flow reports
  --quick              INP probe at 8 loans and 4x CPU only, once; readable once per scenario, whatever --runs says
  --help               show this

Exit code: 0 when every budget in budgets.json holds, 1 when one fails, 2 when the audit or one of its steps could not run.
A step that crashes is recorded in SUMMARY.md, and the other steps still run.`;

const log = (...args) => console.error(...args);
const errorText = err => String(err?.message ?? err);
const since = t0 => Math.round((Date.now() - t0) / 100) / 10;
const secs = s => (s < 0.1 ? 'under 0.1 s' : `${s} s`);

// --- Options ---

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: 'string', default: 'local' },
      url: { type: 'string' },
      only: { type: 'string' },
      runs: { type: 'string', default: '3' },
      out: { type: 'string' },
      compare: { type: 'string' },
      'keep-raw': { type: 'boolean', default: false },
      quick: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (!['local', 'live'].includes(values.target)) throw new Error(`--target must be local or live, not "${values.target}"`);
  if (values.url) {
    let parsed;
    try {
      parsed = new URL(values.url);
    } catch {
      throw new Error(`--url is not a URL: "${values.url}"`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--url must be http or https');
  }
  const steps = values.only
    ? values.only.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [...STEPS];
  const unknown = steps.filter(s => !STEPS.includes(s));
  if (unknown.length) throw new Error(`Unknown step(s) in --only: ${unknown.join(', ')}. Steps: ${STEPS.join(', ')}`);
  if (!steps.length) throw new Error('--only names no step');
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a whole number of at least 1, not "${values.runs}"`);
  return {
    target: values.target,
    url: values.url ?? null,
    steps: STEPS.filter(s => steps.includes(s)),
    onlyGiven: Boolean(values.only),
    runs,
    out: values.out ?? null,
    compare: values.compare ?? null,
    keepRaw: values['keep-raw'],
    quick: values.quick,
    help: values.help,
  };
}

let opts;
try {
  opts = parseOptions(process.argv.slice(2));
} catch (err) {
  console.error(`${errorText(err)}\n\n${HELP}`);
  process.exit(2);
}
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const outDir = opts.out ? path.resolve(opts.out) : path.join(KIT_DIR, 'results', 'latest');
// Read before anything is written: --compare may name the --out folder itself.
const previous = opts.compare ? loadScoreboard(opts.compare) : null;
const budgets = JSON.parse(readFileSync(path.join(KIT_DIR, 'budgets.json'), 'utf8'));

// Every file the run writes goes through here, so nothing lands outside the results folder.
function writeOut(rel, content) {
  const file = path.join(outDir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}
const writeJson = (rel, data) => writeOut(rel, `${JSON.stringify(data, null, 1)}\n`);

// Chrome sometimes fails to start on a busy machine. Only that error is retried: anything else is a result.
async function retryLaunch(fn, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !/Failed to launch the browser process/i.test(errorText(err))) throw err;
      log(`  the browser failed to start, trying again (${attempt}/${attempts - 1})`);
      await sleep(2000);
    }
  }
}

// --- Steps ---
// Each returns { data, errors, units }: errors lists the parts that failed, units how many parts there were.

const RUN_FIELDS = ['performance', 'accessibility', 'bestPractices', 'seo', 'lcp', 'fcp', 'cls', 'tbt', 'si', 'tti'];
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k] ?? null]));
const pageLabel = key => {
  const [page, ff] = key.split('-');
  return `${page[0].toUpperCase()}${page.slice(1)}, ${ff}`;
};

// The middle run by performance score. With an even count, the lower of the two middle runs.
function medianByPerformance(runs) {
  if (!runs.length) return null;
  const sorted = [...runs].sort((a, b) => (a.summary.performance ?? -1) - (b.summary.performance ?? -1));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

async function lighthouseStep(ctx) {
  const pages = {};
  const errors = [];
  for (const { page, seeded } of LIGHTHOUSE_PAGES) {
    for (const ff of FORM_FACTORS) {
      const key = `${page}-${ff}`;
      const runs = [];
      for (let i = 1; i <= ctx.runs; i++) {
        try {
          const r = await retryLaunch(() => runLighthouse(ctx.url, ff, { seed: seeded ? seedScript() : null }));
          runs.push(r);
          const s = r.summary;
          log(`  ${key} run ${i}/${ctx.runs}: perf ${s.performance} a11y ${s.accessibility} bp ${s.bestPractices} seo ${s.seo} lcp ${s.lcp} fcp ${s.fcp} cls ${s.cls} tbt ${s.tbt}${s.loadError ? ` load error ${s.loadError.code}` : ''}`);
        } catch (err) {
          runs.push({ error: errorText(err) });
          log(`  ${key} run ${i}/${ctx.runs}: FAILED ${errorText(err)}`);
        }
      }
      const median = medianByPerformance(runs.filter(r => r.summary));
      if (!median) errors.push(`${key}: every run failed`);
      pages[key] = {
        page,
        formFactor: ff,
        seeded,
        medianRun: median ? runs.indexOf(median) + 1 : null,
        summary: median ? median.summary : null,
        runs: runs.map((r, i) => (r.summary
          ? { run: i + 1, ...pick(r.summary, RUN_FIELDS), loadError: r.summary.loadError }
          : { run: i + 1, error: r.error })),
      };
      if (median && ctx.keepRaw) {
        writeJson(`lighthouse/${key}.json`, median.rawReport);
        if (median.html) writeOut(`lighthouse/${key}.html`, median.html);
      }
      // The security scan reads mixed content, CSP and link audits from a Lighthouse report of the same page.
      if (key === 'empty-mobile' && median) ctx.securityLhr = median.lhr;
    }
  }
  const data = { url: ctx.url, runs: ctx.runs, medianBy: 'performance', pages };
  writeJson('lighthouse.json', data);
  return { data, errors, units: Object.keys(pages).length };
}

// Only what each mode measures: a snapshot has no performance score or timings, a timespan no accessibility or SEO.
function flowBrief(s) {
  const snap = s.gatherMode === 'snapshot';
  const span = s.gatherMode === 'timespan';
  return [
    !snap && `perf ${s.performance}`,
    !span && `a11y ${s.accessibility}`,
    `bp ${s.bestPractices}`,
    !span && `seo ${s.seo}`,
    span && `inp ${s.inp}`,
    !snap && `cls ${s.cls}`,
    !snap && `tbt ${s.tbt}`,
  ].filter(Boolean).join(' ');
}

async function flowStep(ctx) {
  const formFactors = {};
  const errors = [];
  for (const ff of FORM_FACTORS) {
    try {
      const r = await retryLaunch(() => runUserFlow(ctx.url, ff));
      formFactors[ff] = { steps: r.steps, warnings: r.warnings };
      for (const s of r.steps) log(`  ${ff} [${s.gatherMode}] ${s.name}: ${flowBrief(s)}`);
      for (const w of r.warnings) log(`  ${ff} warning: ${w}`);
      if (ctx.keepRaw) {
        writeOut(`flow/${ff}.html`, r.html);
        writeJson(`flow/${ff}.json`, r.flowResult.steps.map(s => ({ name: s.name, lhr: trimReport(s.lhr) })));
      }
    } catch (err) {
      formFactors[ff] = { error: errorText(err) };
      errors.push(`${ff}: ${errorText(err)}`);
      log(`  ${ff}: FAILED ${errorText(err)}`);
    }
  }
  const data = { url: ctx.url, journey: 'Loan Desk core journey', formFactors };
  writeJson('flow.json', data);
  return { data, errors, units: FORM_FACTORS.length };
}

async function securityStep(ctx) {
  const lhr = ctx.securityLhr;
  const report = await runSecurityScan(ctx.url, lhr);
  const data = {
    url: ctx.url,
    lighthouseChecks: lhr
      ? 'included, from the median mobile Lighthouse run of the empty page'
      : 'skipped: the lighthouse step did not run in this invocation, so mixed content, CSP, external scripts and noopener were not checked',
    ...report,
  };
  writeJson('security.json', data);
  log(`  score ${report.score} ${JSON.stringify(report.categories)}`);
  return { data, errors: [], units: 1 };
}

async function geoStep(ctx) {
  const browser = await retryLaunch(() => launchBrowser());
  try {
    const page = await browser.newPage();
    await page.goto(ctx.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // The engine compares the rendered page with the raw HTML, so client rendering gets time to finish.
    await sleep(10000);
    const report = await runGeoScan(ctx.url, page);
    const data = { url: ctx.url, ...report };
    writeJson('geo.json', data);
    log(`  score ${report.geoScore} parity ${report.contentParity}% raw words ${report.ssrWordCount} rendered words ${report.csrWordCount}`);
    return { data, errors: [], units: 1 };
  } finally {
    await browser.close();
  }
}

// One state at one form factor, in this order: page context, design audit, deterministic UX scan (screenshot and
// DOM), then on desktop the hover and reduced-motion probes that feed the probe findings.
async function runStatePass(url, stateName, ff, withUx) {
  const state = STATES[stateName];
  const vp = UX_VIEWPORTS[ff];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    if (state.seeded) await page.evaluateOnNewDocument(seedScript());
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await sleep(600);
    await state.enter(page);
    await sleep(600);
    const pageContext = await collectPageContext(page, url, response, SITE_TYPE);
    const design = await runDesignAudit(page, { viewport: vp, siteType: SITE_TYPE });
    let report = null;
    let uxError = null;
    if (withUx) {
      try {
        report = await runDeterministicUXScan(url, page, ff, design, pageContext);
      } catch (err) {
        uxError = errorText(err);
      }
    }
    if (ff === 'desktop') {
      design.probes.hoverProbe = await runHoverProbe(page);
      // Reloads the page, so it goes last: a seeded tab state resets to Loans.
      design.probes.reducedMotion = await runReducedMotionProbe(page);
    }
    const extras = postProcessFindings(probeFindings(design, ff, { viewport: vp }), { device: ff, viewport: vp, pageContext });
    return { state: stateName, formFactor: ff, pageContext, design, report, uxError, extras };
  } finally {
    await browser.close();
  }
}

// The design and ux steps read the same page passes, so with both selected each state loads once.
async function statePass(ctx, stateName, ff) {
  const key = `${stateName}-${ff}`;
  if (!ctx.passes.has(key)) {
    let pass;
    try {
      pass = await retryLaunch(() => runStatePass(ctx.url, stateName, ff, ctx.withUx));
    } catch (err) {
      pass = { state: stateName, formFactor: ff, error: errorText(err) };
    }
    ctx.passes.set(key, pass);
  }
  return ctx.passes.get(key);
}

async function designStep(ctx) {
  const states = {};
  const errors = [];
  let notAutoDetectable = [];
  for (const stateName of Object.keys(STATES)) {
    const passes = {};
    for (const ff of ['desktop', 'mobile']) {
      passes[ff] = await statePass(ctx, stateName, ff);
      const why = passes[ff].error ?? (passes[ff].design?.report ? null : passes[ff].design?.error ?? 'no design report');
      if (why) errors.push(`${stateName}-${ff}: ${why}`);
    }
    // The merge deletes a field from the reports it is given, and the ux step still writes them whole.
    const merged = mergeDesignAudits(structuredClone(passes.desktop.design ?? null), structuredClone(passes.mobile.design ?? null));
    const { notAutoDetectable: list, ...rest } = merged;
    if (list?.length) notAutoDetectable = list;
    states[stateName] = rest;
    const tagScore = ff => {
      const r = passes[ff].design?.report;
      return r ? `${r.score} ${r.grade}` : 'failed';
    };
    log(`  ${stateName}: desktop ${tagScore('desktop')}, mobile ${tagScore('mobile')}, merged ${merged.designScore ?? '–'} ${merged.designGrade ?? ''}`);
  }
  const data = { url: ctx.url, engineVersion: ENGINE_VERSION, siteType: SITE_TYPE, viewports: UX_VIEWPORTS, states, notAutoDetectable };
  writeJson('design.json', data);
  return { data, errors, units: Object.keys(STATES).length * 2 };
}

// The screenshot is written next to the report as a file, so the JSON keeps no image data.
const stripImages = value => JSON.parse(JSON.stringify(value, (k, v) => (/Base64$/.test(k) || k === 'screenshot' ? undefined : v)));

async function uxStep(ctx) {
  const screens = [];
  const errors = [];
  for (const stateName of Object.keys(STATES)) {
    for (const ff of ['desktop', 'mobile']) {
      const tag = `${stateName}-${ff}`;
      const p = await statePass(ctx, stateName, ff);
      if (p.error || !p.report) {
        const error = p.error ?? p.uxError ?? 'no UX report';
        errors.push(`${tag}: ${error}`);
        screens.push({ tag, state: stateName, formFactor: ff, error });
        log(`  ${tag}: FAILED ${error}`);
        continue;
      }
      const { report, design, extras, pageContext } = p;
      const shot = report.scanData[ff === 'desktop' ? 'desktopScreenshotBase64' : 'mobileScreenshotBase64'];
      if (shot) writeOut(`ux/${tag}.jpg`, Buffer.from(shot, 'base64'));
      writeJson(`ux/${tag}.dom.json`, report.scanData.domContext);
      writeJson(`ux/${tag}.json`, { state: stateName, formFactor: ff, pageContext, report: stripImages(report), design: stripImages(design), extras });
      screens.push({
        tag,
        state: stateName,
        formFactor: ff,
        findings: report.totalIssues,
        p1: report.p1Count,
        p2: report.p2Count,
        p3: report.p3Count,
        extras: extras.length,
        designScore: design.report?.score ?? null,
        designGrade: design.report?.grade ?? null,
        findingTitles: [...report.findings, ...extras].map(f => `${f.severity} ${f.title}`),
        ...(report.scanData.domContextError ? { domContextError: report.scanData.domContextError } : {}),
      });
      log(`  ${tag}: ${report.totalIssues} rule findings (P1 ${report.p1Count}, P2 ${report.p2Count}, P3 ${report.p3Count}), ${extras.length} probe findings, design ${design.report?.score ?? '–'}`);
    }
  }
  const data = {
    url: ctx.url,
    siteType: SITE_TYPE,
    viewports: UX_VIEWPORTS,
    note: 'Deterministic findings only. UX scores come from the AI review: it writes ux/ai/<tag>.json, then node lib/merge-ux.mjs <this folder>/ux scores and merges them.',
    screens,
  };
  writeJson('ux.json', data);
  return { data, errors, units: screens.length };
}

async function toolsStep(ctx) {
  const results = {};
  const errors = [];
  for (const [name, fn] of TOOLS) {
    try {
      results[name] = await fn(ctx.url);
      log(`  ${name}: ${toolBrief(name, results[name])}`);
    } catch (err) {
      // Some tools report a soft failure in their own `error` field; `failed` marks a tool that threw.
      results[name] = { failed: true, error: errorText(err) };
      errors.push(`${name}: ${errorText(err)}`);
      log(`  ${name}: FAILED ${errorText(err)}`);
    }
  }
  const data = { url: ctx.url, results };
  writeJson('tools.json', data);
  return { data, errors, units: TOOLS.length };
}

async function responsiveStep(ctx) {
  const rows = await retryLaunch(() => runResponsiveProbe(ctx.url, { log: m => log(`  ${m}`) }));
  const kept = rows.map(({ jpg, ...row }) => {
    if (!jpg) return row;
    const screenshot = `responsive/${row.state}-${row.width}.jpg`;
    writeOut(screenshot, jpg);
    return { ...row, screenshot };
  });
  const data = { url: ctx.url, widths: WIDTHS, rows: kept };
  writeJson('responsive.json', data);
  return { data, errors: kept.filter(r => r.error).map(r => `${r.state}@${r.width}: ${r.error}`), units: kept.length };
}

async function inpStep(ctx) {
  const rows = await runInpProbe(ctx.url, { quick: ctx.quick, log: m => log(`  ${m}`) });
  const data = {
    url: ctx.url,
    quick: ctx.quick,
    method: 'Trusted input at a 412x823 viewport. Event Timing entries of 16 ms or more are bucketed by startTime into each step; main-thread time comes from CDP Performance.getMetrics. The page stops scrolling before every step, and each field is centred before it is typed into.',
    rows,
  };
  writeJson('inp.json', data);
  return { data, errors: rows.filter(r => r.error).map(r => `cpu${r.cpuThrottle}x loans=${r.loans} run${r.run}: ${r.error}`), units: rows.length };
}

async function readableStep(ctx) {
  const runs = ctx.quick ? 1 : ctx.runs;
  const scenarios = await runReadableProbe(ctx.url, { runs, log: m => log(`  ${m}`) });
  const data = {
    url: ctx.url,
    runs,
    throttle: READABLE_THROTTLE,
    viewport: READABLE_VIEWPORT,
    method: 'Cold loads, each in a fresh browser, on slow 4G applied for real with devtools throttling (not simulated) and 4x CPU. Marks are ms from navigation start, read inside the page: skeleton is the first frame with .animate-pulse in the DOM, real the first frame with main h1 and no .animate-pulse, readable the first frame where the first .rise block is at opacity 0.99 or more (real when there is no .rise); fp and fcp are Paint Timing, lcp the last largest-contentful-paint entry. Each median is per mark, over the loads without an error; with an even count, the higher middle value.',
    scenarios,
  };
  writeJson('readable.json', data);
  const loads = Object.entries(scenarios).flatMap(([name, s]) => s.runs.map(r => ({ name, ...r })));
  return { data, errors: loads.filter(r => r.error).map(r => `${r.name} run${r.run}: ${r.error}`), units: loads.length };
}

const RUNNERS = {
  lighthouse: lighthouseStep,
  flow: flowStep,
  security: securityStep,
  geo: geoStep,
  design: designStep,
  ux: uxStep,
  tools: toolsStep,
  responsive: responsiveStep,
  inp: inpStep,
  readable: readableStep,
};

// --- Reading results ---

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const maxOf = values => {
  const nums = values.map(num).filter(v => v !== null);
  return nums.length ? Math.max(...nums) : null;
};
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isLive = url => new URL(url).origin === new URL(LIVE_URL).origin;
// Served from this machine, so the local build is the code under audit.
const isLocalHost = url => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

function toolBrief(name, r) {
  if (!r || r.failed) return `failed: ${r?.error ?? 'no result'}`;
  switch (name) {
    case 'header-check': return `score ${r.score}: ${r.summary.good} good, ${r.summary.warnings} warnings, ${r.summary.missing} missing`;
    case 'meta-validate': return `score ${r.score}: ${r.summary.good} good, ${r.summary.warnings} warnings, ${r.summary.missing} missing`;
    case 'structured-data': return `${r.totalSchemas} schemas, ${r.summary.totalErrors} errors, ${r.summary.totalWarnings} warnings`;
    case 'sitemap-validate': return r.found ? `found, ${r.summary.total} URLs, ${r.issues.length} issues` : `not found${r.error ? ` (${r.error})` : ''}`;
    case 'redirect-check': return r.error ? `error: ${r.error}` : `${r.redirectCount} redirects, final status ${r.finalStatus}: ${r.message}`;
    case 'broken-links': return `${r.summary.total} links, ${r.summary.broken} broken, ${r.summary.redirects} redirects, ${r.summary.errors} errors, ${r.summary.timeouts} timeouts`;
    case 'webmcp-check': return `AI readiness ${r.aiReadinessScore}`;
    default: return 'done';
  }
}

// One row per CPU rate and portfolio size: the worst interaction and main-thread time of each step across runs.
function inpGrid(inp) {
  const grid = new Map();
  for (const r of inp?.rows ?? []) {
    const key = `${r.cpuThrottle}x${r.loans}`;
    if (!grid.has(key)) grid.set(key, { cpu: r.cpuThrottle, loans: r.loans, runs: 0, failed: 0, steps: {} });
    const g = grid.get(key);
    if (r.error) {
      g.failed++;
      continue;
    }
    g.runs++;
    for (const name of INP_STEPS) {
      const s = r[name];
      if (!s) continue;
      const prev = g.steps[name] ?? { worst: 0, task: 0 };
      g.steps[name] = { worst: Math.max(prev.worst, s.worstInteractionMs), task: Math.max(prev.task, s.taskMs) };
    }
  }
  for (const g of grid.values()) g.worst = g.runs ? maxOf(Object.values(g.steps).map(s => s.worst)) : null;
  return [...grid.values()];
}

// --- Budgets ---

const CATEGORY_LABELS = { performance: 'Performance', accessibility: 'Accessibility', bestPractices: 'Best practices', seo: 'SEO' };
const METRIC_UNITS = { lcp: 'ms', fcp: 'ms', tbt: 'ms', cls: 'cls' };

function evaluateBudgets(results, steps, ctx, bundle) {
  const checks = [];
  const check = (id, label, measured, limit, op, unit, extra = {}) => {
    let status = extra.status;
    if (!status) {
      if (num(measured) === null) status = 'unmeasured';
      else status = (op === '>=' ? measured >= limit : measured <= limit) ? 'pass' : 'fail';
    }
    checks.push({ id, label, measured: num(measured), limit, op, unit, status, ...(extra.note ? { note: extra.note } : {}) });
  };
  const stepFailed = name => steps[name]?.status === 'failed';

  if (results.lighthouse) {
    for (const [key, p] of Object.entries(results.lighthouse.pages)) {
      const s = p.summary;
      const loadError = s?.loadError ? { status: 'fail', note: `the page did not load: ${s.loadError.code}` } : {};
      const missing = s ? {} : { note: 'every run failed' };
      for (const [field, limit] of Object.entries(budgets.lighthouse?.[p.formFactor] ?? {})) {
        check(`lighthouse.${key}.${field}`, `${CATEGORY_LABELS[field] ?? field}, ${pageLabel(key).toLowerCase()}`, s?.[field], limit, '>=', 'score', { ...missing, ...loadError });
      }
      for (const [field, limit] of Object.entries(budgets.metrics?.[p.formFactor] ?? {})) {
        check(`lighthouse.${key}.${field}`, `${field.toUpperCase()}, ${pageLabel(key).toLowerCase()}`, s?.[field], limit, '<=', METRIC_UNITS[field] ?? 'ms', { ...missing, ...loadError });
      }
    }
  } else if (stepFailed('lighthouse')) {
    check('lighthouse', 'Lighthouse budgets', null, null, '>=', 'score', { note: 'the lighthouse step failed' });
  }

  if (budgets.flow?.inp != null) {
    if (results.flow) {
      for (const [ff, f] of Object.entries(results.flow.formFactors)) {
        const spans = (f.steps ?? []).filter(s => s.gatherMode === 'timespan' && num(s.inp) !== null);
        const worst = spans.length ? spans.reduce((a, b) => (b.inp > a.inp ? b : a)) : null;
        const note = f.error ? `the flow failed: ${f.error}` : worst ? `${worst.name}` : 'no timespan measured an interaction';
        check(`flow.${ff}.inp`, `Flow INP (worst timespan), ${ff}`, worst?.inp, budgets.flow.inp, '<=', 'ms', { note });
      }
    } else if (stepFailed('flow')) {
      check('flow.inp', 'Flow INP', null, budgets.flow.inp, '<=', 'ms', { note: 'the flow step failed' });
    }
  }

  if (bundle && budgets.bundle?.firstLoadJsKb != null) {
    check('bundle.firstLoadJs', `First-load JS, route ${bundle.route}`, bundle.kb, budgets.bundle.firstLoadJsKb, '<=', 'kB', { note: `${bundle.files} files, gzip` });
  }

  const floors = budgets.floors ?? {};
  if (floors.securityLive != null && isLive(ctx.url)) {
    if (results.security) check('floor.securityLive', 'Security score, live (floor)', results.security.score, floors.securityLive, '>=', 'score');
    else if (stepFailed('security')) check('floor.securityLive', 'Security score, live (floor)', null, floors.securityLive, '>=', 'score', { note: 'the security step failed' });
  }
  if (floors.geo != null) {
    if (results.geo) check('floor.geo', 'GEO score (floor)', results.geo.geoScore, floors.geo, '>=', 'score');
    else if (stepFailed('geo')) check('floor.geo', 'GEO score (floor)', null, floors.geo, '>=', 'score', { note: 'the geo step failed' });
  }
  // A time, so the floor caps it from above.
  if (floors.readableFirstMs != null) {
    const first = results.readable?.scenarios.first;
    if (first) {
      const done = first.runs.filter(r => !r.error).length;
      check('floor.readableFirstMs', 'Readable, first visit (floor)', first.median.readable, floors.readableFirstMs, '<=', 'ms', { note: done ? `median of ${done} cold load${done === 1 ? '' : 's'}` : 'every load failed' });
    } else if (stepFailed('readable')) {
      check('floor.readableFirstMs', 'Readable, first visit (floor)', null, floors.readableFirstMs, '<=', 'ms', { note: 'the readable step failed' });
    }
  }
  return checks;
}

// Goals, reported next to the floors. They never fail a run. A score meets its goal at or above it, a time at or below.
function targetRows(results, ctx) {
  const t = budgets.targets ?? {};
  const rows = [];
  if (t.securityLive != null && results.security && isLive(ctx.url)) rows.push({ label: 'Security score, live', measured: results.security.score, goal: t.securityLive });
  if (t.geo != null && results.geo) rows.push({ label: 'GEO score', measured: results.geo.geoScore, goal: t.geo });
  const readable = num(results.readable?.scenarios.first?.median.readable);
  if (t.readableFirstMs != null && readable !== null) rows.push({ label: 'Readable, first visit', measured: readable, goal: t.readableFirstMs, op: '<=', unit: 'ms' });
  return rows.map(r => ({ op: '>=', unit: 'score', ...r, met: r.op === '<=' ? r.measured <= r.goal : r.measured >= r.goal }));
}

// --- Scoreboard and comparison ---

// Every number worth tracking, under a stable key. The last part of a key says which direction is better.
function scoreMap(results, bundle) {
  const s = {};
  const put = (key, v) => { if (num(v) !== null) s[key] = v; };
  for (const [key, p] of Object.entries(results.lighthouse?.pages ?? {})) {
    for (const f of RUN_FIELDS) put(`lighthouse.${key}.${f}`, p.summary?.[f]);
  }
  for (const [ff, f] of Object.entries(results.flow?.formFactors ?? {})) {
    if (!f.steps) continue;
    const spans = f.steps.filter(x => x.gatherMode === 'timespan');
    put(`flow.${ff}.inp`, maxOf(spans.map(x => x.inp)));
    put(`flow.${ff}.cls`, maxOf(spans.map(x => x.cls)));
    for (const x of f.steps) {
      const base = `flow.${ff}.${slug(x.name)}`;
      if (x.gatherMode !== 'snapshot') put(`${base}.performance`, x.performance);
      if (x.gatherMode !== 'timespan') {
        put(`${base}.accessibility`, x.accessibility);
        put(`${base}.seo`, x.seo);
      }
      put(`${base}.bestPractices`, x.bestPractices);
      if (x.gatherMode === 'timespan') {
        put(`${base}.inp`, x.inp);
        put(`${base}.cls`, x.cls);
        put(`${base}.tbt`, x.tbt);
      }
    }
  }
  if (results.security) {
    put('security.score', results.security.score);
    for (const [k, v] of Object.entries(results.security.categories ?? {})) put(`security.${k}`, v);
  }
  if (results.geo) {
    put('geo.score', results.geo.geoScore);
    for (const [k, v] of Object.entries(results.geo.categories ?? {})) put(`geo.${k}`, v?.score);
    put('geo.contentParity', results.geo.contentParity);
  }
  for (const [state, d] of Object.entries(results.design?.states ?? {})) {
    put(`design.${state}.desktop`, d.desktop?.report?.score);
    put(`design.${state}.mobile`, d.mobile?.report?.score);
    put(`design.${state}.merged`, d.designScore);
  }
  for (const x of results.ux?.screens ?? []) {
    for (const k of ['findings', 'p1', 'p2', 'p3', 'extras']) put(`ux.${x.tag}.${k}`, x[k]);
  }
  if (results.responsive) {
    const rows = results.responsive.rows.filter(r => !r.error);
    put('responsive.overflowing', rows.filter(r => r.overflow).length);
    for (const r of rows) put(`responsive.${r.state}-${r.width}.overflowPx`, Math.max(0, r.scrollWidth - r.clientWidth));
  }
  for (const g of inpGrid(results.inp)) {
    if (!g.runs) continue;
    for (const name of INP_STEPS) put(`inp.cpu${g.cpu}x.loans${g.loans}.${name}`, g.steps[name]?.worst);
    put(`inp.cpu${g.cpu}x.loans${g.loans}.worst`, g.worst);
  }
  for (const [name, r] of Object.entries(results.readable?.scenarios ?? {})) {
    for (const k of ['fp', 'fcp', 'real', 'readable', 'lcp']) put(`readable.${name}.${k}`, r.median[k]);
  }
  const t = results.tools?.results ?? {};
  put('tools.header-check.score', t['header-check']?.score);
  put('tools.meta-validate.score', t['meta-validate']?.score);
  put('tools.structured-data.totalSchemas', t['structured-data']?.totalSchemas);
  if (t['sitemap-validate'] && !t['sitemap-validate'].failed) put('tools.sitemap-validate.found', t['sitemap-validate'].found ? 1 : 0);
  put('tools.redirect-check.redirectCount', t['redirect-check']?.redirectCount);
  put('tools.broken-links.broken', t['broken-links']?.summary?.broken);
  put('tools.webmcp-check.aiReadinessScore', t['webmcp-check']?.aiReadinessScore);
  if (bundle) put('bundle.firstLoadJsKb', bundle.kb);
  return s;
}

const LOWER_IS_BETTER = new Set(['lcp', 'fcp', 'cls', 'tbt', 'si', 'tti', 'inp', 'worst', 'findings', 'p1', 'p2', 'p3', 'extras',
  'overflowing', 'overflowPx', 'redirectCount', 'broken', 'firstLoadJsKb', 'fp', 'real', 'readable', ...INP_STEPS]);
const TIMINGS = new Set(['lcp', 'fcp', 'tbt', 'si', 'tti', 'inp', 'worst', 'fp', 'real', 'readable', ...INP_STEPS]);

function loadScoreboard(dir) {
  const file = path.join(path.resolve(dir), 'scoreboard.json');
  try {
    return { dir, board: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (err) {
    log(`--compare: cannot read ${path.join(dir, 'scoreboard.json')} (${err.code ?? errorText(err)}), so there is nothing to compare.`);
    return { dir, board: null };
  }
}

// Changes beyond run-to-run noise: timings within 50 ms or 10%, and CLS within 0.01, count as unchanged.
function compareScores(before, now) {
  const changes = [];
  let onlyBefore = 0;
  let onlyNow = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
    const a = num(before[key]);
    const b = num(now[key]);
    if (a === null && b === null) continue;
    if (a === null) { onlyNow++; continue; }
    if (b === null) { onlyBefore++; continue; }
    if (a === b) continue;
    const leaf = key.split('.').at(-1);
    const delta = b - a;
    if (TIMINGS.has(leaf) && Math.abs(delta) < Math.max(50, Math.abs(a) * 0.1)) continue;
    if (leaf === 'cls' && Math.abs(delta) < 0.01) continue;
    const better = LOWER_IS_BETTER.has(leaf) ? delta < 0 : delta > 0;
    changes.push({ key, before: a, now: b, delta: Math.round(delta * 1000) / 1000, verdict: better ? 'better' : 'worse' });
  }
  changes.sort((x, y) => (x.verdict === y.verdict ? x.key.localeCompare(y.key) : x.verdict === 'worse' ? -1 : 1));
  return { changes, onlyBefore, onlyNow };
}

// --- Rendering ---

const DASH = '–';
const fmt = {
  score: v => (num(v) === null ? DASH : String(Math.round(v * 10) / 10)),
  ms: v => (num(v) === null ? DASH : `${Math.round(v)} ms`),
  cls: v => (num(v) === null ? DASH : String(Math.round(v * 1000) / 1000)),
  kB: v => (num(v) === null ? DASH : `${v} kB`),
};
const fmtUnit = (v, unit) => (unit === 'ms' ? fmt.ms(v) : unit === 'cls' ? fmt.cls(v) : unit === 'kB' ? fmt.kB(v) : fmt.score(v));
const cell = v => String(v ?? DASH).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const mdTable = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
  ...rows.map(r => `| ${r.map(cell).join(' | ')} |`),
].join('\n');

function scoreboardTable(lh) {
  const head = ['Page', 'Perf', 'A11y', 'BP', 'SEO', 'LCP', 'FCP', 'CLS'];
  if (!lh) return mdTable(head, [['Lighthouse not run', DASH, DASH, DASH, DASH, DASH, DASH, DASH]]);
  return mdTable(head, Object.entries(lh.pages).map(([key, p]) => {
    const s = p.summary;
    if (!s) return [`${pageLabel(key)} (every run failed)`, DASH, DASH, DASH, DASH, DASH, DASH, DASH];
    const label = s.loadError ? `${pageLabel(key)} (did not load: ${s.loadError.code})` : pageLabel(key);
    return [label, fmt.score(s.performance), fmt.score(s.accessibility), fmt.score(s.bestPractices), fmt.score(s.seo), fmt.ms(s.lcp), fmt.ms(s.fcp), fmt.cls(s.cls)];
  }));
}

function budgetLine(checks) {
  const count = status => checks.filter(c => c.status === status).length;
  const failed = count('fail');
  const parts = [`${count('pass')} passed`, `${failed} failed`];
  if (count('unmeasured')) parts.push(`${count('unmeasured')} not measured`);
  return `${failed ? 'FAIL' : 'PASS'}: ${parts.join(', ')}`;
}

function stepsSection(steps) {
  const rows = Object.entries(steps).map(([name, s]) => {
    let result = s.status;
    if (s.error) result += `: ${s.error}`;
    else if (s.errors?.length) result += `: ${s.errors.slice(0, 3).join('; ')}${s.errors.length > 3 ? `; ${s.errors.length - 3} more` : ''}`;
    return [name, result, secs(s.seconds)];
  });
  return mdTable(['Step', 'Result', 'Time'], rows);
}

function budgetsSection(checks, targets, bundle, ctx) {
  const lines = ['## Budgets', ''];
  if (!checks.length) lines.push('No budget applied to the steps that ran.');
  else {
    lines.push(mdTable(['Budget', 'Measured', 'Limit', 'Result'], checks.map(c => [
      c.label,
      `${fmtUnit(c.measured, c.unit)}${c.note ? ` (${c.note})` : ''}`,
      c.limit == null ? DASH : `${c.op === '>=' ? '≥' : '≤'} ${fmtUnit(c.limit, c.unit)}`,
      c.status === 'fail' ? '**FAIL**' : c.status === 'unmeasured' ? 'not measured' : 'pass',
    ])));
  }
  lines.push('');
  if (!bundle) {
    lines.push(isLocalHost(ctx.url)
      ? 'First-load JS: no production build next to audits/, so it was not checked.'
      : 'First-load JS is read from the local build, so it is checked only when the target is served from this machine.');
  }
  if (checks.some(c => c.id.startsWith('floor.') && c.id !== 'floor.readableFirstMs')) {
    lines.push('Floors are not goals: they are the scores measured on 2026-11-02, so falling below one means something regressed.');
  }
  if (checks.some(c => c.id === 'floor.readableFirstMs')) {
    lines.push('The readable floor is a time, so going over it fails. It sits well above the times measured on 2026-11-02, because throttled loads on a shared machine are noisy: a regression guard, not a goal.');
  }
  if (targets.length) {
    lines.push('', 'Targets, which never fail a run:', '');
    lines.push(mdTable(['Measure', 'Now', 'Target', 'Status'], targets.map(t => [t.label, fmtUnit(t.measured, t.unit), fmtUnit(t.goal, t.unit), t.met ? 'met' : `${fmtUnit(Math.abs(t.goal - t.measured), t.unit)} to go`])));
  }
  return lines;
}

function flowSection(flow) {
  const lines = ['## User flow', ''];
  if (!flow) return [...lines, 'Not run.'];
  lines.push('Lighthouse user flow: first load, example loans, plans with income typed, a plan chosen, the extra-payment slider dragged, and a snapshot saved in Records. Timespans measure INP, CLS and TBT; snapshots audit the state for accessibility, best practices and SEO.', '');
  for (const [ff, f] of Object.entries(flow.formFactors)) {
    lines.push(`### ${ff[0].toUpperCase()}${ff.slice(1)}`, '');
    if (f.error) {
      lines.push(`Failed: ${f.error}`, '');
      continue;
    }
    lines.push(mdTable(['Step', 'Mode', 'Perf', 'A11y', 'BP', 'SEO', 'INP', 'CLS', 'TBT'], f.steps.map(s => [
      s.name,
      s.gatherMode,
      s.gatherMode === 'snapshot' ? DASH : fmt.score(s.performance),
      s.gatherMode === 'timespan' ? DASH : fmt.score(s.accessibility),
      fmt.score(s.bestPractices),
      s.gatherMode === 'timespan' ? DASH : fmt.score(s.seo),
      fmt.ms(s.inp),
      s.gatherMode === 'snapshot' ? DASH : fmt.cls(s.cls),
      s.gatherMode === 'snapshot' ? DASH : fmt.ms(s.tbt),
    ])));
    const failing = [...new Set(f.steps.flatMap(s => (s.failing ?? []).filter(a => a.score === 0).map(a => `${a.title} (${s.name})`)))];
    if (failing.length) lines.push('', `Failing audits: ${failing.slice(0, 8).join('; ')}${failing.length > 8 ? `; ${failing.length - 8} more` : ''}.`);
    if (f.warnings?.length) lines.push('', ...f.warnings.map(w => `- Warning: ${w}`));
    lines.push('');
  }
  return lines;
}

function securitySection(sec, ctx) {
  const lines = ['## Security', ''];
  if (!sec) return [...lines, 'Not run.'];
  const c = sec.categories;
  lines.push(`**${sec.score}** of 100. HTTPS ${c.https}, headers ${c.headers}, cookies ${c.cookies}, content ${c.content}, dependencies ${c.deps ?? 'not measured'}.`);
  lines.push('', `Lighthouse-based checks: ${sec.lighthouseChecks}.`);
  if (new URL(ctx.url).protocol === 'http:') {
    lines.push('', 'This target is plain HTTP, so TLS and every header read as missing whatever the server sends. Judge security with --target live.');
  }
  const issues = sec.findings.filter(f => f.severity === 'critical' || f.severity === 'warning');
  if (issues.length) lines.push('', ...issues.map(f => `- ${f.severity}: ${f.title}${f.pointsEarned != null && f.maxPoints ? ` (${f.pointsEarned}/${f.maxPoints} points)` : ''}`));
  return lines;
}

const GEO_LABELS = { crawlAccess: 'crawl access', serverContent: 'server content', structuredData: 'structured data', socialMeta: 'social and meta', discovery: 'LLM discovery', indexability: 'indexability' };

function geoSection(geo) {
  const lines = ['## GEO', ''];
  if (!geo) return [...lines, 'Not run.'];
  const cats = Object.entries(geo.categories ?? {}).map(([k, v]) => `${GEO_LABELS[k] ?? k} ${v.score}/${v.max}`).join(', ');
  lines.push(`**${geo.geoScore}** of 100: ${cats}.`);
  lines.push('', `Words in the raw HTML: ${geo.ssrWordCount}. Words once rendered: ${geo.csrWordCount}. Content parity ${geo.contentParity}%.`);
  const weak = (geo.checks ?? []).filter(ch => ch.status === 'fail' || ch.status === 'warn');
  if (weak.length) lines.push('', ...weak.map(ch => `- ${ch.status}: ${ch.name} (${ch.score}/${ch.maxScore})`));
  const recs = (geo.recommendations ?? []).filter(r => r.severity === 'high' || r.severity === 'critical');
  if (recs.length) lines.push('', `High-priority recommendations: ${recs.map(r => r.title).join('; ')}.`);
  return lines;
}

function designSection(design) {
  const lines = ['## Design', ''];
  if (!design) return [...lines, 'Not run.'];
  const tag = d => (d?.report ? `${fmt.score(d.report.score)} ${d.report.grade ?? ''}`.trim() : DASH);
  lines.push(mdTable(['State', 'Desktop', 'Mobile', 'Score', 'Grade', 'Accessibility', 'Consistency', 'Motion', 'Performance'], Object.entries(design.states).map(([state, d]) => [
    state, tag(d.desktop), tag(d.mobile), fmt.score(d.designScore), d.designGrade ?? DASH,
    fmt.score(d.buckets?.accessibility), fmt.score(d.buckets?.consistency), fmt.score(d.buckets?.motion), fmt.score(d.buckets?.performance),
  ])));
  lines.push('', `Design engine ${design.engineVersion}. Score is the mean of the rounded desktop (1440x900) and mobile (375x812) scores; buckets are 0 to 100. The engine scores against Material 3 conventions and this app does not use Material, so a radius or target-size rule is advisory unless it is also a WCAG failure.`);
  return lines;
}

function uxSection(ux) {
  const lines = ['## UX deterministic', ''];
  if (!ux) return [...lines, 'Not run.'];
  lines.push(mdTable(['Screen', 'Rule findings', 'P1', 'P2', 'P3', 'Probe findings', 'Design'], ux.screens.map(s => (s.error
    ? [s.tag, `failed: ${s.error}`, DASH, DASH, DASH, DASH, DASH]
    : [s.tag, s.findings, s.p1, s.p2, s.p3, s.extras, fmt.score(s.designScore)]))));
  // Titles that differ only in their leading count ("P2 11 tap target(s)…", "P2 15 tap target(s)…") are one finding.
  const groups = new Map();
  for (const s of ux.screens) {
    for (const t of s.findingTitles ?? []) {
      const m = /^(P\d) (\d+) (.+)$/.exec(t);
      const key = m ? `${m[1]} ${m[3]}` : t;
      if (!groups.has(key)) groups.set(key, { counts: [], tags: new Set() });
      const g = groups.get(key);
      if (m) g.counts.push(Number(m[2]));
      g.tags.add(s.tag);
    }
  }
  if (groups.size) {
    lines.push('', 'Distinct findings, with how many screens show each:', '');
    for (const [key, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      let text = key;
      if (g.counts.length) {
        const lo = Math.min(...g.counts);
        const hi = Math.max(...g.counts);
        const [sev, ...rest] = key.split(' ');
        text = `${sev} ${lo === hi ? lo : `${lo} to ${hi}`} ${rest.join(' ')}`;
      }
      lines.push(`- ${text} (${g.tags.size} screen${g.tags.size === 1 ? '' : 's'})`);
    }
  }
  lines.push('', 'These are rule findings only. UX scores come from the AI review, which reads ux/<screen>.jpg and ux/<screen>.dom.json and writes ux/ai/<screen>.json; then `node lib/merge-ux.mjs <results>/ux` scores and merges them.');
  return lines;
}

function responsiveSection(resp) {
  const lines = ['## Responsive overflow', ''];
  if (!resp) return [...lines, 'Not run.'];
  const widths = WIDTHS.map(w => w.w);
  const states = [...new Set(resp.rows.map(r => r.state))];
  lines.push(mdTable(['State', ...widths.map(String)], states.map(state => [state, ...widths.map(w => {
    const r = resp.rows.find(x => x.state === state && x.width === w);
    if (!r) return DASH;
    if (r.error) return 'failed';
    return r.overflow ? `**+${r.scrollWidth - r.clientWidth} px wide**, ${r.pageHeight} px` : `ok, ${r.pageHeight} px`;
  })])));
  const over = resp.rows.filter(r => r.overflow).length;
  lines.push('', `${over} of ${resp.rows.length} pages scroll sideways. Each cell: horizontal overflow (document scrollWidth beyond the viewport), then page height. Full-page screenshots are in responsive/.`);
  return lines;
}

function inpSection(inp) {
  const lines = ['## INP probe', ''];
  if (!inp) return [...lines, 'Not run.'];
  const grid = inpGrid(inp);
  lines.push(mdTable(['CPU', 'Loans', 'Runs', ...INP_STEPS], grid.map(g => [
    `${g.cpu}x`, g.loans, g.failed ? `${g.runs} (${g.failed} failed)` : g.runs,
    ...INP_STEPS.map(name => (g.steps[name] ? `${g.steps[name].worst} (${g.steps[name].task})` : DASH)),
  ])));
  lines.push('', 'Each cell: the worst Event Timing interaction in ms that started inside the step, then main-thread task ms in parentheses, the higher of the runs. 0 means no interaction reached 16 ms. The page stops scrolling before every step and each field is centred before typing, so no click lands mid-scroll or on the edge of the viewport.');
  return lines;
}

const READABLE_LABELS = { first: 'First visit', returning: 'Returning, eight loans' };

function readableSection(readable, lighthouse) {
  const lines = ['## What a borrower sees and when', ''];
  if (!readable) return [...lines, 'Not run.'];
  lines.push(mdTable(['Scenario', 'First paint', 'Real content', 'Readable', 'LCP (in page)'], Object.entries(readable.scenarios).map(([name, s]) => {
    const failed = s.runs.filter(r => r.error).length;
    const label = `${READABLE_LABELS[name] ?? name}${failed ? ` (${failed} of ${s.runs.length} loads failed)` : ''}`;
    return [label, fmt.ms(s.median.fp), fmt.ms(s.median.real), fmt.ms(s.median.readable), fmt.ms(s.median.lcp)];
  })));
  const v = readable.viewport;
  const n = readable.runs;
  lines.push('', `${n === 1 ? 'One cold load' : `Median of ${n} cold loads`} per scenario, each in a fresh browser, on slow 4G and ${readable.throttle.cpu}x CPU applied for real with devtools throttling, at ${v.width}x${v.height} and DPR ${v.deviceScaleFactor}; ms from navigation start. First paint is Paint Timing's first-paint, the skeleton here. Real content is the first frame with \`main h1\` and no skeleton, readable the first frame with the first \`.rise\` block fully faded in. FCP and the other marks are in readable.json.`);
  const lhLcp = num(lighthouse?.pages?.['empty-mobile']?.summary?.lcp);
  lines.push('', `Lighthouse's simulated LCP sees only the skeleton for this app${lhLcp !== null ? ` (${fmt.ms(lhLcp)} on the empty mobile page in this run)` : ''}, so the Scoreboard's LCP is not when a borrower can read anything: the Readable column is.`);
  return lines;
}

function toolsSection(tools) {
  const lines = ['## Site tools', ''];
  if (!tools) return [...lines, 'Not run.'];
  lines.push(mdTable(['Tool', 'Result'], Object.entries(tools.results).map(([name, r]) => [name, toolBrief(name, r)])));
  return lines;
}

function compareSection(previous, comparison) {
  const lines = [`## Compared with ${previous.dir}`, ''];
  if (!previous.board) return [...lines, 'No scoreboard.json there, so nothing to compare.'];
  const { changes, onlyBefore, onlyNow } = comparison;
  if (!changes.length) lines.push('Nothing moved beyond run-to-run noise.');
  else {
    lines.push(mdTable(['Metric', 'Before', 'Now', 'Change'], changes.map(c => [
      c.key, c.before, c.now, `${c.delta > 0 ? '+' : ''}${c.delta} (${c.verdict})`,
    ])));
  }
  lines.push('', `Timings within 50 ms or 10%, and CLS within 0.01, count as unchanged. ${onlyBefore} metrics exist only in the stored run and ${onlyNow} only in this one (steps not run in both).`);
  return lines;
}

function commandLine() {
  const parts = ['node run.mjs'];
  parts.push(opts.url ? `--url ${opts.url}` : `--target ${opts.target}`);
  if (opts.onlyGiven) parts.push(`--only ${opts.steps.join(',')}`);
  if (opts.steps.includes('lighthouse') || opts.steps.includes('readable')) parts.push(`--runs ${opts.runs}`);
  if (opts.keepRaw) parts.push('--keep-raw');
  if (opts.quick) parts.push('--quick');
  return parts.join(' ');
}

function renderSummary({ ctx, startedAt, steps, results, checks, targets, bundle, previous, comparison }) {
  const lines = [
    '# Audit summary',
    '',
    `- Target: ${ctx.url} (${ctx.target === 'url' ? 'given with --url' : ctx.target})`,
    `- Started: ${startedAt}`,
    `- Command: \`${commandLine()}\``,
    `- Budgets: ${budgetLine(checks)}`,
    '',
    stepsSection(steps),
    '',
    '## Scoreboard',
    '',
    scoreboardTable(results.lighthouse),
    '',
    results.lighthouse
      ? `Median of ${ctx.runs} Lighthouse run${ctx.runs === 1 ? '' : 's'} per page, chosen by performance score. Empty is a first visit; seeded has the eight-loan fixture in localStorage before load. TBT: ${Object.entries(results.lighthouse.pages).map(([k, p]) => `${pageLabel(k).toLowerCase()} ${fmt.ms(p.summary?.tbt)}`).join(', ')}.`
      : 'Lighthouse did not run in this invocation.',
    '',
    ...budgetsSection(checks, targets, bundle, ctx),
    '',
    ...flowSection(results.flow),
    '',
    ...securitySection(results.security, ctx),
    '',
    ...geoSection(results.geo),
    '',
    ...designSection(results.design),
    '',
    ...uxSection(results.ux),
    '',
    ...responsiveSection(results.responsive),
    '',
    ...inpSection(results.inp),
    '',
    ...readableSection(results.readable, results.lighthouse),
    '',
    ...toolsSection(results.tools),
  ];
  if (previous) lines.push('', ...compareSection(previous, comparison));
  return `${lines.join('\n')}\n`;
}

function headline(results, bundle) {
  const parts = [];
  if (results.security) parts.push(`Security ${results.security.score}`);
  if (results.geo) parts.push(`GEO ${results.geo.geoScore}`);
  // The engine's own scores per form factor, before the merge rounds them.
  const designScores = Object.values(results.design?.states ?? {})
    .flatMap(d => [d.desktop?.report?.score, d.mobile?.report?.score])
    .filter(v => num(v) !== null);
  if (designScores.length) parts.push(`Design ${Math.min(...designScores)}-${Math.max(...designScores)}`);
  for (const [ff, f] of Object.entries(results.flow?.formFactors ?? {})) {
    const worst = maxOf((f.steps ?? []).filter(s => s.gatherMode === 'timespan').map(s => s.inp));
    if (worst !== null) parts.push(`Flow INP ${ff} ${fmt.ms(worst)}`);
  }
  const grid = inpGrid(results.inp);
  if (grid.length) parts.push(`INP probe worst ${fmt.ms(maxOf(grid.map(g => g.worst)))}`);
  if (results.responsive) parts.push(`Overflow ${results.responsive.rows.filter(r => r.overflow).length} of ${results.responsive.rows.length}`);
  if (results.readable) {
    const ms = name => fmt.ms(results.readable.scenarios[name]?.median.readable);
    parts.push(`Readable first visit ${ms('first')}, returning ${ms('returning')}`);
  }
  if (bundle) parts.push(`First-load JS ${bundle.kb} kB`);
  return parts.join(' · ');
}

// --- Run ---

let server;
try {
  server = await ensureServer({ url: opts.url ?? (opts.target === 'live' ? LIVE_URL : null), log });
} catch (err) {
  console.error(`The app could not be reached: ${errorText(err)}`);
  process.exit(2);
}

const ctx = {
  url: server.url,
  target: opts.url ? 'url' : opts.target,
  runs: opts.runs,
  keepRaw: opts.keepRaw,
  quick: opts.quick,
  withUx: opts.steps.includes('ux'),
  passes: new Map(),
  securityLhr: null,
};
const startedAt = new Date().toISOString();
const steps = {};
const results = {};
mkdirSync(outDir, { recursive: true });
log(`Auditing ${ctx.url}: ${opts.steps.join(', ')}. Results go to ${outDir}`);

try {
  for (const name of opts.steps) {
    log(`\n== ${name}`);
    const t0 = Date.now();
    try {
      const { data, errors, units } = await RUNNERS[name](ctx);
      results[name] = data;
      const status = !errors.length ? 'ok' : errors.length >= units ? 'failed' : 'partial';
      steps[name] = { status, seconds: since(t0), ...(errors.length ? { errors } : {}) };
    } catch (err) {
      steps[name] = { status: 'failed', seconds: since(t0), error: errorText(err) };
      writeJson(`${name}.json`, { step: name, url: ctx.url, status: 'failed', error: errorText(err) });
    }
    log(`  ${name}: ${steps[name].status} in ${secs(steps[name].seconds)}${steps[name].error ? `: ${steps[name].error}` : ''}`);
  }
} finally {
  await server.stop();
}

const bundle = isLocalHost(ctx.url) ? firstLoadJs(budgets.bundle?.route ?? '/') : null;
const checks = evaluateBudgets(results, steps, ctx, bundle);
const targets = targetRows(results, ctx);
const scores = scoreMap(results, bundle);
const comparison = previous?.board ? compareScores(previous.board.scores ?? {}, scores) : null;
const failed = checks.filter(c => c.status === 'fail');

writeJson('scoreboard.json', {
  generatedAt: startedAt,
  url: ctx.url,
  target: ctx.target,
  command: commandLine(),
  runs: ctx.runs,
  steps,
  budgets: checks,
  budgetsFailed: failed.length,
  targets,
  scores,
});
writeOut('SUMMARY.md', renderSummary({ ctx, startedAt, steps, results, checks, targets, bundle, previous, comparison }));

const out = [
  '',
  `Scoreboard for ${ctx.url}${results.lighthouse ? `, median of ${ctx.runs} run${ctx.runs === 1 ? '' : 's'}` : ''}`,
  '',
  scoreboardTable(results.lighthouse),
  '',
];
const extra = headline(results, bundle);
if (extra) out.push(extra);
out.push(`Budgets ${budgetLine(checks)}`);
for (const c of failed) out.push(`  FAIL ${c.label}: ${fmtUnit(c.measured, c.unit)}, limit ${c.op === '>=' ? '≥' : '≤'} ${fmtUnit(c.limit, c.unit)}${c.note ? ` (${c.note})` : ''}`);
const brokenSteps = Object.entries(steps).filter(([, s]) => s.status !== 'ok');
if (brokenSteps.length) out.push(`Steps not fully measured: ${brokenSteps.map(([n, s]) => `${n} (${s.status})`).join(', ')}`);
if (comparison) {
  const { changes } = comparison;
  out.push(changes.length ? `Changes since ${previous.dir}:` : `No change beyond noise since ${previous.dir}.`);
  for (const c of changes) out.push(`  ${c.verdict === 'worse' ? 'WORSE ' : 'better'} ${c.key}: ${c.before} -> ${c.now}`);
}
out.push(`Summary: ${path.join(outDir, 'SUMMARY.md')}`);

// 1: a budget failed. 2: a step could not run, so its budgets were not measured.
const code = failed.length ? 1 : brokenSteps.length ? 2 : 0;
process.exitCode = code;
// Let stdout drain before exiting: a pipe on macOS is asynchronous.
process.stdout.write(`${out.join('\n')}\n`, () => process.exit(code));
