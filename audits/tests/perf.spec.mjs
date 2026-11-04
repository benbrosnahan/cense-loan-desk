// Performance: what a borrower downloads, how fast the Payoff slider responds on a slow phone, and how soon saved
// records appear, plus guards for what the audit found fast and a later change could quietly undo.
// Timings run on a 4x slowed CPU, the same stand-in for a low-end phone the audit's lab runs used.
import fs from 'node:fs';
import {
  test, expect, knownIssue, openApp, goTo, sections, PROFILE, PHONE, DESKTOP,
} from './helpers.mjs';
import {
  FRAME_MS, manyLoans, weeklySnapshots, countFormatters, recordLayoutShifts, recordStorageWrites, devtools,
  trackScripts, settledWords, firstDifference, weightRange, fontReport,
} from './support/perf.mjs';

// Playwright's trace snapshots run inside the page on every action. This file measures main-thread time and DOM
// node counts, which would include that work, so it records no trace; failures still get a screenshot.
test.use({ trace: 'off' });

const TOUR = ['plans', 'payoff', 'records', 'loans'];
const kb = bytes => `${bytes.toLocaleString('en-US')} B`;
const slider = page => page.getByRole('slider', { name: 'Extra each month, slider' });

test('PERF-01 a first visit downloads only the font weights the page draws', async ({ page }) => {
  knownIssue('PERF-01');
  // A bold-only display file brings the two preloaded files to about 52 KB; today they are about 71 KB.
  const BUDGET = 55_000;
  const files = [];
  page.on('response', response => {
    if (response.request().resourceType() !== 'font') return;
    files.push(response.request().sizes().then(s => ({ url: response.url(), bytes: s.responseBodySize })));
  });
  await page.setViewportSize(PHONE);
  await openApp(page, { seeded: false });
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);

  // The look must not change: the title and the other display text keep the display face, each at a weight one of
  // its loaded files really has, so no weight is faked or swapped for another.
  const title = page.getByRole('heading', { level: 1, name: 'Loan Desk' });
  const titleFont = await title.evaluate(h => {
    const style = getComputedStyle(h);
    return { family: style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''), weight: Number(style.fontWeight) };
  });
  const report = await fontReport(page);
  const faces = report.loaded.filter(f => f.family === titleFont.family);
  const has = weight => faces.some(f => {
    const [lo, hi] = weightRange(f.weight);
    return lo <= weight && weight <= hi;
  });
  const weights = [...new Set([titleFont.weight, ...Object.keys(report.drawn[titleFont.family] ?? {}).map(Number)])];
  const missing = weights.filter(w => !has(w));
  expect(missing, `The title "Loan Desk" and the other display text are drawn in ${titleFont.family} at weight ${weights.join(', ')}, but the page loaded ${faces.length ? faces.map(f => `a file with weights ${f.weight}`).join(' and ') : 'no font file for that family'}, so text at weight ${missing.join(', ')} would be drawn in a faked or substituted weight`).toEqual([]);

  const downloaded = await Promise.all(files);
  const total = downloaded.reduce((sum, f) => sum + f.bytes, 0);
  const describe = f => {
    const rule = report.rules.find(r => r.url === f.url);
    const role = rule?.family === titleFont.family ? 'display face' : 'text face';
    return `${f.url.split('/').pop()} ${kb(f.bytes)} (${role}${rule ? `, weights ${rule.weight}` : ''})`;
  };
  const drawnAt = Object.entries(report.drawn[titleFont.family] ?? {}).map(([w, n]) => `${w} (${n} elements)`).join(', ');
  expect(total, `PERF-01: a first visit downloads ${kb(total)} of web fonts, over the ${kb(BUDGET)} budget: ${downloaded.map(describe).join('; ')}. The display face is drawn only at weight ${drawnAt}, so the rest of its variable weight range is data no one sees`).toBeLessThanOrEqual(BUDGET);
});

