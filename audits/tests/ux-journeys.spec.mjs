// UX journeys: can a borrower follow the page's sequence (loans, a plan, payoff, a record) and trust what each step
// tells them? Known issues UX-01 to UX-11 from audits/ROADMAP.md come first, then regression guards for journeys the
// audit verified. Chromium only, like the rest of the suite, so UX-07's Safari chart axis and UX-09's WebKit page
// count are not covered here. Figures the app computes are read from the page, not hard-coded, so a money fix
// (MONEY-01, MONEY-04, MONEY-08) does not break these tests.
import fs from 'node:fs/promises';
import {
  test, expect, knownIssue, seed, openApp, goTo, settle, stored, KEYS, LOANS, PROFILE, SNAPSHOTS, PHONE,
} from './helpers.mjs';
import {
  installProbes, quiet, pollUntil, usd, dollars, total, short, manyLoans, pdfPageCount, readXlsx, textCells,
  sectionControl, control,
} from './support/ux-journeys.mjs';

/** Opens the app with the page probes installed and the entrance animations finished. */
async function open(page, options) {
  await installProbes(page);
  await openApp(page, options);
  await quiet(page);
}

async function visit(page, tab) {
  await goTo(page, tab);
  await quiet(page);
}

const probe = (page, name, ...args) => page.evaluate(([n, a]) => window.__ux[n](...a), [name, args]);

/** Answers that price every open plan: income given, private sector, nothing chosen yet. */
const ANSWERED = { income: 52000, householdSize: 1, employment: 'private', goal: 'least_total', extraPerMonth: 0, selectedPlan: null };

const PLAN = String.raw`(?:Tiered Standard|Standard|Graduated|Extended|IBR|RAP|PAYE|ICR|SAVE)`;

/** A plan's choose button under any wording a fix gives it ('Use IBR as my plan', 'Use IBR for my numbers'). */
const choose = plan => new RegExp(`^(use|choose|pick|select|show|model|try|set)\\b.*(?<!Tiered )\\b${plan}\\b`, 'i');
const chosen = (page, id) => pollUntil(() => stored(page, KEYS.profile), p => p?.selectedPlan === id, { timeout: 3000 });

/** Fixed rule copy, not a borrower's figure: it has to stay readable with Hide on. */
const RULES = [
  String.raw`Requires more than \$30,000`, String.raw`\$0 payment`, String.raw`\$10 (?:minimum|monthly floor)`,
  String.raw`\$50 (?:per dependent|a month goes to principal)`, String.raw`under \$25,000`,
];

const sentence = (text, re) => text.split(/(?<=[.!?])\s+|\n/).find(s => re.test(s)) ?? short(text, 160);

async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return textCells(readXlsx(await fs.readFile(await file.path())));
}

async function saveSnapshot(page) {
  const before = (await stored(page, KEYS.snapshots))?.length ?? 0;
  await page.getByRole('button', { name: /^save today/i }).click();
  await pollUntil(() => stored(page, KEYS.snapshots), s => (s?.length ?? 0) > before);
  await quiet(page);
}

// ---------------------------------------------------------------- known issues

// The real step a borrower still has to take, and where.
const REAL_STEP = String.raw`\b(apply|applying|application|enrol\w*|sign(?:ing)? up|switch\w*|request\w*|ask|contact|call)\b`;
const REAL_PLACE = String.raw`studentaid\.gov|servicer`;
// Wording that states a plan is the borrower's own: the toast, pill, badge and the summary under 'You owe'.
const CLAIMS = [
  String.raw`is now your plan`, String.raw`this is (?:your|my) plan`, String.raw`✓\s*your plan`,
  String.raw`\ba month on ${PLAN}\b(?!\s*(?:if|when|once|after))`,
];

async function afterChoosing(page) {
  await quiet(page);
  return page.evaluate(([step, place, claims]) => {
    const u = window.__ux;
    const blocks = u.onScreenBlocks(400, 'nav');
    const text = document.body.innerText;
    return {
      step: blocks.filter(b => new RegExp(step, 'i').test(b) && new RegExp(place, 'i').test(b)),
      announced: u.liveTexts(),
      screen: blocks.filter(b => /plan|servicer|studentaid/i.test(b)).slice(0, 5),
      claims: claims.flatMap(c => [...text.matchAll(new RegExp(`[^.\\n]*(?:${c})[^.\\n]*`, 'gi'))].map(m => u.norm(m[0]))),
    };
  }, [REAL_STEP, REAL_PLACE, CLAIMS]);
}

/** Presses a button from the middle of the screen, where a person's eyes are when they press it. */
async function pressFromMiddle(button) {
  await button.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await button.click();
}

test('UX-01 choosing a plan says it only changes the numbers here and names the real step', async ({ page }) => {
  knownIssue('UX-01');
  await page.setViewportSize(PHONE);
  await open(page, { profile: { ...PROFILE, selectedPlan: null } });
  await visit(page, 'plans');

  // Our pick, from the recommendation box, which comes before the cards.
  await pressFromMiddle(page.getByRole('button', { name: choose('Standard') }).first());
  await chosen(page, 'standard');
  const hero = await afterChoosing(page);

  // A plan that is not our pick, from its own card, where the box's note is far above.
  await pressFromMiddle(page.getByRole('button', { name: choose('IBR') }).first());
  await chosen(page, 'ibr');
  const card = await afterChoosing(page);

  // The Payoff header repeats the choice.
  await visit(page, 'payoff');
  const header = await page.evaluate(plan => window.__ux.lines(document.getElementById('main'), 'nav')
    .map(l => l.text).filter(t => new RegExp(`^on ${plan}\\b`, 'i').test(t)), PLAN);

  const seen = s => `announced ${JSON.stringify(s.announced)}; on screen ${s.screen.map(t => `"${short(t, 90)}"`).join(', ')}`;
  expect.soft(hero.step, `After choosing Standard in 'Where we would start', nothing on screen says this only changes the numbers in this app or names the real step (apply at studentaid.gov or ask the servicer): ${seen(hero)}`).not.toEqual([]);
  expect.soft(card.step, `After choosing IBR on its card, nothing on screen names the real step: ${seen(card)}`).not.toEqual([]);
  const claims = [...new Set([...hero.claims, ...card.claims, ...header])];
  expect.soft(claims, `The page states a plan is the borrower's own, though only this browser changed: ${JSON.stringify(claims)}`).toEqual([]);
});

