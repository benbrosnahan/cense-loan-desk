// Accessibility: reflow, announcements, focus, timing, keyboard patterns and non-text contrast (A11Y-01 to A11Y-08),
// plus guards for what the audit found already works.
import AxeBuilder from '@axe-core/playwright';
import {
  test, expect, knownIssue, openApp, goTo, settle, sections, currentSection, stored, KEYS, LOANS, PROFILE, PHONE, DESKTOP,
} from './helpers.mjs';
import {
  SECTION_NAMES, loanRow, loanItem, within, focusedElement, focusAfterAction, tabTo, listen, liveLog, announcement,
  contrast, hex, ratio, fieldEdges, bestEdge, decodePng,
} from './support/a11y.mjs';

const SECTION_LABEL = { loans: 'Your loans', plans: 'Repayment plans', payoff: 'Payoff', records: 'Records' };
const SHORT_LABEL = { loans: 'Loans', plans: 'Plans', payoff: 'Payoff', records: 'Records' };
const loanCount = n => (n === 1 ? 'Your loan' : `Your ${n} loans`);

test('A11Y-01 from 320 to 360 CSS px wide every section fits the screen and the hide-amounts button stays in view', async ({ page }) => {
  knownIssue('A11Y-01');
  await page.setViewportSize({ width: 320, height: 640 });
  await openApp(page);
  const toggle = page.getByRole('button', { name: 'Hide dollar amounts' });
  const problems = [];
  let checks = 0;
  for (const tab of ['loans', 'plans', 'payoff', 'records']) {
    await page.setViewportSize({ width: 320, height: 640 });
    if (tab !== 'loans') await goTo(page, tab);
    for (const width of [320, 340, 359, 360]) {
      await page.setViewportSize({ width, height: 640 });
      checks++;
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      const box = (await toggle.count())
        ? await toggle.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left + scrollX), right: Math.round(r.right + scrollX) };
        })
        : null;
      const cut = !box ? 'Hide dollar amounts button missing' : box.right > client || box.left < 0 ? `button at x ${box.left}-${box.right}` : '';
      if (scroll > client || cut) problems.push(`${SECTION_LABEL[tab]} at ${width}px ${scroll > client ? `+${scroll - client}px` : 'fits'}${cut ? `, ${cut}` : ''}`);
    }
  }
  expect(problems, `The page scrolls sideways and cuts off the Hide dollar amounts button in ${problems.length} of ${checks} section and width checks (WCAG 1.4.10 asks for no sideways scrolling at 320px): ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-02 removing a loan and pressing Undo are each announced through a live region already on the page', async ({ page }) => {
  knownIssue('A11Y-02');
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  const { nickname } = LOANS[0];
  await loanRow(page, nickname).press('Enter');
  await listen(page);
  await loanItem(page, nickname).getByRole('button', { name: 'Remove' }).press('Enter');
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length - 1) })).toBeVisible();
  const removal = await announcement(page, t => t.includes(nickname) || /\b(remov|delet)/i.test(t));
  const log = await liveLog(page);
  expect(removal, `Removing "${nickname}" is never announced: its message arrived in a live region inserted already holding "${log.insertedWithText.join(' | ')}" (${log.before} live region${log.before === 1 ? '' : 's'} on the page beforehand), which NVDA and JAWS skip; nothing was written into an existing region`).toBeTruthy();

  const from = (await liveLog(page)).heard.length;
  await page.getByRole('button', { name: /^undo\b/i }).press('Enter');
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length) })).toBeVisible();
  const restore = await announcement(page, t => !/\b(remov|delet)/i.test(t), { from });
  expect(restore, `Undo brings "${nickname}" back in silence: no live region changed after Undo (everything announced so far: ${JSON.stringify((await liveLog(page)).heard)})`).toBeTruthy();
});

test('A11Y-03 after Next cards, saving or cancelling an edit, Remove, Undo, Clear and the first-run buttons, keyboard focus lands on a nearby control', async ({ page }) => {
  knownIssue('A11Y-03');
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  const problems = [];
  let actions = 0;
  const record = (what, problem) => {
    actions++;
    if (problem) problems.push(`${what}: ${problem}`);
  };
  const lostOr = (f, otherwise) => (f.body ? 'focus fell to <body>' : otherwise);

  // The three Next cards, which swap the section out from under the focused card.
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  for (const [title, to] of [['See which repayment plans you can use', 'plans'], ['See your debt-free date', 'payoff'], ['Save a dated record', 'records']]) {
    await page.getByRole('button', { name: new RegExp(title) }).press('Enter');
    await expect(currentSection(page)).toContainText(SHORT_LABEL[to]);
    await settle(page);
    const f = await focusAfterAction(page);
    let problem = lostOr(f, null);
    if (!problem) {
      await page.keyboard.press('Tab');
      const next = await focusedElement(page);
      if (!next.inContent) problem = `focus went to ${f.text} and the next Tab to ${next.text}, outside the ${SECTION_LABEL[to]} section`;
    }
    record(`Enter on "${title}"`, problem);
  }

  // Editing, removing and undoing on a phone, where losing your place also means losing sight of the loan.
  await page.setViewportSize(PHONE);
  await goTo(page, 'loans');
  const last = LOANS.at(-1).nickname;
  await loanRow(page, last).press('Enter');
  await loanItem(page, last).getByRole('button', { name: 'Edit' }).press('Enter');
  await page.getByLabel('What you owe on it today').fill('2,200');
  await page.getByRole('button', { name: 'Save changes' }).press('Enter');
  await expect(loanRow(page, last)).toContainText('$2,200');
  let f = await focusAfterAction(page);
  const edited = await loanItem(page, last).evaluate(li => {
    const r = li.querySelector('button').getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="Sections"]')?.getBoundingClientRect();
    return { holds: li.contains(document.activeElement), top: Math.round(r.top), bottom: Math.round(r.bottom), floor: Math.round(Math.max(0, nav?.bottom ?? 0)), height: innerHeight };
  });
  const inView = edited.top >= edited.floor - 1 && edited.bottom <= edited.height + 1;
  record(`"Save changes" after editing "${last}"`, edited.holds && inView ? null
    : `${lostOr(f, edited.holds ? 'focus is on the edited loan' : `focus went to ${f.text}, not the edited loan`)}${inView ? '' : `; the edited row is off screen (top ${edited.top}px in a ${edited.height}px window)`}`);

  const second = LOANS[1].nickname;
  await loanRow(page, second).press('Enter');
  await loanItem(page, second).getByRole('button', { name: 'Edit' }).press('Enter');
  await page.getByRole('button', { name: 'Cancel' }).press('Enter');
  f = await focusAfterAction(page);
  const holds = await loanItem(page, second).evaluate(li => li.contains(document.activeElement));
  record(`Cancel while editing "${second}"`, holds ? null : lostOr(f, `focus went to ${f.text}, not the loan being edited`));

  const third = LOANS[2].nickname;
  await loanRow(page, third).press('Enter');
  await loanItem(page, third).getByRole('button', { name: 'Remove' }).press('Enter');
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length - 1) })).toBeVisible();
  f = await focusAfterAction(page);
  record(`Remove on "${third}"`, lostOr(f, null));

  await page.getByRole('button', { name: /^undo\b/i }).press('Enter');
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length) })).toBeVisible();
  f = await focusAfterAction(page);
  record('Undo on the toast', lostOr(f, null));

  await page.getByRole('button', { name: 'Clear my data' }).press('Enter');
  await page.getByRole('button', { name: 'Clear every loan' }).press('Enter');
  // A fix may ask first, natively (accepted above) or in the page.
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
  const addFirst = page.getByRole('button', { name: 'Add my first loan' });
  await expect(addFirst.or(confirm).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: /\b(yes|clear|delete|erase|confirm)\b/i }).first().press('Enter');
  await expect(addFirst).toBeVisible();
  f = await focusAfterAction(page);
  record('Clear every loan', lostOr(f, null));

  // First run.
  await addFirst.press('Enter');
  await page.getByRole('button', { name: 'Cancel' }).press('Enter');
  await expect(addFirst).toBeVisible();
  f = await focusAfterAction(page);
  record('Cancel on the first-run form', lostOr(f, null));

  await page.getByRole('button', { name: 'Look around with example loans' }).press('Enter');
  await expect(sections(page)).toBeVisible();
  f = await focusAfterAction(page);
  record('"Look around with example loans"', lostOr(f, null));

  expect(problems, `Keyboard focus is lost after ${problems.length} of ${actions} actions, so the next Tab starts over instead of continuing from the result: ${problems.join('; ')}`).toEqual([]);
});

test('A11Y-04 a keyboard user pressing Tab once a second can reach Undo after removing a loan and get the loan back', async ({ page }) => {
  knownIssue('A11Y-04');
  let asked = null;
  page.on('dialog', dialog => {
    asked = dialog.message();
    dialog.dismiss().catch(() => {});
  });
  await page.clock.install();
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  const { nickname } = LOANS[0];
  await loanRow(page, nickname).press('Enter');
  await loanItem(page, nickname).getByRole('button', { name: 'Remove' }).press('Enter');
  if (asked !== null) {
    // A fix may ask before removing. Answering no must keep the loan.
    await expect(page.getByRole('heading', { name: loanCount(LOANS.length) })).toBeVisible();
    return;
  }
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length - 1) })).toBeVisible();
  const undo = () => page.evaluate(() => {
    const button = [...document.querySelectorAll('button')]
      .find(b => /^(undo|restore)\b/i.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
    return !button ? 'gone' : button === document.activeElement ? 'focused' : 'shown';
  });
  let seconds = 0;
  let state = await undo();
  while (state === 'shown' && seconds < 40) {
    await page.keyboard.press('Tab');
    await page.clock.runFor(1000);
    seconds++;
    state = await undo();
  }
  const f = await focusedElement(page);
  const left = (await stored(page, KEYS.loans))?.length;
  expect(state, `Undo disappeared within ${seconds} s of Remove, while a keyboard user pressing Tab once a second was still on its way (focus on ${f.text}); "${nickname}" stays removed, ${left} of ${LOANS.length} loans stored, with no other way back`).toBe('focused');
  await page.clock.runFor(2000);
  expect(await undo(), 'Undo is still there two seconds after the keyboard reached it').toBe('focused');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: loanCount(LOANS.length) })).toBeVisible();
  expect((await stored(page, KEYS.loans))?.length).toBe(LOANS.length);
});

test('A11Y-05 switching sections tells a screen-reader user which section is now shown', async ({ page }) => {
  knownIssue('A11Y-05');
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  await listen(page);
  const named = { plans: /\bplans?\b/i, payoff: /\bpay ?off\b/i, records: /\brecords?\b/i, loans: /\bloans?\b/i };
  for (const tab of ['plans', 'payoff', 'records', 'loans']) {
    const from = (await liveLog(page)).heard.length;
    await sections(page).getByRole('button', { name: SECTION_NAMES[tab] }).press('Enter');
    await expect(currentSection(page)).toContainText(SHORT_LABEL[tab]);
    // Either a live message names the section, or focus moves to a heading or named region in it.
    const told = await within(1000, async () => {
      const said = (await liveLog(page)).heard.slice(from).find(t => named[tab].test(t));
      if (said) return said;
      return page.evaluate(() => {
        const el = document.activeElement;
        const nav = document.querySelector('nav[aria-label="Sections"]');
        if (!el || el === document.body || !nav || nav.contains(el)) return null;
        if (!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return null;
        const heading = /^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading';
        return heading || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ? `focus on ${el.tagName}` : null;
      });
    });
    const f = await focusedElement(page);
    const heard = (await liveLog(page)).heard.slice(from);
    expect(told, `Switching to ${SECTION_LABEL[tab]} tells a screen-reader user nothing: focus stays on ${f.text} and no live region named the section within 1 s (announced: ${heard.length ? heard.map(t => `"${t}"`).join(', ') : 'nothing'})`).toBeTruthy();
  }
});

test('A11Y-06 each radio group is one Tab stop and the arrow keys move the answer, wrapping at both ends', async ({ page }) => {
  knownIssue('A11Y-06');
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  await goTo(page, 'plans');
  const group = name => page.getByRole('radiogroup', { name }).or(page.getByRole('group', { name })).first();
  const groupState = g => g.evaluate(el => {
    const radios = [...el.querySelectorAll('[role="radio"], input[type="radio"]')];
    const label = r => (r.getAttribute('aria-label') || r.labels?.[0]?.innerText || r.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      names: radios.map(label),
      focus: radios.indexOf(document.activeElement),
      checked: radios.findIndex(r => r.getAttribute('aria-checked') === 'true' || r.checked === true),
      scrollY: Math.round(scrollY),
    };
  });
  const arrows = async (name, keys) => {
    const g = group(name);
    let s = await groupState(g);
    await g.locator('[role="radio"], input[type="radio"]').nth(Math.max(0, s.checked)).focus();
    await settle(page);
    s = await groupState(g);
    for (const [key, step] of keys) {
      const was = s;
      const want = (was.focus + step + was.names.length) % was.names.length;
      await page.keyboard.press(key);
      await settle(page);
      s = await groupState(g);
      const now = s.focus < 0 ? (await focusedElement(page)).text : `"${s.names[s.focus]}"`;
      const scrolled = s.scrollY !== was.scrollY ? `, and the page scrolled ${s.scrollY - was.scrollY}px instead` : '';
      expect(s.focus === want && s.checked === want, `${key} in "${name}" does not change the answer: from "${was.names[was.focus]}" focus is on ${now} and the answer is "${s.names[s.checked]}", expected "${s.names[want]}"${scrolled}`).toBe(true);
    }
  };
  await arrows('What matters most to you?', [['ArrowDown', 1], ['ArrowRight', 1], ['ArrowDown', 1], ['ArrowUp', -1], ['ArrowLeft', -1]]);

  // From the section bar to the income field: one stop per question.
  await sections(page).getByRole('button', { name: SECTION_NAMES.records }).focus();
  const income = page.getByLabel('Yearly income, before tax');
  const stops = [];
  for (let i = 0; i < 40 && !(await income.evaluate(el => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      return { radio: el?.getAttribute('role') === 'radio' || (el?.tagName === 'INPUT' && el.type === 'radio'), text: (el?.innerText || '').trim() };
    });
    if (f.radio) stops.push(f.text);
  }
  expect(stops.length, `Tab stops on ${stops.length} radio options between the section bar and the income field (${stops.join(', ')}); the two questions should be one stop each`).toBe(2);

  await arrows('Who do you work for?', [['ArrowRight', 1], ['ArrowLeft', -1]]);
  await goTo(page, 'payoff');
  await arrows('Payoff order', [['ArrowDown', 1], ['ArrowDown', 1]]);
  await goTo(page, 'loans');
  await page.getByRole('button', { name: 'Add a loan' }).click();
  await arrows('Loan type', [['ArrowRight', 1], ['ArrowLeft', -1], ['ArrowLeft', -1]]);
});

test('A11Y-07 every text field and select has an outline of at least 3:1 at rest and on hover', async ({ page }) => {
  knownIssue('A11Y-07');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  const results = [];
  const measure = async (label, field) => {
    await field.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(1, 1);
    const rest = bestEdge(await fieldEdges(field));
    await field.hover();
    const hover = bestEdge(await fieldEdges(field));
    await page.mouse.move(1, 1);
    results.push({ label, rest, hover });
  };
  await page.getByRole('button', { name: 'Add a loan' }).click();
  await page.getByRole('button', { name: 'Add more detail' }).click();
  // The optional fields' labels end in "optional", so they are matched from the start.
  await measure('Name', page.getByLabel(/^Name/));
  for (const label of ['Date it was paid out', 'What you owe on it today', 'Interest rate', 'Who do you pay?', 'Amount you first borrowed', 'Minimum monthly payment']) {
    await measure(label, page.getByLabel(new RegExp(`^${label.replace('?', '\\?')}`)));
  }
  await goTo(page, 'plans');
  for (const label of ['Yearly income, before tax', 'People in your household']) await measure(label, page.getByLabel(label, { exact: true }));
  await goTo(page, 'payoff');
  await measure('Extra each month', page.getByLabel('Extra each month', { exact: true }));
  await page.getByRole('button', { name: 'See how a different plan changes this' }).click();
  await measure('Try a different repayment plan', page.getByLabel('Try a different repayment plan', { exact: true }));

  const faint = results.flatMap(({ label, rest, hover }) => [['at rest', rest], ['on hover', hover]]
    .filter(([, e]) => e.ratio < 3)
    .map(([state, e]) => `${label} ${ratio(e.ratio)} ${state} (${e.what.replace(/^border-\w+$/, 'border')} ${hex(e.color)} on ${hex(e.against)})`));
  expect(faint, `Field outlines are below the 3:1 a low-vision borrower needs to find the field (WCAG 1.4.11) in ${faint.length} of ${results.length * 2} checks: ${faint.join('; ')}`).toEqual([]);
});

test.describe('slider at 3x', () => {
  test.use({ deviceScaleFactor: 3 });

  test('A11Y-08 at $0 the Payoff slider shows a track of at least 3:1 against its panel', async ({ page }) => {
    knownIssue('A11Y-08');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(PHONE);
    await openApp(page, { profile: { ...PROFILE, extraPerMonth: 0, selectedPlan: 'standard' } });
    await goTo(page, 'payoff');
    const slider = page.getByRole('slider', { name: /^Extra each month/ });
    await expect(slider).toHaveValue('0');
    await slider.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    const panel = (await fieldEdges(slider)).inside;
    const png = decodePng(await slider.screenshot({ animations: 'disabled' }));
    // The right end of the track, clear of the thumb that sits at the left at $0.
    let worst = null;
    for (let x = Math.round(png.width * 0.7); x <= Math.round(png.width * 0.92); x++) {
      let best = { ratio: 1, rgb: panel };
      for (let y = 0; y < png.height; y++) {
        const rgb = png.pixel(x, y);
        const r = contrast(rgb, panel);
        if (r > best.ratio) best = { ratio: r, rgb };
      }
      if (!worst || best.ratio < worst.ratio) worst = best;
    }
    expect(worst.ratio, `At $0 the slider's track is ${ratio(worst.ratio)} against its panel (strongest pixel ${hex(worst.rgb)} on ${hex(panel)}), so a low-vision borrower sees a lone circle with no track; WCAG 1.4.11 needs 3:1`).toBeGreaterThanOrEqual(3);
  });
});