test('PERF-02 with 60 loans on a slow phone, each move of the extra-payment slider fits in one frame and shows the same figures as a fresh page', async ({ page }) => {
  knownIssue('PERF-02');
  test.slow();
  const LOAN_COUNT = 60;
  const BATCHES = 6;
  const MOVES = 5;
  const loans = manyLoans(LOAN_COUNT);
  const profile = { ...PROFILE, selectedPlan: 'standard', extraPerMonth: 100 };
  await page.setViewportSize(PHONE);
  await page.addInitScript(countFormatters);
  await openApp(page, { loans, profile });
  await goTo(page, 'payoff');
  await expect(slider(page)).toBeVisible();
  await slider(page).focus();

  const tools = await devtools(page);
  await tools.throttleCpu(4);
  // Each Right arrow is one $5 step, so every move recomputes the projection. The pause lets each move paint.
  const move = async () => { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100); };
  for (let i = 0; i < 3; i++) await move(); // warm up the JIT
  const batches = [];
  for (let b = 0; b < BATCHES; b++) {
    const before = await page.evaluate(() => ({ ...window.__auditFormatters, value: Number(document.activeElement.value) }));
    const t0 = await tools.taskMs();
    for (let i = 0; i < MOVES; i++) await move();
    const t1 = await tools.taskMs();
    const after = await page.evaluate(() => ({ ...window.__auditFormatters, value: Number(document.activeElement.value) }));
    batches.push({
      ms: (t1 - t0) / MOVES,
      steps: (after.value - before.value) / 5,
      numberFormats: (after.numberFormat - before.numberFormat) / MOVES,
      dateFormats: (after.dateTimeFormat - before.dateTimeFormat + after.toLocaleDateString - before.toLocaleDateString) / MOVES,
    });
  }
  await tools.throttleCpu(1);

  // Noise from other work on the machine only ever adds time, so the quickest batch is the fairest reading.
  const best = batches.reduce((a, b) => (b.ms < a.ms ? b : a));
  const all = batches.map(b => b.ms.toFixed(1)).join(', ');
  test.info().annotations.push({ type: 'measured', description: `${best.ms.toFixed(1)}ms of main-thread work per slider move with ${LOAN_COUNT} loans at 4x CPU (batches: ${all}ms)` });
  expect(batches.every(b => b.steps === MOVES), `every key press should move the slider one step: ${JSON.stringify(batches)}`).toBe(true);

  // A quicker move must not leave stale figures behind: the Payoff section reads as it does on a fresh page opened
  // at the amount the slider reached.
  const reached = Number(await slider(page).inputValue());
  const shown = await settledWords(page);
  const fresh = await page.context().newPage();
  await fresh.setViewportSize(PHONE);
  await openApp(fresh, { loans, profile: { ...profile, extraPerMonth: reached } });
  await goTo(fresh, 'payoff');
  const diff = firstDifference(shown, await settledWords(fresh));
  expect(diff, `after the slider moved to $${reached}, the Payoff section should read as a fresh page opened at $${reached} does; at word ${diff?.word} it shows "…${diff?.a}…" where the fresh page shows "…${diff?.b}…"`).toBeNull();

  expect(best.ms, `PERF-02: with ${LOAN_COUNT} loans on a 4x slower CPU, each move of the extra-payment slider keeps the main thread busy for ${best.ms.toFixed(1)}ms (quickest of ${BATCHES} batches of ${MOVES} moves: ${all}ms), more than the ${FRAME_MS.toFixed(1)}ms one frame allows, so the slider and the debt-free date under it fall behind the finger. Each move builds ${best.numberFormats} new number formatters and ${best.dateFormats} new date formatters`).toBeLessThanOrEqual(FRAME_MS);
});

test('PERF-03 every saved record is fully visible within a second of opening Records, however many there are', async ({ page }) => {
  knownIssue('PERF-03');
  const SNAPSHOTS = 50;
  const WITHIN_MS = 1000;
  await page.setViewportSize(PHONE);
  await openApp(page, { snapshots: weeklySnapshots(SNAPSHOTS) });

  const looks = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    // Time the look from the borrower's own click on Records.
    await page.evaluate(() => addEventListener('click', () => { window.__auditOpenedAt = performance.now(); }, { capture: true, once: true }));
    await sections(page).getByRole('button', { name: /^Records/ }).click();
    const badges = page.getByText(/^#\d+$/);
    await expect(badges, `Records should list all ${SNAPSHOTS} saved snapshots`).toHaveCount(SNAPSHOTS);
    const look = await badges.evaluateAll(async (els, within) => {
      const openedAt = window.__auditOpenedAt;
      while (performance.now() < openedAt + within) await new Promise(r => requestAnimationFrame(r));
      const at = Math.round(performance.now() - openedAt);
      // What the eye sees: an element's opacity multiplied by every ancestor's.
      const seen = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
      const waits = el => {
        let d = 0;
        for (let e = el; e; e = e.parentElement) for (const v of getComputedStyle(e).animationDelay.split(',')) d = Math.max(d, parseFloat(v) || 0);
        return d;
      };
      return { at, records: els.map(el => ({ name: el.textContent.trim(), opacity: Math.round(seen(el) * 100) / 100, waits: waits(el) })) };
    }, WITHIN_MS);
    const hidden = look.records.filter(r => r.opacity < 0.99);
    const number = r => Number(r.name.slice(1));
    looks.push({ reducedMotion, at: look.at, hidden, oldest: look.records.reduce((a, b) => (number(b) < number(a) ? b : a)) });
    if (reducedMotion === 'no-preference') await goTo(page, 'loans'); // leave, so Records opens afresh
  }

  const story = looks.map(l => `${l.reducedMotion === 'reduce' ? 'With reduced motion' : 'With default motion'}, ${l.at}ms after opening Records ${l.hidden.length} of ${SNAPSHOTS} records are not fully visible; the oldest (${l.oldest.name}) is at opacity ${l.oldest.opacity} and waits ${l.oldest.waits}s before it starts to appear`).join('. ');
  expect(looks.map(l => l.hidden.length), `PERF-03: ${story}. Each older record waits 0.03s longer than the one above it, so the wait grows with every snapshot saved`).toEqual(looks.map(() => 0));
});