// Says the app cannot see the servicer, or that new balances have to be typed in first.
const NO_SERVICER_LINK = String.raw`\b(cannot|can ?not|can't|does ?not|doesn't|never|no way to|has no (?:way|link|connection))\b[^.]{0,60}\bservicer`;
const TYPE_IT_IN = String.raw`\b(type|retype|enter|update)\b[^.]{0,50}\b(balances?|numbers|figures|amounts)\b|\b(balances?|numbers|figures)\b[^.]{0,40}\b(typed|entered)\b`;
// 'Nothing changed' as a verdict. 'No changes to what you typed' is a different, true statement.
const NOTHING_CHANGED = /[^\n.]*\b(?:nothing (?:has )?changed|no changes?)\b(?=\s*(?:since|from|[.,;:—]|$))[^\n]*/im;

const recordsProse = page => page.evaluate(() => window.__ux
  .prose(document.getElementById('main'), 'footer, nav, button, [role="status"], section[aria-label="Summary"]'));

test('UX-02 Records says the app cannot see the servicer, and a save with nothing retyped is not called "Nothing changed"', async ({ page }) => {
  knownIssue('UX-02');
  await page.setViewportSize(PHONE);
  await open(page, { snapshots: [] });
  await visit(page, 'records');
  const empty = await recordsProse(page);
  await saveSnapshot(page);
  const one = await recordsProse(page);
  // The page's own instruction, followed as written: save again, with no balance typed in.
  await saveSnapshot(page);
  const two = await recordsProse(page);
  const cells = await download(page, page.getByRole('button', { name: /spreadsheet/i }));

  const tells = s => new RegExp(NO_SERVICER_LINK, 'i').test(s) || new RegExp(TYPE_IT_IN, 'i').test(s);
  expect.soft(tells(empty) && tells(one), `Records never says the app cannot see the servicer, or that new balances have to be typed in before a save. With no record it says "${sentence(empty, /save another|servicer next/i)}"; after one save, "${sentence(one, /snapshot stores|on this device/i)}"`).toBe(true);
  const verdict = NOTHING_CHANGED.exec(two)?.[0].trim();
  expect.soft(verdict ?? null, `A second save with no balance typed in is recorded as "${verdict}", though the app never saw the servicer's figures`).toBeNull();
  const noChange = cells.filter(c => /^\s*no change\s*$/i.test(c.text)).map(c => `${c.sheet}!${c.ref}`);
  expect.soft(noChange, `The history spreadsheet records "No change" at ${noChange.join(', ')}`).toEqual([]);
  const typed = cells.filter(c => /\b(typed|entered|cannot see|can't see|does not see|doesn't see|by hand)\b/i.test(c.text));
  expect.soft(typed.length, `No cell in the history spreadsheet says its figures are what was typed into this app; its notes are ${JSON.stringify(cells.filter(c => c.text.length > 40).map(c => short(c.text, 80)))}`).toBeGreaterThan(0);
});

test('UX-03 a Next card or section tab lands with the new section heading below the sticky bar', async ({ page }) => {
  knownIssue('UX-03');
  await page.setViewportSize(PHONE);
  await open(page);
  await visit(page, 'plans');
  const landed = j => j.headingTop !== null && j.headingTop >= j.barBottom - 1 && j.headingTop <= j.vh - 24;
  const jumps = [];
  const jump = async how => {
    await settle(page);
    jumps.push({ how, ...await pollUntil(() => probe(page, 'headingVsBar'), landed, { timeout: 1000 }) });
  };

  await control(page, /See your debt-free date/i).click();
  await jump("the Next card 'See your debt-free date' (Plans to Payoff)");
  await control(page, /Save a dated record/i).click();
  await jump("the Next card 'Save a dated record' (Payoff to Records)");
  await visit(page, 'plans');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle(page);
  await goTo(page, 'payoff');
  await jump('the Payoff tab, pressed at the bottom of Plans');

  const missed = jumps.filter(j => !landed(j));
  const where = j => (j.headingTop === null ? 'with no heading found'
    : j.headingTop < j.barBottom ? `at ${j.headingTop}px, ${j.barBottom - j.headingTop}px above the bar's bottom edge`
      : `at ${j.headingTop}px, below the ${j.vh}px screen`);
  const told = missed.map(j => `${j.how} leaves "${short(j.heading ?? '', 60)}" ${where(j)}`).join('; ');
  expect.soft(missed.length, `After ${missed.length} of ${jumps.length} jumps at 375x812 the new section's heading is not just below the ${jumps[0].barBottom}px section bar: ${told}`).toBe(0);
});

test('UX-04 an answer that changes the recommended plan shows the new pick where it was given, and announces it', async ({ page }) => {
  knownIssue('UX-04');
  await page.setViewportSize(PHONE);
  await open(page, { profile: ANSWERED });
  await visit(page, 'plans');
  const before = await probe(page, 'pick');
  await page.getByRole('radio', { name: 'Lowest monthly payment' }).click();
  const after = await pollUntil(() => probe(page, 'pick'), p => !!p && p.name !== before?.name);
  await quiet(page);
  expect(after?.name, "Tapping 'Lowest monthly payment' should change the recommended plan for these loans").not.toBe(before?.name);

  const word = `(?<!Tiered )\\b${after.name}\\b`;
  const screen = await page.evaluate(([w, amount]) => ({
    hits: window.__ux.onScreenBlocks().filter(b => new RegExp(w).test(b) && b.includes(amount)),
    scrollY: Math.round(scrollY),
    vh: innerHeight,
  }), [word, after.amount]);
  const heard = await pollUntil(() => page.evaluate(() => {
    const f = document.activeElement;
    return [...window.__ux.liveTexts(), f && f !== document.body ? window.__ux.norm(f.innerText || f.textContent) : ''];
  }), texts => texts.some(t => new RegExp(word).test(t)), { timeout: 1500 });

  const boxAt = after.top - screen.scrollY;
  expect.soft(screen.hits, `Tapping 'Lowest monthly payment' moved our pick from ${before?.name} at ${before?.amount} to ${after.name} at ${after.amount} a month, but nothing on the 375x812 screen shows it: 'Where we would start' begins at ${boxAt}px, ${boxAt - screen.vh}px below the fold`).not.toEqual([]);
  expect.soft(heard.some(t => new RegExp(word).test(t)), `No live region or focused element names ${after.name} once the answer settles; live regions say ${JSON.stringify(heard.filter(Boolean))}`).toBe(true);
});