// ---------- Guards: what the audit found already works ----------

test('axe finds no WCAG 2.2 A or AA violation on first run, form errors or any section', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PHONE);
  const found = [];
  const scan = async state => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    for (const v of violations) found.push(`${state}: ${v.id} on ${v.nodes.length} element(s), ${v.help}`);
  };
  await openApp(page, { seeded: false });
  await scan('first run');
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByRole('button', { name: 'Save loan' }).click();
  await expect(page.getByLabel('Date it was paid out')).toHaveAttribute('aria-invalid', 'true');
  await scan('form errors');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  await loanRow(page, 'Freshman subsidized').click();
  await page.getByRole('button', { name: 'Clear my data' }).click();
  await scan('Your loans, a row and Clear my data open');
  for (const tab of ['plans', 'payoff', 'records']) {
    await goTo(page, tab);
    await scan(SECTION_LABEL[tab]);
  }
  expect(found, `axe reports WCAG violations: ${found.join('; ')}`).toEqual([]);
});

test('the core journey works by keyboard alone: add a loan, choose a plan, set an extra payment, save a record', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openApp(page, { seeded: false });
  const reach = async (target, what) => expect(await tabTo(page, target), `Tab reaches ${what}`).toBeGreaterThan(0);
  const start = page.getByRole('button', { name: 'Add my first loan' });
  await reach(start, '"Add my first loan"');
  await page.keyboard.press('Enter');
  const year = page.getByRole('button', { name: '2025–26', exact: true });
  await reach(year, 'the 2025–26 school year');
  await page.keyboard.press('Enter');
  await reach(page.getByLabel('What you owe on it today'), 'the balance field');
  await page.keyboard.type('5500');
  await reach(page.getByRole('button', { name: 'Save loan', exact: true }), '"Save loan"');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your loan', exact: true })).toBeVisible();

  await reach(page.getByRole('button', { name: /See which repayment plans you can use/ }), 'the Plans card');
  await page.keyboard.press('Enter');
  await reach(page.getByRole('button', { name: /^Use .+ as my plan$/ }).first(), 'the top pick');
  await page.keyboard.press('Enter');
  await reach(page.getByRole('button', { name: /See your debt-free date/ }), 'the Payoff card');
  await page.keyboard.press('Enter');
  const slider = page.getByRole('slider', { name: /^Extra each month/ });
  await reach(slider, 'the extra-payment slider');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('20');
  await reach(page.getByRole('button', { name: /Save a dated record/ }), 'the Records card');
  await page.keyboard.press('Enter');
  await reach(page.getByRole('button', { name: /^Save today.s snapshot$/ }), 'the snapshot button');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await stored(page, KEYS.snapshots))?.length).toBe(1);
  const loans = await stored(page, KEYS.loans);
  const profile = await stored(page, KEYS.profile);
  expect(loans.map(l => l.balance)).toEqual([5500]);
  expect(profile.selectedPlan, 'a plan was chosen').toBeTruthy();
  expect(profile.extraPerMonth).toBe(4 * 5);
});