test('the spreadsheet library downloads only when a borrower asks for a spreadsheet, and the button shows it is busy meanwhile', async ({ page }) => {
  const scripts = trackScripts(page);
  await openApp(page);
  for (const tab of TOUR) await goTo(page, tab);
  const early = (await scripts.in('load')).filter(s => s.body.includes('SheetJS'));
  expect(early.map(s => s.url), 'SheetJS, about 400 KB of JavaScript, downloaded during first load or a section switch, before anyone asked for a spreadsheet').toEqual([]);

  scripts.setPhase('export');
  // Stretch every new script download, as a slow phone connection would, so the waiting state can be seen.
  await page.route(url => url.pathname.endsWith('.js'), async route => {
    await new Promise(r => setTimeout(r, 400));
    await route.continue();
  });
  const download = page.waitForEvent('download');
  const button = page.getByRole('button', { name: 'Download as a spreadsheet' });
  const handle = await button.elementHandle();
  await button.click();
  await expect.poll(
    () => handle.evaluate(b => b.disabled || b.getAttribute('aria-busy') === 'true' || b.getAttribute('aria-disabled') === 'true'),
    { message: 'while the spreadsheet code downloads, the button should show it is working and refuse a second press', timeout: 300 },
  ).toBe(true);
  const file = await download;
  const bytes = fs.readFileSync(await file.path());
  expect(bytes.subarray(0, 2).toString('latin1'), `the download ${file.suggestedFilename()} should be a real .xlsx (a zip, starting "PK")`).toBe('PK');
  const fetched = await scripts.in('export');
  expect(fetched.some(s => s.body.includes('SheetJS')), `the first export should fetch SheetJS on demand; fetched: ${fetched.map(s => s.url.split('/').pop()).join(', ') || 'nothing'}. If the export no longer uses SheetJS, update this guard`).toBe(true);
  await expect(button).toBeEnabled();
});