/** Each open plan's figures as its card states them, and the most plans whose figures one scroll position shows. */
const comparison = page => page.evaluate(() => {
  const u = window.__ux;
  const main = document.getElementById('main');
  const NAMES = ['Tiered Standard', 'Standard', 'Graduated', 'Extended', 'IBR', 'RAP', 'PAYE', 'ICR', 'SAVE'];
  const named = n => new RegExp(n === 'Standard' ? '(?<!Tiered )\\bStandard\\b' : `\\b${n}\\b`);
  // $37,300, $37.3k; 10 yr, 15.3 years, 15 yr 4 mo. Any of them is the same figure to a reader.
  const amounts = t => [...t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)(\s?[kK]\b)?/g)]
    .map(m => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
  const terms = t => [...t.matchAll(/(\d+(?:\.\d+)?)\s?(yrs?|years?|mos?|months?)\b(?:,?\s*(\d+)\s?(?:mos?|months?)\b)?/gi)]
    .map(m => (/^y/i.test(m[2]) ? Number(m[1]) + (m[3] ? Number(m[3]) / 12 : 0) : Number(m[1]) / 12));
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.015);

  const sources = [];
  for (const h of main.querySelectorAll('h3')) {
    if (!u.present(h)) continue;
    let card = h;
    while (card.parentElement && card.parentElement !== main && card.parentElement.querySelectorAll('h3').length === 1) card = card.parentElement;
    sources.push([u.norm(h.innerText), card.innerText]);
  }
  for (const row of main.querySelectorAll('tr')) {
    const head = row.querySelector('th, td');
    if (head && u.present(row)) sources.push([u.norm(head.innerText), row.innerText]);
  }
  const plans = [];
  for (const [title, text] of sources) {
    const name = NAMES.find(n => named(n).test(title));
    const a = amounts(text);
    if (!name || a.length < 2 || plans.some(p => p.name === name)) continue;
    const over = /\bover\s+(\d+(?:\.\d+)?\s?(?:yrs?|years?|mos?|months?))\b/i.exec(text)?.[1] ?? null;
    plans.push({ name, monthly: a[0], total: a[1], term: over ? u.norm(over) : null, years: over ? terms(over)[0] : null });
  }

  const lines = u.lines(main, 'nav, footer').map(l => ({ text: l.text, top: l.top + scrollY, bottom: l.bottom + scrollY }));
  const spans = ok => lines.filter(l => ok(l.text)).map(l => [l.top, l.bottom]);
  const needles = plans.map(p => [
    spans(t => named(p.name).test(t)),
    spans(t => amounts(t).some(a => near(a, p.monthly))),
    spans(t => amounts(t).some(a => near(a, p.total))),
    ...(p.years === null ? [] : [spans(t => terms(t).some(y => Math.abs(y - p.years) < 0.05))]),
  ]);
  const unfound = plans.filter((p, i) => needles[i].some(s => !s.length)).map(p => p.name);
  const barHeight = u.bar()?.getBoundingClientRect().height ?? 0;
  const last = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  let best = { count: -1, names: [] };
  for (let y = 0; y <= last + 7; y += 8) {
    const at = Math.min(y, last);
    const top = at + barHeight - 1;
    const bottom = at + innerHeight + 1;
    const together = plans.filter((p, i) => needles[i].every(s => s.some(([a, b]) => a >= top && b <= bottom)));
    if (together.length > best.count) best = { count: together.length, names: together.map(p => p.name) };
  }
  return { plans, best, unfound, usable: Math.round(innerHeight - barHeight) };
});

test("UX-05 every open plan's monthly payment, total and term can be read together on one phone screen", async ({ page }) => {
  knownIssue('UX-05');
  await page.setViewportSize(PHONE);
  await open(page, { profile: ANSWERED });
  await visit(page, 'plans');
  const { plans, best, unfound, usable } = await comparison(page);
  expect(plans.length, 'The Plans tab should show at least two open plans with figures for these answers').toBeGreaterThan(1);
  expect(unfound, 'Every figure read from a plan card should be found as text on the page').toEqual([]);
  const figures = plans.map(p => `${p.name} ${dollars(p.monthly)} a month, ${dollars(p.total)} over ${p.term}`).join('; ');
  expect.soft(best.count, `At 375x812 no scroll position shows every open plan's monthly payment, total and term together: at most ${best.count} of ${plans.length} (${best.names.join(' and ')}) fit in the ${usable}px below the section bar. Plans: ${figures}`).toBe(plans.length);
});

// A consequence that takes plans away, in any wording a fix might use.
const CLOSES = String.raw`\b(?:clos\w*|lose|loses|losing|lost|no longer|can ?not (?:use|get|choose|pick)|can't (?:use|get|choose|pick)|not (?:be )?(?:open|available))\b`;

