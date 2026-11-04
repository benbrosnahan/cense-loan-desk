// Accessibility details: text contrast, Windows contrast themes, the toast, field names and units, control names,
// ID references, the heading outline and the payoff chart's hover box (A11Y-10 and A11Y-12 to A11Y-18), plus
// guards for what the audit found already works. A11Y-11 was dropped from the audit and has no test.
import {
  test, expect, knownIssue, openApp, goTo, sections, currentSection, stored, KEYS, LOANS, PROFILE, SNAPSHOTS, PHONE, DESKTOP,
} from './helpers.mjs';
import { SECTION_NAMES, loanRow, loanItem, within, hex, ratio } from './support/a11y.mjs';
import {
  textContrast, placeholderContrast, chartInk, quietShot, changedPixels, inkedColumns, tabOnto, axOf, axNodes, repeats,
  headingOutline, danglingRefs, openEveryDisclosure, eachState, focusUnderToast, pointOverControlUnderToast, markShown,
  hoverCover,
} from './support/a11y-details.mjs';

const SECTION_LABEL = { loans: 'Your loans', plans: 'Repayment plans', payoff: 'Payoff', records: 'Records' };
const quoted = list => list.map(s => `"${s}"`).join(', ');
const share = n => `${n >= 0.99 && n < 1 ? (Math.floor(n * 1000) / 10).toFixed(1) : Math.round(n * 100)}%`;

/** Findings as [detail, where] pairs, grouped by detail so a repeated defect reads as one line. */
function grouped(pairs) {
  const by = new Map();
  for (const [detail, where] of pairs) by.set(detail, [...(by.get(detail) ?? []), where]);
  return [...by].map(([detail, wheres]) => `${detail} (${wheres.join('; ')})`);
}