test('the page loads only the fonts it preloads, from first run through every section at phone and desktop widths', async ({ page }) => {
  const requested = new Set();
  page.on('request', request => { if (request.resourceType() === 'font') requested.add(request.url()); });
  await page.setViewportSize(PHONE);
  // The audited states in order: first run, the empty form's errors, then every section with loans.
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByRole('button', { name: 'Save loan' }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  await expect(sections(page)).toBeVisible();
  for (const viewport of [PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const tab of TOUR) {
      await goTo(page, tab);
      await page.evaluate(() => document.fonts.ready);
    }
  }
  const preloaded = await page.locator('link[rel="preload"][as="font"]').evaluateAll(links => links.map(l => l.href));
  expect(preloaded.length, 'the page should preload its fonts').toBeGreaterThan(0);
  const late = [...requested].filter(url => !preloaded.includes(url));
  expect(late, `fonts discovered only after layout, which swap in late: ${late.join(', ')}; preloaded: ${preloaded.join(', ')}`).toEqual([]);
});

test('nothing on screen shifts while the page loads, on a first visit or a return visit', async ({ page, context }) => {
  const visits = [];
  for (const returning of [false, true]) {
    const tab = returning ? await context.newPage() : page;
    await tab.setViewportSize(PHONE);
    await tab.addInitScript(recordLayoutShifts);
    await openApp(tab, { seeded: returning });
    await tab.waitForLoadState('networkidle');
    await tab.evaluate(() => document.fonts.ready);
    const shifts = await tab.evaluate(() => window.__auditLayoutShifts);
    visits.push({ visit: returning ? 'return visit' : 'first visit', total: shifts.reduce((s, e) => s + e.value, 0), shifts });
  }
  // The audit measured 0 in every run; 0.01 is a tenth of the "good" line and still catches anything visible.
  for (const v of visits) expect(v.total, `${v.visit}: content moved while loading, layout shift ${v.total.toFixed(4)}: ${JSON.stringify(v.shifts)}`).toBeLessThan(0.01);
});

test('a return visit takes code, styles and fonts from the cache, and the first visit gets code and styles compressed', async ({ page, context }) => {
  const staticFiles = tab => tab.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => new URL(e.name).pathname.startsWith('/_next/static/'))
    .map(e => ({ path: new URL(e.name).pathname, transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize })));
  const cacheControl = new Map();
  page.on('response', r => cacheControl.set(new URL(r.url()).pathname, r.headers()['cache-control'] ?? '(none)'));
  await openApp(page);
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  const first = await staticFiles(page);
  const uncompressed = first.filter(f => /\.(js|css)$/.test(f.path) && f.decoded > 1024 && f.encoded >= f.decoded);
  expect(first.length, 'the first visit should load files from /_next/static/').toBeGreaterThan(0);
  expect(uncompressed, 'code and styles sent without compression').toEqual([]);

  const again = await context.newPage();
  await again.goto('/');
  await again.locator('#main').waitFor();
  await again.waitForLoadState('load');
  await again.evaluate(() => document.fonts.ready);
  const second = await staticFiles(again);
  const refetched = second.filter(f => f.transfer > 0).map(f => `${f.path} (${kb(f.transfer)}, Cache-Control: ${cacheControl.get(f.path)})`);
  expect(second.length, 'the return visit should use the same files').toBeGreaterThan(0);
  expect(refetched, 'files the return visit fetched again instead of taking them from the cache').toEqual([]);
});

test('a slider move saves one small record, and switching sections saves nothing heavy', async ({ page }) => {
  const MOVES = 10;
  await page.addInitScript(recordStorageWrites);
  await openApp(page);
  await goTo(page, 'payoff');
  await slider(page).focus();
  await page.evaluate(() => { window.__auditWrites.length = 0; });
  for (let i = 0; i < MOVES; i++) await page.keyboard.press('ArrowRight');
  await expect(slider(page)).toHaveValue(String(PROFILE.extraPerMonth + 5 * MOVES));
  const onMove = await page.evaluate(() => window.__auditWrites.splice(0));
  for (const tab of TOUR) await goTo(page, tab);
  const onSwitch = await page.evaluate(() => window.__auditWrites.splice(0));

  expect(onMove.length, `${MOVES} slider moves made ${onMove.length} storage writes: ${JSON.stringify(onMove)}`).toBeLessThanOrEqual(MOVES);
  expect(Math.max(0, ...onMove.map(w => w.bytes)), `a slider move wrote a large record: ${JSON.stringify(onMove)}`).toBeLessThanOrEqual(1024);
  const switched = onSwitch.reduce((s, w) => s + w.bytes, 0);
  expect(switched, `${TOUR.length} section switches wrote ${kb(switched)}: ${JSON.stringify(onSwitch)}`).toBeLessThanOrEqual(1024);
});

test('switching sections back and forth leaves no extra DOM nodes or event listeners behind', async ({ page }) => {
  // Reduced motion makes each switch scroll instantly, so the switches can run back to back.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const tools = await devtools(page);
  const buttons = { plans: /^(Repayment plans|Plans)\b/, payoff: /^Payoff\b/, records: /^Records/, loans: /^(Your loans|Loans)\b/ };
  const tour = async () => { for (const tab of TOUR) await sections(page).getByRole('button', { name: buttons[tab] }).click(); };
  await tour();
  const before = await tools.domCounters();
  for (let i = 0; i < 10; i++) await tour();
  const after = await tools.domCounters();
  expect({ nodes: after.nodes - before.nodes, listeners: after.jsEventListeners - before.jsEventListeners },
    `after 40 more section switches: nodes ${before.nodes} -> ${after.nodes}, event listeners ${before.jsEventListeners} -> ${after.jsEventListeners}`)
    .toEqual({ nodes: 0, listeners: 0 });
});