test('UX-06 the warning that consolidating closes the older plans sits by the recommendation and names only plans that would close', async ({ page }) => {
  knownIssue('UX-06');
  await page.setViewportSize(PHONE);
  await open(page, { profile: { ...ANSWERED, selectedPlan: 'standard' } });
  await visit(page, 'plans');
  const found = await page.evaluate(closeWords => {
    const u = window.__ux;
    const box = u.pick();
    const closes = new RegExp(closeWords, 'i');
    const els = [...document.querySelectorAll('#main *')].filter(el => !el.closest('nav, footer') && u.present(el));
    const hits = els.filter(el => { const t = u.norm(el.innerText); return t.length <= 700 && /consolidat/i.test(t) && closes.test(t); });
    const warnings = hits.filter(el => !hits.some(o => o !== el && el.contains(o))).map(el => {
      const r = el.getBoundingClientRect();
      const text = u.norm(el.innerText);
      // What the sentence says would close, up to a 'but' or 'except' that turns to something else.
      const clause = (new RegExp(`${closeWords}[^.]*`, 'i').exec(text)?.[0] ?? '')
        .split(/\b(?:but|except|although|though|while|whereas|unlike)\b|;|—/i)[0].trim();
      const top = r.top + scrollY;
      const bottom = r.bottom + scrollY;
      return { text, clause, gap: box ? Math.round(Math.max(0, top - box.bottom, box.top - bottom)) : null };
    });
    return { warnings: warnings.sort((a, b) => a.gap - b.gap), vh: innerHeight };
  }, CLOSES);

  // Extended needs more than $30,000 in Direct Loans and these loans total less, so it is not open to lose.
  const owed = total(LOANS);
  expect(owed, 'The fixture loans should total under $30,000').toBeLessThan(30000);
  const near = found.warnings[0];
  expect.soft(near?.gap ?? Infinity, near
    ? `The one-way warning ("${short(near.text, 110)}") starts ${near.gap}px below the recommendation, ${(near.gap / found.vh).toFixed(1)} screens down at 375x812, where a borrower who stops at the pick never reaches it`
    : 'The Plans tab has no warning that consolidating or borrowing again closes the older plans').toBeLessThanOrEqual(found.vh);
  const wrong = found.warnings.filter(w => /\bExtended\b/.test(w.clause)).map(w => w.clause);
  expect.soft(wrong, `The warning says consolidating would "${wrong[0]}", but Extended is already closed to these loans (${usd(owed)} owed; Extended needs more than $30,000)`).toEqual([]);
});