test('a failed save puts focus on the first problem, ties each message to its field, and Save and add another returns to the form', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).press('Enter');
  const heading = page.getByRole('heading', { name: 'Add a loan' });
  await expect(heading).toBeFocused();
  await page.getByRole('button', { name: 'Save loan', exact: true }).press('Enter');
  const date = page.getByLabel('Date it was paid out');
  await expect(date).toBeFocused();
  for (const [label, message] of [
    ['Date it was paid out', /school year/i],
    ['What you owe on it today', /what you owe/i],
    ['Interest rate', /interest rate/i],
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await expect(field, `${label} is marked invalid`).toHaveAttribute('aria-invalid', 'true');
    await expect(field, `${label} is described by its message`).toHaveAccessibleDescription(message);
    await expect(page.getByRole('alert').filter({ hasText: message }), `${label}'s message is announced`).toHaveCount(1);
  }
  await page.getByRole('button', { name: '2025–26', exact: true }).press('Enter');
  await page.getByLabel('What you owe on it today').fill('5500');
  await page.getByRole('button', { name: 'Save and add another' }).press('Enter');
  await expect(heading).toBeFocused();
  await expect(date).not.toHaveAttribute('aria-invalid', 'true');
});

test('the sticky section bar never covers the focused control, even at 320x256', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await openApp(page);
  const covered = [];
  let stops = 0;
  for (const tab of ['loans', 'plans']) {
    await goTo(page, tab);
    await page.evaluate(() => {
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        let bar = document.querySelector('nav[aria-label="Sections"]');
        while (bar && getComputedStyle(bar).position !== 'sticky') bar = bar.parentElement;
        const r = el.getBoundingClientRect();
        const b = bar?.getBoundingClientRect();
        const under = !!b && !bar.contains(el) && r.top < b.bottom - 1 && r.bottom > b.top + 1;
        const away = r.bottom <= 0 || r.top >= innerHeight;
        const name = (el.getAttribute('aria-label') || el.innerText || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
        return { name, problem: under ? `under the bar (top ${Math.round(r.top)}, bar ends ${Math.round(b.bottom)})` : away ? `off screen (top ${Math.round(r.top)})` : '' };
      });
      if (!s) break;
      stops++;
      if (s.problem) covered.push(`${SECTION_LABEL[tab]}: "${s.name}" ${s.problem}`);
    }
  }
  expect(stops, 'the Tab walk visits the page').toBeGreaterThan(20);
  expect(covered, `Focus is hidden at ${covered.length} of ${stops} Tab stops: ${covered.join('; ')}`).toEqual([]);
});