test('A11Y-10 the saved-records count in the section bar and the hints in empty loan fields read at 4.5:1, at rest, on hover and after a failed save', async ({ page }) => {
  knownIssue('A11Y-10');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const faint = [];
  let checks = 0;
  const note = (pairs, where) => {
    for (const p of pairs) {
      if (p.disabled) continue;
      checks++;
      if (p.ratio < p.need) faint.push([`"${p.text}" in the section bar is ${p.fg} on ${p.bg}, ${ratio(p.ratio)}`, where]);
    }
  };
  await page.setViewportSize(PHONE);
  await openApp(page);
  for (const size of [PHONE, DESKTOP]) {
    await page.setViewportSize(size);
    for (const tab of ['loans', 'plans', 'payoff', 'records']) {
      await goTo(page, tab);
      await page.mouse.move(0, 0);
      note(await textContrast(sections(page)), `${SECTION_LABEL[tab]} at ${size.width}px at rest`);
      await sections(page).getByRole('button', { name: SECTION_NAMES.records }).hover();
      note(await textContrast(sections(page)), `${SECTION_LABEL[tab]} at ${size.width}px with the pointer on Records`);
    }
  }

  await goTo(page, 'loans');
  await page.getByRole('button', { name: 'Add a loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  for (const when of ['before saving', 'after a failed save']) {
    if (when !== 'before saving') {
      await form.getByRole('button', { name: 'Save loan', exact: true }).click();
      await expect(form.getByLabel(/^What you owe on it today/)).toHaveAttribute('aria-invalid', 'true');
    }
    for (const p of await placeholderContrast(form)) {
      checks++;
      if (p.ratio < 4.5) faint.push([`the "${p.placeholder}" hint inside "${p.field}" is ${p.fg} on ${p.bg}, ${ratio(p.ratio)}`, `${when}${p.invalid ? ', field marked invalid' : ''}`]);
    }
  }
  expect(grouped(faint), `${faint.length} of ${checks} text checks fall below the 4.5:1 that WCAG 1.4.3 requires for text this size, so a low-vision borrower may not read how many records they saved or what a field expects: ${grouped(faint).join('; ')}`).toEqual([]);
});

test('A11Y-12 under Windows contrast themes the chosen answer, preset, school year and open section look chosen, the slider shows its track and the chart stays readable', async ({ page }) => {
  knownIssue('A11Y-12');
  await page.setViewportSize({ width: 1024, height: 800 });
  await openApp(page);
  const problems = [];
  let checks = 0;
  /** Shoots one control unchosen, chooses it, checks it took, shoots it again: the two must differ visibly. */
  const chooses = async (theme, what, control, choose, took) => {
    const before = await quietShot(page, control);
    await choose();
    await took();
    const after = await quietShot(page, control);
    const d = changedPixels(before, after);
    checks++;
    // Any visible mark will do, down to a small dot or tick: 30 pixels changing by 3:1. Today none change at all.
    if (d.strong < 30) problems.push(`${theme}: ${what} looks the same chosen as unchosen (${d.strong} of ${d.total} pixels change by 3:1, ${d.changed} change at all)`);
  };
  /** Chooses an option that is not chosen yet: the first, or the last with `last` (a preset other than None keeps both chart lines). */
  const pickFrom = async (theme, what, list, attribute, { last = false } = {}) => {
    const off = await list.evaluateAll((els, a) => els.map((e, i) => (e.getAttribute(a) === 'true' ? -1 : i)).filter(i => i >= 0), attribute);
    const option = list.nth(last ? off.at(-1) : off[0]);
    const name = (await option.innerText()).split('\n')[0].trim();
    await chooses(theme, `${what} "${name}"`, option, () => option.click(), () => expect(option).toHaveAttribute(attribute, 'true'));
  };

  for (const scheme of ['dark', 'light']) {
    const theme = `${scheme} theme`;
    await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme, reducedMotion: 'reduce' });
    await goTo(page, 'loans');
    const plansTab = sections(page).getByRole('button', { name: SECTION_NAMES.plans });
    await chooses(theme, 'the open section, Repayment plans, in the section bar', plansTab, () => goTo(page, 'plans'), () => expect(plansTab).toHaveAttribute('aria-current', 'page'));
    await pickFrom(theme, 'the goal', page.getByRole('radiogroup', { name: 'What matters most to you?' }).getByRole('radio'), 'aria-checked');

    await goTo(page, 'payoff');
    const chart = page.locator('figure').getByRole('img').first();
    await expect(chart).toBeVisible();
    const ink = await chartInk(chart);
    checks += 2;
    const faintLines = ink.lines.filter(l => l.ratio < 3);
    if (faintLines.length) problems.push(`${theme}: the chart's ${faintLines.map(l => `${l.dash === 'none' ? 'solid' : 'dashed'} balance line is ${l.color}`).join(' and ')} on ${ink.background}, ${ratio(Math.min(...faintLines.map(l => l.ratio)))}`);
    const dim = ink.labels.filter(l => l.ratio < 4.5);
    if (dim.length) problems.push(`${theme}: the chart's labels ${quoted(dim.map(l => l.text))} are ${dim[0].color} on ${ink.background}, ${ratio(Math.min(...dim.map(l => l.ratio)))}`);

    const slider = page.getByRole('slider', { name: /^Extra each month/ });
    const at = Number(await slider.inputValue()) / Number((await slider.getAttribute('max')) || 100);
    const [from, to] = at <= 0.5 ? [0.6, 0.92] : [0.08, 0.4];
    const track = inkedColumns(await quietShot(page, slider, { pad: 0 }), from, to);
    checks++;
    if (track.inked < track.columns * 0.9) problems.push(`${theme}: the extra-payment slider shows no track, only its thumb: ${track.inked} of ${track.columns} columns across its empty end hold anything at 3:1 against ${hex(track.background)}`);
    await pickFrom(theme, 'the preset', page.getByRole('group', { name: 'Common amounts' }).getByRole('button'), 'aria-pressed', { last: true });
    await pickFrom(theme, 'the payoff order', page.getByRole('radiogroup', { name: 'Payoff order' }).getByRole('radio'), 'aria-checked');

    await goTo(page, 'loans');
    await page.getByRole('button', { name: 'Add a loan' }).click();
    await pickFrom(theme, 'the school year', page.getByRole('group', { name: 'Which school year was it for?' }).getByRole('button'), 'aria-pressed');
    await page.getByRole('button', { name: 'Cancel' }).click();
  }
  expect(problems, `With a Windows contrast theme on, ${problems.length} of ${checks} checks fail, so a borrower who needs high contrast cannot tell what they picked, where they are or what the slider and chart show: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-13 the toast never hides the control a keyboard user is on, lets taps reach what is under it, and Undo still works by tap', async ({ page }) => {
  knownIssue('A11Y-13');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const problems = [];

  // A plain "Saved" toast over the next loan's form, on a short phone screen.
  await page.setViewportSize({ width: 390, height: 664 });
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByRole('button', { name: '2024–25', exact: true }).click();
  await page.getByLabel(/^What you owe on it today/).fill('12000');
  await page.getByRole('button', { name: 'Save and add another' }).click();
  const spot = await within(1000, () => pointOverControlUnderToast(page, /\bsaved\b/));
  if (spot) {
    await page.mouse.click(spot.x, spot.y);
    const tap = await page.evaluate(() => window.__auditTap);
    if (spot.onToast || !tap?.reached) {
      problems.push(`at 390x664 a tap at (${spot.x}, ${spot.y}) on "${spot.control}", under the "${spot.toast}" toast, lands on the toast (pointer-events ${spot.pointerEvents}) and never reaches the control`);
    }
  }

  // Tabbing toward Undo after Remove, the last stop on the page, on a tall phone and at the 400% zoom reference.
  await openApp(page);
  for (const [size, { nickname }] of [[{ width: 390, height: 960 }, LOANS[5]], [{ width: 320, height: 256 }, LOANS[2]]]) {
    await page.setViewportSize(size);
    const where = `${size.width}x${size.height}`;
    await loanRow(page, nickname).press('Enter');
    await loanItem(page, nickname).getByRole('button', { name: 'Remove' }).press('Enter');
    await expect(loanRow(page, nickname)).toHaveCount(0);
    const hidden = [];
    let stop = null;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      stop = await focusUnderToast(page);
      if (stop.gone || stop.body || stop.inToast) break;
      if (stop.covered >= 0.99) hidden.push(`"${stop.name}" (${share(stop.covered)} of it under the toast)`);
    }
    if (hidden.length) problems.push(`at ${where}, tabbing toward Undo after removing "${nickname}" puts focus on ${hidden.join(' and ')}`);

    const undo = page.getByRole('button', { name: /^undo\b/i });
    const box = (await undo.count()) ? await undo.boundingBox() : null;
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      if (!(await within(3000, () => loanRow(page, nickname).count()))) problems.push(`at ${where} a tap on Undo does not bring "${nickname}" back`);
    }
  }
  expect(problems, `The toast gets in the way in ${problems.length} places, hiding the control a keyboard user is on or eating a tap: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-14 money and rate fields say their unit, field names read as words, required and optional fields say which they are, the slider speaks dollars and keeps a typed $2,000, and a rate typed as 0.0653 is not saved silently', async ({ page }) => {
  knownIssue('A11Y-14');
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  const problems = [];
  const UNIT = { dollars: /\$|\bdollars?\b|\bUSD\b/i, percent: /%|\bper ?cent\b/i };
  const noUnit = [];
  const hasUnit = async (field, unit, when) => {
    const ax = await axOf(field);
    if (!UNIT[unit].test(`${ax.name} ${ax.description}`)) noUnit.push(`"${ax.name}" ${when} (description "${ax.description}")`);
  };

  // Payoff: the typed extra amount and the slider beside it.
  await goTo(page, 'payoff');
  const extra = page.getByRole('textbox', { name: /^Extra each month/ });
  const slider = page.getByRole('slider', { name: /^Extra each month/ });
  await hasUnit(extra, 'dollars', 'on Payoff');
  // What the slider says: aria-valuetext when set (Chromium's DevTools tree does not show it), else its number.
  const sliderSays = async () => {
    const ax = await axOf(slider);
    const valuetext = await slider.getAttribute('aria-valuetext');
    return { name: ax.name, text: valuetext ?? String(ax.value ?? ''), value: Number(ax.value), max: ax.props.valuemax };
  };
  const resting = await sliderSays();
  if (/\bslider\b/i.test(resting.name)) problems.push(`the slider is named "${resting.name}", so a screen reader says "slider" twice`);
  if (!UNIT.dollars.test(resting.text)) problems.push(`the slider speaks its value as "${resting.text}", with no dollars`);
  await extra.fill('2000');
  const typed = await sliderSays();
  if (!/\b2,?000\b/.test(typed.text) && typed.value !== 2000) problems.push(`after typing 2,000 in Extra each month the slider still says "${typed.text}" (its maximum is ${typed.max})`);
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  const nudged = Number((await extra.inputValue()).replace(/[^\d.]/g, ''));
  if (!(nudged >= 1900 && nudged <= 2000)) problems.push(`one ArrowLeft on the slider then turns $2,000 into $${nudged.toLocaleString('en-US')}`);

  await goTo(page, 'plans');
  await hasUnit(page.getByRole('textbox', { name: /^Yearly income/ }), 'dollars', 'on Plans');

  // The add form: units, names and required state, blank, after an empty save and once a school year fills the rate.
  await goTo(page, 'loans');
  await page.getByRole('button', { name: 'Add a loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  await form.getByRole('button', { name: 'Add more detail' }).click();
  const field = {
    date: form.getByLabel(/^Date it was paid out/),
    balance: form.getByLabel(/^What you owe on it today/),
    rate: form.getByLabel(/^Interest rate/),
    servicer: form.getByLabel(/^Who do you pay/),
    name: form.getByLabel(/^Name/),
    principal: form.getByLabel(/^Amount you first borrowed/),
    minimum: form.getByLabel(/^Minimum monthly payment/),
  };
  const jammed = [];
  for (const locator of Object.values(field)) {
    const { name } = await axOf(locator);
    if (/[a-z]optional\b/i.test(name)) jammed.push(name);
  }
  if (jammed.length) problems.push(`field names run "optional" into the label: ${quoted(jammed)}`);
  const unmarked = [];
  for (const key of ['date', 'balance', 'rate']) {
    if (!(await field[key].evaluate(el => el.required || el.getAttribute('aria-required') === 'true'))) unmarked.push((await axOf(field[key])).name);
  }
  if (unmarked.length) problems.push(`the required fields ${quoted(unmarked)} expose no required state (no required or aria-required)`);
  // The fields a borrower may skip: once some say "optional", all of them must.
  const skippable = [];
  for (const key of ['servicer', 'name', 'principal', 'minimum']) {
    const ax = await axOf(field[key]);
    skippable.push({ name: ax.name.replace(/\s*\(?optional\)?$/i, ''), says: /optional/i.test(`${ax.name} ${ax.description}`) });
  }
  const [marked, bare] = [skippable.filter(f => f.says), skippable.filter(f => !f.says)];
  if (marked.length && bare.length) problems.push(`${quoted(bare.map(f => f.name))} can be left blank but is not marked optional, unlike ${quoted(marked.map(f => f.name))}`);
  for (const key of ['balance', 'principal', 'minimum']) await hasUnit(field[key], 'dollars', 'with the form blank');
  await hasUnit(field.rate, 'percent', 'with the form blank');
  await form.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(field.balance).toHaveAttribute('aria-invalid', 'true');
  await hasUnit(field.balance, 'dollars', 'after an empty save');
  await hasUnit(field.rate, 'percent', 'after an empty save');
  await form.getByRole('button', { name: '2024–25', exact: true }).click();
  await hasUnit(field.rate, 'percent', 'once 2024–25 fills it');
  if (noUnit.length) problems.push(`the $ and % beside the fields are hidden from screen readers and nothing replaces them: ${noUnit.join(', ')}`);

  // A Grad PLUS rate typed as a fraction (no published-rate hint covers Grad PLUS). Any of these says a word or
  // puts it right: a changed description or alert on the field, a dialog, a refusal with a message, a corrected
  // value, or a saved-toast that questions the rate.
  await form.getByRole('radio', { name: /^Grad PLUS/ }).click();
  await field.balance.fill('12000');
  const said = async () => {
    const { description } = await axOf(field.rate);
    const spoken = [];
    for (const role of ['alert', 'alertdialog', 'dialog']) {
      const found = page.getByRole(role);
      for (let i = 0; i < (await found.count()); i++) if (await found.nth(i).isVisible()) spoken.push(await found.nth(i).innerText());
    }
    return [description, ...spoken.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)].join(' | ');
  };
  await field.rate.fill('6.53');
  await field.rate.press('Tab');
  const plain = await said();
  await field.rate.fill('0.0653');
  await field.rate.press('Tab');
  const reads = await field.rate.inputValue();
  const reacted = (await said()) !== plain;
  await form.getByRole('button', { name: 'Save loan', exact: true }).click();
  // Waits for the save to land or for the form to answer, whichever comes first.
  const newLoan = async () => ((await stored(page, KEYS.loans)) ?? []).find(l => !LOANS.some(o => o.id === l.id)) ?? null;
  const settled = await within(3000, async () => (await newLoan()) || ((await form.count()) && (await said()) !== plain));
  const added = await newLoan();
  const refusedWithWord = !added && !!settled && (await form.count()) > 0;
  const toastAsked = /percent|fraction|did you mean|too low|very low/i.test((await page.getByRole('status').allInnerTexts()).join(' '));
  if (!(Number(reads) === 6.53 || added?.rate === 6.53 || reacted || refusedWithWord || toastAsked)) {
    const row = added && (await loanRow(page, added.nickname).count()) ? await loanRow(page, added.nickname).innerText() : '';
    problems.push(`a Grad PLUS rate typed as 0.0653 ${added ? `is saved as ${added.rate}%${row.match(/[\d.]+%/) ? ` (its row reads ${row.match(/[\d.]+%/)[0]})` : ''}` : 'is refused'} with the same description and alerts as 6.53 ("${plain}"), so nobody is told it reads as a fraction of a percent`);
  }
  expect(problems, `Screen-reader borrowers and form-filling agents are left guessing in ${problems.length} ways: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-15 every button on Plans has a name of its own, the recommendation can be found by name, and section names stay the same at every width and after a snapshot', async ({ page }) => {
  knownIssue('A11Y-15');
  await page.setViewportSize(DESKTOP);
  await openApp(page, { profile: { ...PROFILE, selectedPlan: null } });
  const problems = [];
  const sectionNames = async () => {
    const buttons = sections(page).getByRole('button');
    const names = [];
    for (let i = 0; i < (await buttons.count()); i++) names.push((await axOf(buttons.nth(i))).name);
    return names;
  };
  const buttonNames = async () => (await axNodes(page)).filter(n => n.role === 'button').map(n => n.name);

  const wide = await sectionNames();
  await goTo(page, 'plans');
  let twice = repeats(await buttonNames());
  if (twice.length) problems.push(`on Plans with no plan chosen, the page's buttons include ${twice.join(', ')}`);
  await openEveryDisclosure(page);
  twice = repeats(await buttonNames());
  if (twice.length) problems.push(`with every plan's detail open: ${twice.join(', ')}`);
  const named = /recommend|where we would start|top pick|best fit/i;
  if (!(await page.getByRole('region', { name: named }).or(page.getByRole('heading', { name: named })).count())) {
    const heading = await page.evaluate(() => {
      const eyebrow = [...document.querySelectorAll('#main p')].find(p => /where we would start/i.test(p.textContent));
      return eyebrow?.parentElement?.querySelector('h1, h2, h3, h4')?.textContent.trim() ?? '';
    });
    problems.push(`the recommendation has no name of its own: no region or heading names it${heading ? ` (its heading reads "${heading}")` : ''}`);
  }

  await page.setViewportSize(PHONE);
  const narrow = await sectionNames();
  if (wide.join('|') !== narrow.join('|')) problems.push(`the section buttons are named ${quoted(wide)} at 1440px but ${quoted(narrow)} at 375px`);
  await goTo(page, 'records');
  const before = await sectionNames();
  await page.getByRole('button', { name: /^Save today.s snapshot$/ }).click();
  await expect.poll(async () => (await stored(page, KEYS.snapshots))?.length).toBe(SNAPSHOTS.length + 1);
  const after = await sectionNames();
  const renamed = before.map((n, i) => (n === after[i] ? null : `"${n}" to "${after[i]}"`)).filter(Boolean);
  if (renamed.length) problems.push(`saving a snapshot renames ${renamed.join(', ')}`);
  expect(problems, `A borrower listing controls by name, or an agent finding them by name, cannot tell them apart in ${problems.length} ways: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-16 every aria-controls on a loan row, plan card or disclosure points at an element on the page, open or closed', async ({ page }) => {
  knownIssue('A11Y-16');
  await page.setViewportSize(DESKTOP);
  const dangling = [];
  let states = 0;
  await eachState(page, async state => {
    states++;
    const refs = await danglingRefs(page, ['aria-controls']);
    if (refs.length) dangling.push(`${state}: ${refs.length} (${quoted(refs.map(r => r.on))})`);
  }, { openAll: true });
  expect(dangling, `aria-controls names an element that is not on the page in ${dangling.length} of ${states} states, so a screen reader's jump to the controlled panel has nothing to land on: ${dangling.join('; ')}`).toEqual([]);
});

test('A11Y-17 headings never skip a level, the first-run h1 says what the page is for, the recommended plan\'s heading says it is the recommendation, and each saved record has a heading', async ({ page }) => {
  knownIssue('A11Y-17');
  await page.setViewportSize(DESKTOP);
  const problems = [];
  await eachState(page, async state => {
    const outline = await headingOutline(page);
    for (let i = 1; i < outline.length; i++) {
      const [prev, cur] = [outline[i - 1], outline[i]];
      if (cur.level > prev.level + 1) problems.push(`${state}: h${prev.level} "${prev.text}" is followed by h${cur.level} "${cur.text}"`);
    }
    if (state === 'first run') {
      const h1 = outline.filter(h => h.level === 1);
      if (h1.length === 1 && (/^(cense\s*)?loan desk$/i.test(h1[0].text) || !/\bloans?\b/i.test(h1[0].text))) {
        const headline = outline.find(h => h.level > 1);
        problems.push(`on first run the page's h1 is the app's name "${h1[0].text}"${headline ? `, while the headline "${headline.text}" is an h${headline.level}` : ''}`);
      }
    }
    if (state === 'Repayment plans' && !outline.some(h => /recommend|where we would start|top pick|best fit|our pick/i.test(h.text))) {
      const twice = repeats(outline.filter(h => h.afterNav).map(h => h.text));
      problems.push(`on Repayment plans no heading says which plan is the recommendation${twice.length ? `: its heading gives only the plan's name, so the headings repeat ${twice.join(', ')}` : ''}`);
    }
    if (state === 'Records') {
      const [title, ...rest] = outline.filter(h => h.afterNav);
      const named = rest.filter(h => /\d/.test(h.text));
      if (named.length < SNAPSHOTS.length) problems.push(`Records lists ${SNAPSHOTS.length} saved records under the h${title?.level} "${title?.text}" with ${named.length ? `only ${named.length} headings naming one` : 'no heading for any of them'}, so a screen-reader user cannot move from record to record`);
    }
  });
  expect(problems, `Moving by heading loses the borrower ${problems.length} times: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-18 Escape dismisses the payoff chart\'s hover box without moving the pointer, and the chart\'s table has a name', async ({ page }) => {
  knownIssue('A11Y-18');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  await goTo(page, 'payoff');
  const figure = page.locator('figure').filter({ has: page.getByRole('img') });
  const chart = figure.getByRole('img').first();
  await expect(chart).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await markShown(figure);
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.09, box.y + box.height / 2);
  const problems = [];
  const hovering = await within(1000, async () => {
    const c = await hoverCover(figure);
    return c.added ? c : null;
  });
  if (hovering?.covers.length) {
    await page.keyboard.press('Escape');
    const left = (await within(1000, async () => {
      const c = await hoverCover(figure);
      return c.covers.length ? null : c;
    })) ?? (await hoverCover(figure));
    if (left.covers.length) problems.push(`with the pointer resting at 9% of the chart's width the hover box covers ${hovering.covers.join(', ')}, and after Escape it still covers ${left.covers.join(', ')}, so a magnifier user has to move the pointer away to read them (WCAG 1.4.13)`);
  }
  await figure.getByRole('button', { name: /table/i }).press('Enter');
  const table = figure.getByRole('table');
  await expect(table).toBeVisible();
  const { name } = await axOf(table);
  if (!name) problems.push(`the table under "See these numbers as a table" has no name: no caption, aria-label or aria-labelledby`);
  expect(problems, `The payoff chart's extras fall short in ${problems.length} ways: ${problems.join('; ')}`).toEqual([]);
});

// ---------- Guards: what the audit found already works ----------

test('in every state each control has a name, every label and description reference points at an element, and there is exactly one h1', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const CONTROLS = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'slider', 'spinbutton', 'radio', 'checkbox', 'switch', 'tab', 'menuitem', 'Date', 'DateTime', 'InputTime']);
  const problems = [];
  let states = 0;
  await eachState(page, async state => {
    states++;
    const unnamed = (await axNodes(page)).filter(n => CONTROLS.has(n.role) && !n.name).map(n => n.role);
    if (unnamed.length) problems.push(`${state}: ${unnamed.length} control(s) with no name (${unnamed.join(', ')})`);
    const refs = await danglingRefs(page, ['for', 'aria-describedby', 'aria-labelledby', 'aria-errormessage', 'aria-details', 'aria-activedescendant', 'aria-owns', 'aria-flowto']);
    if (refs.length) problems.push(`${state}: ${refs.map(r => `${r.attribute} on "${r.on}" names #${r.missing.join(' #')}, which is not on the page`).join(', ')}`);
    const h1 = (await headingOutline(page)).filter(h => h.level === 1);
    if (h1.length !== 1) problems.push(`${state}: ${h1.length} h1 headings (${quoted(h1.map(h => h.text))})`);
  }, { openAll: true });
  expect(problems, `Names, references or the h1 broke in ${problems.length} places across ${states} states: ${problems.join('; ')}`).toEqual([]);
});

test('text on first run, after an empty save and in every section reads at 4.5:1, or 3:1 when large, at phone and desktop widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const faint = [];
  let checks = 0;
  const sweep = async state => {
    for (const size of [PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      await page.mouse.move(0, 0);
      // The section bar's records count is A11Y-10's.
      for (const p of await textContrast(page.locator('body'))) {
        if (p.disabled || p.countInBar) continue;
        checks++;
        if (p.ratio < p.need) faint.push(`${state} at ${size.width}px: "${p.text}" ${p.fg} on ${p.bg}, ${ratio(p.ratio)} (needs ${p.need}:1)`);
      }
    }
  };
  await openApp(page, { seeded: false });
  await sweep('first run');
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(page.getByLabel('Date it was paid out')).toHaveAttribute('aria-invalid', 'true');
  await sweep('the first-run form after an empty save');
  await openApp(page);
  await sweep(SECTION_LABEL.loans);
  for (const tab of ['plans', 'payoff', 'records']) {
    await goTo(page, tab);
    await sweep(SECTION_LABEL[tab]);
  }
  expect(checks, 'the sweep read the text on the page').toBeGreaterThan(300);
  expect(faint, `${faint.length} of ${checks} runs of text fall below WCAG 1.4.3: ${faint.join('; ')}`).toEqual([]);
});

test('keyboard focus stays visible on section tabs, the chosen answer, fields, presets and the slider, in normal colours and under both contrast themes', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openApp(page);
  const faint = [];
  let checks = 0;
  const targets = {
    plans: () => [
      ['the open section tab', currentSection(page)],
      ['the Payoff section tab', sections(page).getByRole('button', { name: SECTION_NAMES.payoff })],
      ['the chosen goal', page.getByRole('radiogroup', { name: 'What matters most to you?' }).getByRole('radio', { checked: true })],
      ['the income field', page.getByRole('textbox', { name: /^Yearly income/ })],
    ],
    payoff: () => [
      ['the extra-payment field', page.getByRole('textbox', { name: /^Extra each month/ })],
      ['the extra-payment slider', page.getByRole('slider', { name: /^Extra each month/ })],
      ['the pressed preset', page.getByRole('group', { name: 'Common amounts' }).getByRole('button', { pressed: true })],
    ],
  };
  for (const scheme of [null, 'dark', 'light']) {
    const mode = scheme ? `the ${scheme} contrast theme` : 'normal colours';
    await page.emulateMedia(scheme ? { forcedColors: 'active', colorScheme: scheme, reducedMotion: 'reduce' } : { forcedColors: 'none', colorScheme: 'light', reducedMotion: 'reduce' });
    for (const tab of ['plans', 'payoff']) {
      await goTo(page, tab);
      for (const [what, control] of targets[tab]()) {
        checks++;
        const before = await quietShot(page, control, { pad: 6 });
        if (!(await tabOnto(page, control))) {
          faint.push(`${mode}: Tab does not reach ${what}`);
          continue;
        }
        const d = changedPixels(before, await quietShot(page, control, { pad: 6, blur: false }));
        if (d.strong < 100) faint.push(`${mode}: focus on ${what} changes ${d.strong} pixels by 3:1 (${d.changed} at all)`);
      }
    }
  }
  expect(faint, `Keyboard focus is hard to see in ${faint.length} of ${checks} checks: ${faint.join('; ')}`).toEqual([]);
});

test('the payoff chart\'s two lines stand out at 3:1 and differ by dash as well as colour, its name gives both finish dates, and its table has column and row headers', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  await goTo(page, 'payoff');
  const figure = page.locator('figure').filter({ has: page.getByRole('img') });
  const chart = figure.getByRole('img').first();
  await expect(chart).toBeVisible();
  const ink = await chartInk(chart);
  expect(ink.lines.map(l => l.dash === 'none' ? 'solid' : 'dashed').sort(), 'with $100 extra the chart draws a solid line and a dashed required-only line').toEqual(['dashed', 'solid']);
  for (const l of ink.lines) expect(l.ratio, `the ${l.dash === 'none' ? 'solid' : 'dashed'} line is ${l.color} on ${ink.background}`).toBeGreaterThanOrEqual(3);
  const { name } = await axOf(chart);
  expect(name.match(/\b[A-Z][a-z]{2,8} \d{4}\b/g) ?? [], `the chart's name gives both finish dates: "${name}"`).toHaveLength(2);
  await figure.getByRole('button', { name: /table/i }).press('Enter');
  const table = figure.getByRole('table');
  await expect(table.getByRole('columnheader'), 'When, With extra and Required only are column headers').toHaveCount(3);
  const rows = (await table.getByRole('row').count()) - 1;
  expect(rows, 'the table has a row per year').toBeGreaterThan(2);
  await expect(table.getByRole('rowheader'), 'each row is headed by its date').toHaveCount(rows);
});