test('UX-07 with Hide dollar amounts on, no figure about the borrower can be read on any section', async ({ page }) => {
  knownIssue('UX-07');
  await page.setViewportSize(PHONE);
  await open(page);
  const toggle = page.getByRole('button', { name: 'Hide dollar amounts' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const leaks = {};

  await visit(page, 'plans');
  leaks.Plans = await probe(page, 'readableFigures', RULES);
  const income = page.getByLabel(/yearly income/i).first();
  await income.focus();
  const typing = await income.evaluate(el => !window.__ux.concealed(el));
  await income.evaluate(el => el.blur());
  const rule = await page.getByText(/Requires more than \$30,000/).first().evaluate(el => !window.__ux.concealed(el));
  await page.emulateMedia({ media: 'print' });
  const printed = await income.evaluate(el => !window.__ux.concealed(el));
  await page.emulateMedia({ media: null });

  await visit(page, 'payoff');
  const other = control(page, /different plan changes this/i);
  if (await other.count() && (await other.getAttribute('aria-expanded')) !== 'true') await other.click();
  await quiet(page);
  leaks.Payoff = await probe(page, 'readableFigures', RULES);

  await visit(page, 'records');
  leaks.Records = await probe(page, 'readableFigures', RULES);

  await visit(page, 'loans');
  await page.getByRole('button', { name: new RegExp(`^${LOANS[1].nickname}`) }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const more = page.getByRole('button', { name: /^add more detail/i }).first();
  if (await more.count() && (await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await quiet(page);
  leaks['Loans, editing a loan'] = await probe(page, 'readableFigures', RULES);
  const rate = await page.getByLabel('Interest rate').first().evaluate(el => !window.__ux.concealed(el));

  const all = Object.entries(leaks).filter(([, l]) => l.length).map(([tab, l]) => `${tab}: ${l.join(', ')}`);
  expect.soft(all, `With Hide dollar amounts on, someone beside the borrower can still read ${all.join(' | ')}`).toEqual([]);
  expect.soft(typing, 'A focused dollar field has to show its value, or typing into it is blind').toBe(true);
  expect.soft(printed, 'Printing with Hide on has to keep the figures on paper').toBe(true);
  expect.soft(rule, "The fixed rule 'Requires more than $30,000 in Direct Loans' has to stay readable").toBe(true);
  expect.soft(rate, 'The interest rate is not a dollar amount and has to stay readable').toBe(true);
});

const LOAN_FIELDS = ['id', 'nickname', 'servicer', 'kind', 'subsidy', 'principal', 'balance', 'rate', 'disbursementDate', 'minPayment'];
const sameLoan = (a, b) => LOAN_FIELDS.every(k => a?.[k] === b?.[k]);
const EXAMPLE = /(?<!for )\bexamples?\b/i;

test('UX-08 example loans stay marked on every section, on paper and in the spreadsheet, and never enter the dated record', async ({ page }) => {
  knownIssue('UX-08');
  await page.setViewportSize(PHONE);
  await open(page, { seeded: false });
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  const examples = await pollUntil(() => stored(page, KEYS.loans), l => l?.length > 0);

  const unmarked = [];
  for (const tab of ['plans', 'payoff', 'records', 'loans']) {
    await visit(page, tab);
    const seen = await page.evaluate(source => {
      const u = window.__ux;
      const re = new RegExp(source, 'i');
      const marks = u.textNodes(document.body).filter(t => re.test(t.text) && !(t.el.closest('[role="status"]') && /loaded/i.test(t.text)));
      return {
        on: marks.some(t => u.onScreen(t)),
        first: marks[0] ? { text: u.norm(marks[0].el.innerText), top: Math.round(marks[0].top) } : null,
        bar: Math.round(u.bar()?.getBoundingClientRect().bottom ?? 0),
      };
    }, EXAMPLE.source);
    if (!seen.on) unmarked.push({ tab, ...seen });
  }
  await page.emulateMedia({ media: 'print' });
  const paper = await page.evaluate(source => new RegExp(source, 'i').test(window.__ux.pageText()), EXAMPLE.source);
  await page.emulateMedia({ media: null });
  const cells = await download(page, page.getByRole('button', { name: /spreadsheet/i }));

  // Saving a dated record while only the examples are loaded.
  await visit(page, 'records');
  const save = page.getByRole('button', { name: /^save today/i }).first();
  if (await save.count() && await save.isEnabled()) {
    await save.click();
    await pollUntil(() => stored(page, KEYS.snapshots), s => (s?.length ?? 0) > 0, { timeout: 1000 });
  }
  const exampleOnly = s => Array.isArray(s?.loans) && s.loans.length > 0 && s.loans.every(l => examples.some(e => sameLoan(e, l)));
  const recorded = ((await stored(page, KEYS.snapshots)) ?? []).filter(exampleOnly).length;

  // Saved before a fix: a record of the untouched examples, then one where the borrower typed a balance.
  const typed = examples.map((l, i) => (i === 0 ? { ...l, balance: l.balance + 120 } : l));
  const old = [
    { takenAt: '2026-08-03T17:00:00.000Z', loans: examples, totalBalance: total(examples) },
    { takenAt: '2026-09-14T17:00:00.000Z', loans: typed, totalBalance: total(typed) },
  ];
  const later = await page.context().newPage();
  await installProbes(later);
  await seed(later, { loans: typed, profile: PROFILE, snapshots: old });
  await later.goto('/');
  await later.locator('#main').waitFor();
  await visit(later, 'records');
  const [exampleDay, typedDay] = await later.evaluate(s => s.map(x => new Date(x.takenAt)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })), old);
  const records = await later.locator('#main').innerText();

  const at = m => (!m.first ? `after tapping ${m.tab} there is no "example" text anywhere on the page`
    : `after tapping ${m.tab} the only one, "${short(m.first.text, 60)}", sits at ${m.first.top}px, ${m.first.top < 0 ? 'above the top of the screen' : `under the ${m.bar}px section bar`}`);
  expect.soft(unmarked.map(m => m.tab), `With the example loans loaded, no "example" text is on screen after tapping ${unmarked.map(m => m.tab).join(', ')}${unmarked[0] ? `; ${at(unmarked[0])}` : ''}`).toEqual([]);
  expect.soft(paper, 'The printout of the example loans never says they are examples').toBe(true);
  expect.soft(cells.filter(c => EXAMPLE.test(c.text)).length, `The Loans spreadsheet of the example loans never says "example"; it opens "${cells.slice(0, 3).map(c => c.text).join(' / ')}"`).toBeGreaterThan(0);
  expect.soft(recorded, `Saving today's snapshot with only the example loans loaded put ${recorded} record of example loans into the dated record`).toBe(0);
  expect.soft(records.includes(exampleDay), `A record of the untouched example loans saved ${exampleDay} is still listed in Records`).toBe(false);
  expect.soft(records.includes(typedDay), `The record from ${typedDay}, which holds a balance the borrower typed, has to stay`).toBe(true);
});

const printLabel = async page => {
  const button = page.getByRole('button', { name: /^print/i });
  return (await button.count()) ? (await button.first().innerText()).trim() : null;
};

test('UX-09 the printed loan list keeps what its button promises, carries the date and fits one Letter page', async ({ page }) => {
  knownIssue('UX-09');
  await open(page);
  const button = await printLabel(page);
  const margins = ['0.25in', '0.5in'];
  const pages = {};
  for (const m of margins) pages[m] = pdfPageCount(await page.pdf({ format: 'Letter', margin: { top: m, right: m, bottom: m, left: m } }));

  // What the browser does when someone prints: beforeprint, then print styles.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const dated = await page.evaluate(() => {
    const d = new Date();
    const forms = [
      d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US'),
      d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    ];
    const text = window.__ux.pageText();
    return { today: forms[0], found: forms.some(f => text.includes(f)) };
  });
  await page.emulateMedia({ media: null });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // Plans as the browser prints it, with backgrounds off as browsers default.
  await visit(page, 'plans');
  await page.emulateMedia({ media: 'print' });
  const pick = await probe(page, 'printedPickContrast');
  await page.emulateMedia({ media: null });

  // A long list: whatever the button promises has to hold there too. Seeding it replaces this context's loans.
  const long = await page.context().newPage();
  await seed(long, { loans: manyLoans(24) });
  await long.goto('/');
  await long.locator('#main').waitFor();
  const longButton = await printLabel(long);
  const longPages = pdfPageCount(await long.pdf({ format: 'Letter', margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' } }));
  const promised = /\b(one|1|single)[\s-]+page\b/i.test(longButton ?? '') ? 1 : Infinity;

  const over = margins.filter(m => pages[m] !== 1);
  expect.soft(over, `'${button}' prints the 8-loan list on ${margins.map(m => `${pages[m]} Letter pages at ${m} margins`).join(' and ')}`).toEqual([]);
  expect.soft(dated.found, `The printout carries no date: nothing printed reads ${dated.today} or any other form of today`).toBe(true);
  expect.soft(longPages, `'${longButton}' prints a 24-loan list on ${longPages} pages`).toBeLessThanOrEqual(promised);
  expect.soft(pick?.ratio ?? 0, pick?.hidden ? 'The top pick prints' : `Printed with backgrounds off, the top pick's "${pick?.text}" (${pick?.screen} on screen) prints as ${pick?.ink} on ${pick?.paper} paper, ${pick?.ratio}:1 against the 4.5:1 minimum`).toBeGreaterThanOrEqual(4.5);
});

test('UX-10 Back and Forward walk the sections, and a reload or a saved link reopens the section that was open', async ({ page, browser }) => {
  knownIssue('UX-10');
  await page.setViewportSize(PHONE);
  await open(page);
  const home = page.url();
  const origin = new URL(home).origin;
  const tap = async tab => { await sectionControl(page, tab).click(); await settle(page); await quiet(page); };
  const where = async (p, want) => {
    await p.waitForLoadState().catch(() => {});
    const read = async () => ({ url: p.url(), section: await p.evaluate(() => window.__ux?.section() ?? null).catch(() => null) });
    return pollUntil(read, w => w.section === want, { timeout: 1000 });
  };
  const at = w => (w.url.startsWith(origin) ? `${w.section ?? 'no section'} (${w.url})` : `${w.url}, outside the app`);

  await tap('plans');
  const atPlans = page.url();
  await tap('payoff');
  const atPayoff = page.url();
  await page.goBack();
  const back = await where(page, 'plans');
  await page.goBack();
  const backAgain = await where(page, 'loans');
  await page.goForward();
  const forward = await where(page, 'plans');

  if (!(await page.evaluate(() => !!document.querySelector('nav[aria-label="Sections"]')).catch(() => false))) {
    await page.goto(home);
    await page.locator('#main').waitFor();
  }
  await tap('payoff');
  await page.reload();
  await page.locator('#main').waitFor();
  const reloaded = await where(page, 'payoff');

  const tab = await page.context().newPage();
  await installProbes(tab);
  await tab.goto(atPayoff);
  await tab.locator('#main').waitFor();
  const linked = await where(tab, 'payoff');
  await tab.close();

  // Someone else, or this browser after Clear my data: no loans saved.
  const fresh = await browser.newContext();
  const first = await fresh.newPage();
  await first.goto(atPayoff);
  await first.locator('#main').waitFor();
  const firstRun = await first.getByRole('button', { name: /look around with example loans|add my first loan/i }).first().isVisible();
  const firstUrl = first.url();
  await fresh.close();

  const marker = u => new URL(u).hash + new URL(u).search;
  const addresses = new Set([home, atPlans, atPayoff]);
  expect.soft(back.section, `After Loans, Plans, Payoff, Back went to ${at(back)} instead of Plans${addresses.size === 1 ? `: the address stayed ${home} in every section, so no section had a history entry` : ''}`).toBe('plans');
  expect.soft(backAgain.section, `A second Back should reach Loans, still inside the app; it went to ${at(backAgain)}`).toBe('loans');
  expect.soft(forward.section, `Forward should walk back in to Plans; it shows ${at(forward)}`).toBe('plans');
  expect.soft(reloaded.section, `A reload on Payoff reopens ${at(reloaded)}`).toBe('payoff');
  expect.soft(addresses.size, `Loans, Plans and Payoff have ${addresses.size === 1 ? `one address, ${home}` : `the addresses ${[home, atPlans, atPayoff].join(', ')}`}, so no link or bookmark can reopen a section`).toBe(3);
  expect.soft(linked.section, `Opening the Payoff address (${atPayoff}) in a new tab shows ${at(linked)}`).toBe('payoff');
  expect.soft([atPlans, atPayoff].filter(u => /\d/.test(marker(u))), 'Only the section name may go in the address, never a figure').toEqual([]);
  expect.soft(firstRun && !/plans|payoff|records/i.test(marker(firstUrl)), `With no saved loans the Payoff address should open the first-run screen and drop the section (got ${firstUrl}, first run shown: ${firstRun})`).toBe(true);
});

/** "+$145", "up $145" or "$145 more" for a rise; the matching words for a fall. Cents when there are some. */
function signedChange(delta) {
  const abs = Math.round(Math.abs(delta) * 100) / 100;
  const digits = dollars(abs).slice(1).replace(/,/g, ',?').replace('.', '\\.');
  const amount = `\\$\\s?${digits}${Number.isInteger(abs) ? '(?:\\.00)?' : ''}(?![.,]?\\d)`;
  return delta > 0
    ? `[+＋]\\s?${amount}|\\b(?:up|rose|increased|grew)\\s+(?:by\\s+)?${amount}|${amount}\\s+(?:more|higher)`
    : `[−–-]\\s?${amount}|\\b(?:down|fell|dropped|decreased)\\s+(?:by\\s+)?${amount}|${amount}\\s+(?:less|lower)`;
}

/** The one balance that moved between two snapshots, computed from the fixture. */
const firstChange = ([older, newer]) => {
  const moved = newer.loans.find(l => older.loans.some(o => o.id === l.id && o.balance !== l.balance));
  const was = older.loans.find(o => o.id === moved.id).balance;
  return { nickname: moved.nickname, before: was, after: moved.balance, delta: Math.round((moved.balance - was) * 100) / 100 };
};

test('UX-11 each saved record opens to every loan, states a change as a signed amount and can be deleted with Undo', async ({ page }) => {
  knownIssue('UX-11');
  await page.setViewportSize(PHONE);
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await open(page);
  const change = firstChange(SNAPSHOTS);
  const signed = signedChange(change.delta);
  await visit(page, 'records');

  // The newest change, where it lands after the tab tap, and whether Records states it as a signed amount.
  const row = await page.evaluate(([c, source]) => {
    const u = window.__ux;
    const re = new RegExp(source, 'i');
    const amounts = t => [...t.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')));
    const has = (list, n) => list.some(a => Math.abs(a - n) < 0.005);
    const hits = [...document.querySelectorAll('#main *')].filter(el => {
      if ((el.textContent || '').length > 300 || !el.textContent.includes(c.nickname) || !u.present(el)) return false;
      const t = u.norm(el.innerText);
      return re.test(t) || (has(amounts(t), c.before) && has(amounts(t), c.after));
    });
    const leaf = hits.find(el => !hits.some(o => o !== el && el.contains(o)));
    const r = leaf?.getBoundingClientRect();
    return {
      text: leaf ? u.norm(leaf.innerText) : null,
      top: r ? Math.round(r.top) : null,
      bottom: r ? Math.round(r.bottom) : null,
      vh: innerHeight,
      barBottom: Math.round(u.bar()?.getBoundingClientRect().bottom ?? 0),
      states: re.test(u.norm(document.getElementById('main').innerText)),
    };
  }, [change, signed]);

  // Open whatever Records folds away until the newest record shows every loan with its balance and rate.
  const newest = SNAPSHOTS[SNAPSHOTS.length - 1].loans;
  const unlisted = () => page.evaluate(loans => {
    const u = window.__ux;
    const els = [...document.querySelectorAll('body *')]
      .filter(el => (el.textContent || '').length <= 400 && !el.closest('nav, footer, script, style') && u.present(el));
    return loans.filter(l => !els.some(el => {
      const t = u.norm(el.innerText);
      if (t.length > 240 || !t.includes(l.nickname)) return false;
      const amounts = [...t.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')));
      const rates = [...t.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map(m => Number(m[1]));
      return amounts.some(a => Math.abs(a - l.balance) < 0.005) && rates.some(r => Math.abs(r - l.rate) < 0.0001);
    })).map(l => l.nickname);
  }, newest);
  let missing = await unlisted();
  const folded = page.locator('#main [aria-expanded="false"]:visible, #main details:not([open]) > summary:visible');
  for (let i = 0; i < 12 && missing.length && await folded.count(); i++) {
    await folded.first().click({ timeout: 2000 }).catch(() => {});
    await quiet(page);
    missing = await unlisted();
  }
  // In-page controls only: nothing that leaves the app.
  const viewers = page.locator('#main button:not([aria-expanded]):visible, #main a[href^="#"]:visible')
    .filter({ hasText: /\b(see|show|view|open)\b.*\b(loans?|record|details?|balances?)\b/i });
  for (let i = 0, n = Math.min(await viewers.count(), 6); i < n && missing.length; i++) {
    await viewers.nth(i).click({ timeout: 2000 }).catch(() => {});
    await quiet(page);
    missing = await unlisted();
  }
  await page.keyboard.press('Escape');
  if ((await probe(page, 'section')) !== 'records') await visit(page, 'records');

  // Delete one record, then Undo.
  const count = async () => (await stored(page, KEYS.snapshots))?.length ?? 0;
  const start = await count();
  const remove = page.locator('#main').getByRole('button', { name: /\b(delete|remove)\b/i });
  const controls = await remove.count();
  let afterDelete = start;
  let afterUndo = start;
  if (controls) {
    await remove.first().click({ timeout: 2000 }).catch(() => {});
    afterDelete = await pollUntil(count, n => n < start, { timeout: 1000 });
    const confirm = page.getByRole('button', { name: /^(delete|remove|yes|confirm)\b/i });
    if (afterDelete === start && await confirm.count()) {
      await confirm.last().click({ timeout: 2000 }).catch(() => {});
      afterDelete = await pollUntil(count, n => n < start, { timeout: 1000 });
    }
    const undo = page.getByRole('button', { name: /^undo\b/i });
    if (await undo.count()) await undo.first().click({ timeout: 2000 }).catch(() => {});
    afterUndo = await pollUntil(count, n => n === start, { timeout: 1000 });
  }

  await page.getByRole('button', { name: 'Hide dollar amounts' }).click();
  await quiet(page);
  const blurred = await page.evaluate(source => {
    const re = new RegExp(source, 'i');
    const hits = [...document.querySelectorAll('#main *')].filter(el => re.test(el.innerText || ''));
    const leaves = hits.filter(el => !hits.some(o => o !== el && el.contains(o)));
    return leaves.length ? leaves.every(el => window.__ux.concealed(el)) : null;
  }, signed);

  // Cents: a 30-cent rise and a $26.50 drop, saved a month apart.
  const [older] = SNAPSHOTS;
  const centsLoans = older.loans.map((l, i) => (i === 0 ? { ...l, balance: l.balance + 0.3 } : i === 1 ? { ...l, balance: l.balance - 26.5 } : l));
  const centsShots = [older, { takenAt: '2026-09-01T15:00:00.000Z', loans: centsLoans, totalBalance: total(centsLoans) }];
  const cents = await page.context().newPage();
  await installProbes(cents);
  await seed(cents, { loans: centsLoans, snapshots: centsShots });
  await cents.goto('/');
  await cents.locator('#main').waitFor();
  await visit(cents, 'records');
  const centsText = (await cents.locator('#main').innerText()).replace(/\s+/g, ' ');
  const centsRows = older.loans.slice(0, 2)
    .map(l => centsText.match(new RegExp(`${l.nickname}[^→]{0,40}→\\s?\\$[\\d,]+(?:\\.\\d+)?`))?.[0] ?? `${l.nickname}: no row`);
  const unsigned = [0.3, -26.5].filter(d => !new RegExp(signedChange(d), 'i').test(centsText)).map(d => `${d > 0 ? '+' : '−'}${dollars(Math.abs(d))}`);

  const sign = change.delta > 0 ? '+' : '−';
  expect.soft(row.states, `The change row reads "${row.text}" and never states the change, ${sign}${dollars(Math.abs(change.delta))}; only the spreadsheet computes it`).toBe(true);
  expect.soft(missing, `A saved record cannot be opened to each loan's recorded balance and rate: ${missing.length} of ${newest.length} loans in the newest record are nowhere on Records`).toEqual([]);
  expect.soft(controls, 'Records has no control that deletes one record; the only way is Clear saved records on Loans, which deletes every record').toBeGreaterThan(0);
  if (controls) {
    expect.soft(afterDelete, `Deleting one of ${start} records left ${afterDelete}`).toBe(start - 1);
    expect.soft(afterUndo, `Undo after deleting a record left ${afterUndo} of ${start}`).toBe(start);
  }
  expect.soft(row.text !== null && row.top >= row.barBottom - 1 && row.bottom <= row.vh, row.text !== null
    ? `On a 375x812 phone the newest change ("${row.text}") sits at ${row.top} to ${row.bottom}px after tapping Records, ${row.bottom > row.vh ? `below the ${row.vh}px screen` : 'under the section bar'}`
    : 'The newest change row was not found on Records').toBe(true);
  if (blurred !== null) expect.soft(blurred, 'With Hide dollar amounts on, the signed change has to blur like every other figure').toBe(true);
  expect.soft(unsigned, `A 30-cent rise and a $26.50 drop are not stated as signed amounts; Records shows ${centsRows.map(r => `"${r}"`).join(' and ')}`).toEqual([]);
});

// ---------------------------------------------------------------- regression guards

test('first run shows both ways in on the first phone screen', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, { seeded: false });
  for (const name of ['Add my first loan', 'Look around with example loans']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box, `'${name}' should be on the page`).not.toBeNull();
    expect(Math.round(box.y + box.height), `'${name}' should end inside the first ${PHONE.height}px screen`).toBeLessThanOrEqual(PHONE.height);
  }
});

test('a section tab pressed at the top of the page lands at the section start, below the bar', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page);
  const landed = [];
  for (const tab of ['payoff', 'plans', 'records']) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await visit(page, tab);
    landed.push({ tab, ...await probe(page, 'headingVsBar') });
  }
  const off = landed.filter(l => !(l.headingTop >= l.barBottom - 1 && l.headingTop <= l.barBottom + 200));
  expect(off.map(l => `${l.tab}: "${l.heading}" at ${l.headingTop}px, bar bottom ${l.barBottom}px`), 'Each heading should sit within 200px below the section bar').toEqual([]);
});

test('dragging the extra-payment slider updates the headline in place, with both on screen', async ({ page }) => {
  const viewport = { width: 375, height: 667 };
  await page.setViewportSize(viewport);
  await open(page, { profile: { ...PROFILE, extraPerMonth: 0 } });
  await visit(page, 'payoff');
  const headline = page.getByRole('heading', { level: 2 }).first();
  const slider = page.getByRole('slider', { name: /extra each month/i });
  const before = { text: await headline.innerText(), scroll: await page.evaluate(() => scrollY), slider: await slider.boundingBox() };

  const y = before.slider.y + before.slider.height / 2;
  await page.mouse.move(before.slider.x + 12, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(before.slider.x + 12 + (before.slider.width * 0.4 - 12) * (i / 10), y);
  await page.mouse.up();
  await quiet(page);

  const text = await headline.innerText();
  const head = await headline.boundingBox();
  const moved = await slider.boundingBox();
  const { barBottom } = await probe(page, 'headingVsBar');
  expect(text, `The headline should answer the new amount; it still reads "${text}"`).not.toBe(before.text);
  expect(Math.abs((await page.evaluate(() => scrollY)) - before.scroll), 'The page should not scroll while the slider is dragged').toBeLessThanOrEqual(2);
  expect(Math.abs(moved.y - before.slider.y), 'The slider should hold still while the headline changes').toBeLessThanOrEqual(24);
  expect(head.y, 'The headline should stay below the section bar').toBeGreaterThanOrEqual(barBottom - 1);
  expect(head.y + head.height, 'The headline should stay on screen').toBeLessThanOrEqual(viewport.height);
  expect(moved.y + moved.height, 'The slider should stay on screen').toBeLessThanOrEqual(viewport.height);
});

test('Hide dollar amounts leaves no readable figure on Loans or Records, and stays on after a reload', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page);
  await page.getByRole('button', { name: 'Hide dollar amounts' }).click();
  await page.getByRole('button', { name: new RegExp(`^${LOANS[1].nickname}`) }).click();
  await quiet(page);
  expect(await probe(page, 'readableFigures', RULES), 'Loans, with a loan open').toEqual([]);
  await visit(page, 'records');
  expect(await probe(page, 'readableFigures', RULES), 'Records').toEqual([]);
  await page.reload();
  await page.locator('#main').waitFor();
  await quiet(page);
  await expect(page.getByRole('button', { name: 'Hide dollar amounts' }), 'Hide should still be on after a reload').toHaveAttribute('aria-pressed', 'true');
  expect(await probe(page, 'readableFigures', RULES), 'Loans, after a reload').toEqual([]);
});