test('the extra-payment slider works from the keyboard and its spoken summary waits for the value to settle', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openApp(page, { profile: { ...PROFILE, extraPerMonth: 0, selectedPlan: 'standard' } });
  await goTo(page, 'payoff');
  const slider = page.getByRole('slider', { name: /^Extra each month/ });
  await slider.focus();
  for (const [key, value] of [['ArrowRight', '5'], ['PageUp', '55'], ['End', '500'], ['PageDown', '450'], ['Home', '0']]) {
    await page.keyboard.press(key);
    await expect(slider, `${key} moves the slider`).toHaveValue(value);
  }
  await expect(page.getByLabel('Extra each month', { exact: true })).toHaveValue('');
  await listen(page);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('50');
  await expect(page.getByLabel('Extra each month', { exact: true })).toHaveValue('50');
  const said = await announcement(page, t => /\$50\b/.test(t), { ms: 2000 });
  expect(said, 'the payoff summary is announced once the slider settles').toBeTruthy();
  await page.waitForTimeout(300);
  // One today; two allows for a stall between key presses on a loaded machine. Chatter would be ten.
  const { heard } = await liveLog(page);
  expect(heard.length, `ten key presses are spoken once, not each time: ${JSON.stringify(heard)}`).toBeLessThanOrEqual(2);
});

test('at phone and 200% zoom widths (375, 384, 640 and 720 CSS px) no state scrolls sideways', async ({ page }) => {
  const widths = [375, 384, 640, 720];
  const wide = [];
  const sweep = async state => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      if (scroll > client) wide.push(`${state} at ${width}px +${scroll - client}px`);
    }
  };
  await page.setViewportSize({ width: 375, height: 800 });
  await openApp(page, { seeded: false });
  await sweep('first run');
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  await sweep(SECTION_LABEL.loans);
  for (const tab of ['plans', 'payoff', 'records']) {
    await page.setViewportSize({ width: 375, height: 800 });
    await goTo(page, tab);
    await sweep(SECTION_LABEL[tab]);
  }
  expect(wide, `The page scrolls sideways: ${wide.join('; ')}`).toEqual([]);
});