test('the newest record names the loan that changed and shows its balance before and after', async ({ page }) => {
  await open(page);
  await visit(page, 'records');
  const change = firstChange(SNAPSHOTS);
  const line = await page.evaluate(c => {
    const u = window.__ux;
    const amounts = t => [...t.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')));
    const has = (list, n) => list.some(a => Math.abs(a - n) < 0.005);
    const el = [...document.querySelectorAll('#main li, #main p, #main tr')]
      .find(e => u.present(e) && e.innerText.includes(c.nickname) && has(amounts(e.innerText), c.before) && has(amounts(e.innerText), c.after));
    return el ? u.norm(el.innerText) : null;
  }, change);
  expect(line, `Records should show "${change.nickname}" with ${usd(change.before)} and ${usd(change.after)} on one line`).not.toBeNull();
  const olderDay = await page.evaluate(iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), SNAPSHOTS[0].takenAt);
  expect(await page.locator('#main').innerText(), 'The change should be dated against the record before it').toContain(olderDay);
});

test('plans that are closed stay listed in readable text with their specific reason', async ({ page }) => {
  await open(page);
  await visit(page, 'plans');
  // These loans total $28,101, all paid out before July 1, 2026: Extended needs more than $30,000 and Tiered Standard
  // a loan paid out on or after that date.
  expect(total(LOANS)).toBeLessThan(30000);
  const reasons = await page.evaluate(() => {
    const u = window.__ux;
    const heading = [...document.querySelectorAll('#main h2')].find(h => /not open to you/i.test(h.innerText));
    const card = heading?.parentElement;
    const item = (name, why) => {
      const els = card ? [...card.querySelectorAll('li, p, div')].filter(el => u.shown(el)) : [];
      const hits = els.filter(el => new RegExp(`(^|\\s)${name}\\b`).test(u.norm(el.innerText)) && why.test(el.innerText) && u.norm(el.innerText).length <= 400);
      const el = hits.find(e => !hits.some(o => o !== e && e.contains(o)));
      if (!el) return { name, text: null };
      const nodes = u.textNodes(el);
      return {
        name,
        text: u.norm(el.innerText),
        contrast: Math.min(...nodes.map(t => u.contrastOf(t.el))),
        opacity: Math.min(...nodes.map(t => u.opacityOf(t.el))),
      };
    };
    return [item('Extended', /more than \$30,000/), item('Tiered Standard', /July 1, 2026/)];
  });
  for (const r of reasons) {
    expect(r.text, `${r.name} should be listed as not open, with its reason`).not.toBeNull();
    expect(r.contrast, `${r.name}: "${short(r.text ?? '', 80)}" should keep 4.5:1 contrast`).toBeGreaterThanOrEqual(4.5);
    expect(r.opacity, `${r.name} should not be faded`).toBeGreaterThanOrEqual(0.99);
  }
});
