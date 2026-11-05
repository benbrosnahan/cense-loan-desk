// Resilience: what happens around the borrower's data when something goes a little wrong. Exports named for the
// wrong day, an Undo that forgets, half-typed loans, machine translation, a failed start-up, misread numbers and
// long names. Known issues assert the fixed behaviour; the tests at the end guard what the audit found sound.
import {
  test, expect, openApp, seed, goTo, stored, knownIssue, KEYS, LOANS, PROFILE, SNAPSHOTS, PHONE, DESKTOP,
} from './helpers.mjs';
import {
  addedLines, answerIfAsked, appears, compareWithControl, describeDifference, downloadName, inLoanRow, isolatedPage,
  loanRow, namesDate, pressUndo, pressUndoWhileOffered, settledBox, shownOrder, sidewaysScroll, toastText, translatePage,
  undoButtons, visibleReloadAdvice,
} from './support/resilience.mjs';

const PLAN_NAMES = { standard: 'Standard', graduated: 'Graduated', extended: 'Extended', ibr: 'IBR', tiered_standard: 'Tiered Standard', rap: 'RAP' };
const SMALL_PHONE = { width: 320, height: 640 };
/** Same fields and values, whatever order the keys were written in. */
const sameLoan = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
const idOf = nickname => LOANS.find(l => l.nickname === nickname).id;

test("RES-09 spreadsheet file names carry the borrower's local date", async ({ browser, baseURL }) => {
  knownIssue('RES-09');
  const problems = [];
  const check = (what, name, localDate) => {
    if (!namesDate(name, localDate)) problems.push(`${what} is named ${name}, but the borrower's date there is ${localDate}`);
  };
  const download = page => page.getByRole('button', { name: 'Download as a spreadsheet' });

  // An evening in New York is already tomorrow in UTC.
  const ny = await isolatedPage(browser, baseURL, { viewport: DESKTOP, timezoneId: 'America/New_York', open: false });
  await ny.page.clock.setFixedTime(new Date('2026-11-02T21:30:00-05:00'));
  await openApp(ny.page);
  check('The loans spreadsheet saved at 9:30 PM on Nov 2 in New York', await downloadName(ny.page, download(ny.page)), '2026-11-02');
  await goTo(ny.page, 'records');
  check('The records spreadsheet saved at 9:30 PM on Nov 2 in New York', await downloadName(ny.page, download(ny.page)), '2026-11-02');
  await ny.page.clock.setFixedTime(new Date('2026-12-31T20:00:00-05:00'));
  await goTo(ny.page, 'loans');
  check('The loans spreadsheet saved at 8 PM on Dec 31 in New York', await downloadName(ny.page, download(ny.page)), '2026-12-31');
  await ny.close();

  // A morning in Tokyo is still yesterday in UTC.
  const tokyo = await isolatedPage(browser, baseURL, { viewport: DESKTOP, timezoneId: 'Asia/Tokyo', open: false });
  await tokyo.page.clock.setFixedTime(new Date('2026-11-03T07:30:00+09:00'));
  await openApp(tokyo.page);
  check('The loans spreadsheet saved at 7:30 AM on Nov 3 in Tokyo', await downloadName(tokyo.page, download(tokyo.page)), '2026-11-03');
  await tokyo.close();

  expect(problems, problems.join('\n')).toEqual([]);
});

test('RES-10 one Undo brings back everything removed while it is offered', async ({ browser, baseURL }) => {
  knownIssue('RES-10');
  const problems = [];
  const fresh = () => isolatedPage(browser, baseURL, { viewport: DESKTOP });
  const loansNow = async page => (await stored(page, KEYS.loans)) ?? [];

  // Two loans removed in a row.
  {
    const { page, close } = await fresh();
    const order = await shownOrder(page);
    await inLoanRow(page, '2022–23 subsidized', 'Remove');
    await inLoanRow(page, '2023–24 subsidized', 'Remove');
    const presses = await pressUndoWhileOffered(page, async () => (await loansNow(page)).length < LOANS.length);
    const back = await loansNow(page);
    const missing = LOANS.filter(l => !back.some(b => sameLoan(b, l))).map(l => l.nickname);
    const shown = await shownOrder(page);
    if (missing.length) {
      problems.push(`Removing 2022–23 subsidized and then 2023–24 subsidized, then pressing Undo (${presses}x), brought back ${back.length} of ${LOANS.length} loans; still gone: ${missing.join(', ')}`);
    } else if (shown.join() !== order.join()) {
      const name = id => LOANS.find(l => l.id === id)?.nickname ?? id;
      problems.push(`After two removals and Undo the loans came back in a different order: ${shown.map(name).join(', ')}`);
    }
    await close();
  }

  // Saved records cleared, then every loan cleared.
  {
    const { page, close } = await fresh();
    const clearMyData = page.getByRole('button', { name: 'Clear my data' });
    const clearEveryLoan = page.getByRole('button', { name: 'Clear every loan' });
    await clearMyData.click();
    await page.getByRole('button', { name: 'Clear saved records' }).click();
    if (!(await appears(clearEveryLoan, 500))) await clearMyData.click();
    await clearEveryLoan.click();
    const counts = async () => [(await loansNow(page)).length, ((await stored(page, KEYS.snapshots)) ?? []).length];
    const presses = await pressUndoWhileOffered(page, async () => {
      const [loans, records] = await counts();
      return loans < LOANS.length || records < SNAPSHOTS.length;
    });
    const [loans, records] = await counts();
    if (loans < LOANS.length || records < SNAPSHOTS.length) {
      problems.push(`Clearing saved records and then every loan, then pressing Undo (${presses}x), brought back ${loans} of ${LOANS.length} loans and ${records} of ${SNAPSHOTS.length} saved records`);
    }
    await close();
  }

  // A loan removed, then a plan chosen: a message about a plan changes no loan, so it must not end the Undo.
  {
    const { page, close } = await fresh();
    await inLoanRow(page, '2022–23 subsidized', 'Remove');
    await goTo(page, 'plans');
    await page.getByRole('button', { name: /^Use .+ as my plan$/ }).first().click();
    const said = await toastText(page);
    const presses = await pressUndoWhileOffered(page, async () => (await loansNow(page)).length < LOANS.length);
    const back = (await loansNow(page)).length;
    if (back < LOANS.length) {
      problems.push(`Removing 2022–23 subsidized and then choosing a plan left the toast "${said}" ${presses ? `and Undo (${presses}x) brought back ${back} of ${LOANS.length} loans` : 'with no Undo'}, so the removed loan cannot be brought back`);
    }
    await close();
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

test('RES-11 a half-filled loan survives a section switch, a reload and Edit on another loan', async ({ page }) => {
  knownIssue('RES-11');
  await page.setViewportSize(PHONE);
  // Once the form is guarded a reload may ask "Leave site?": the borrower chooses to reload. Any other question
  // ("discard your changes?"), from the browser or the page, is answered the careful way, keep editing, except
  // right after the borrower taps Cancel.
  let discarding = false;
  page.on('dialog', dialog => (dialog.type() === 'beforeunload' || discarding ? dialog.accept() : dialog.dismiss()));
  await openApp(page);
  const problems = [];
  const addForm = page.getByRole('form', { name: 'Add a loan' });
  const addButton = page.getByRole('button', { name: 'Add a loan', exact: true });
  const valuesIn = async form => ({
    date: await form.getByLabel('Date it was paid out').inputValue(),
    balance: await form.getByLabel('What you owe on it today').inputValue(),
    rate: await form.getByLabel('Interest rate', { exact: true }).inputValue(),
  });
  const typed = { date: '2024-09-01', balance: '12,345.67', rate: '7.05' };
  const show = v => `date "${v.date}", balance "${v.balance}", rate "${v.rate}"`;
  const typeHalfALoan = async () => {
    if (!(await addForm.isVisible())) await addButton.click();
    await addForm.getByRole('button', { name: '2024–25' }).click();
    await addForm.getByLabel('What you owe on it today').fill('12345.67');
    await addForm.getByLabel('Interest rate', { exact: true }).fill('7.05');
  };
  // What the borrower finds: the form as it is, or what "Add a loan" brings back if it closed.
  const whatIsLeft = async () => {
    if (await appears(addForm, 1000)) return { how: 'the form is open', values: await valuesIn(addForm) };
    await addButton.click();
    return { how: 'the form had closed, and "Add a loan" opens it with', values: await valuesIn(addForm) };
  };

  const switchTo = async tab => {
    await goTo(page, tab);
    await answerIfAsked(page, 'keep');
  };

  await typeHalfALoan();
  await switchTo('plans');
  await switchTo('loans');
  let left = await whatIsLeft();
  if (!sameLoan(left.values, typed)) {
    problems.push(`Typed 2024–25, $12,345.67 and 7.05% into Add a loan without saving, then tapped Plans and Loans: ${left.how} ${show(left.values)}`);
  }

  await typeHalfALoan();
  await page.reload();
  await page.locator('#main').waitFor();
  left = await whatIsLeft();
  if (!sameLoan(left.values, typed)) {
    problems.push(`Typed the same loan again and reloaded: ${left.how} ${show(left.values)}`);
  }

  // The borrower closes the add form on purpose, then half-edits one loan and taps Edit on another.
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  discarding = true;
  if (await cancel.isVisible()) await cancel.click();
  await answerIfAsked(page, 'discard');
  discarding = false;
  const editForm = page.getByRole('form', { name: 'Edit this loan' });
  const editBalance = editForm.getByLabel('What you owe on it today');
  const balanceShown = async () => ((await appears(editBalance, 500)) ? editBalance.inputValue() : null);
  await inLoanRow(page, '2022–23 subsidized', 'Edit');
  await editBalance.fill('99999');
  const other = loanRow(page, '2023–24 subsidized');
  if ((await other.getAttribute('aria-expanded')) !== 'true') await other.click();
  const otherEdit = page.locator(`[id="${await other.getAttribute('aria-controls')}"]`).getByRole('button', { name: 'Edit', exact: true });
  // A fix may disable or hide Edit while another loan is open; that keeps the form too.
  if ((await otherEdit.isVisible()) && (await otherEdit.isEnabled())) await otherEdit.click();
  await answerIfAsked(page, 'keep');
  const said = await toastText(page);
  const nowShowing = await balanceShown();
  if (nowShowing !== '99,999') {
    // Some fixes keep a draft per loan instead of refusing the switch: then the first loan's figure comes back.
    await inLoanRow(page, '2022–23 subsidized', 'Edit');
    const reopened = await balanceShown();
    if (reopened !== '99,999') {
      const form = nowShowing === null ? 'the form closed' : `the form switched to ${nowShowing}`;
      problems.push(`Changed 2022–23 subsidized from 3,500 to 99,999 without saving, then tapped Edit on 2023–24 subsidized: ${form} ${said ? `with the message "${said}"` : 'with no message'}, and reopening 2022–23 subsidized shows ${reopened ?? 'no form'}`);
    }
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

test('RES-12 a translated page shows the same figures as the untranslated one and never crashes', async ({ browser, baseURL }) => {
  knownIssue('RES-12');
  const noExtra = { ...PROFILE, extraPerMonth: 0 };
  const scenarios = [
    {
      what: 'On Payoff, switching Standard to IBR in "Try a different repayment plan"',
      profile: noExtra,
      before: async p => {
        await goTo(p, 'payoff');
        await p.getByRole('button', { name: 'See how a different plan changes this' }).click();
      },
      act: p => p.getByLabel('Try a different repayment plan').selectOption('ibr'),
    },
    {
      what: 'On Payoff, tapping the $25 extra amount',
      profile: noExtra,
      before: p => goTo(p, 'payoff'),
      act: p => p.getByRole('group', { name: 'Common amounts' }).getByRole('button', { name: '$25', exact: true }).click(),
    },
    {
      what: 'On Plans, typing a yearly income of 30000',
      profile: { ...noExtra, income: 0, selectedPlan: null },
      before: p => goTo(p, 'plans'),
      act: p => p.getByLabel('Yearly income, before tax').pressSequentially('30000'),
      topPick: true,
    },
    {
      what: 'On Loans, removing a loan',
      profile: PROFILE,
      before: p => loanRow(p, '2022–23 subsidized').click(),
      act: p => p.getByRole('button', { name: 'Remove', exact: true }).click(),
    },
  ];

  const results = await Promise.all(scenarios.map(async sc => {
    const [control, translated] = await Promise.all([0, 1].map(() => isolatedPage(browser, baseURL, { viewport: PHONE, profile: sc.profile })));
    await Promise.all([sc.before(control.page), sc.before(translated.page)]);
    await translated.page.evaluate(translatePage);
    await Promise.all([sc.act(control.page), sc.act(translated.page)]);
    const difference = await compareWithControl(control.page, translated.page);
    let pick = '';
    if (sc.topPick && !difference?.crashed) {
      // The person reads the button and trusts it: it must save the plan it names.
      const button = translated.page.getByRole('button', { name: /^Use .+ as my plan$/ }).first();
      const label = (await button.innerText()).replace(/\s+/g, ' ').trim();
      await button.click();
      const saved = (await stored(translated.page, KEYS.profile))?.selectedPlan;
      if (label !== `Use ${PLAN_NAMES[saved]} as my plan`) pick = `its top pick button reads "${label}" but saved ${PLAN_NAMES[saved] ?? saved}`;
    }
    await Promise.all([control.close(), translated.close()]);
    return { what: sc.what, difference, pick };
  }));

  const wrong = results.filter(r => r.difference || r.pick);
  const lines = wrong.map(r => `${r.what}: ${[r.difference && describeDifference(r.difference), r.pick].filter(Boolean).join('; ')}`);
  expect(wrong.length, [
    `On a machine-translated page ${wrong.length} of ${results.length} actions left stale figures or crashed the app (compared with the same steps untranslated):`,
    ...lines,
  ].join('\n')).toBe(0);
});

test('RES-13 when the app cannot start, the borrower is told to reload', async ({ browser, baseURL }) => {
  knownIssue('RES-13');
  // The issue is about time: a fallback may wait a few seconds so a healthy load never shows it.
  const LIMIT_MS = 12_000;
  const runs = [{ label: 'default motion' }, { label: 'reduced motion', reducedMotion: 'reduce' }];
  const results = await Promise.all(runs.map(async run => {
    const { page, close } = await isolatedPage(browser, baseURL, { viewport: PHONE, reducedMotion: run.reducedMotion, open: false });
    await seed(page);
    await page.route('**/_next/static/chunks/**', route => route.abort());
    const start = Date.now();
    await page.goto('/');
    let advice = await page.evaluate(visibleReloadAdvice);
    while (!advice && Date.now() - start < LIMIT_MS) {
      await page.waitForTimeout(500);
      advice = await page.evaluate(visibleReloadAdvice);
    }
    const seconds = Math.round((Date.now() - start) / 1000);
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    const pulsing = await page.locator('.animate-pulse').count();
    await close();
    return { ...run, advice, seconds, text, pulsing };
  }));
  const silent = results.filter(r => !r.advice);
  expect(silent.length, silent.map(r => `With the app's script files failing to load (${r.label}), ${r.seconds}s after opening the page nothing on screen tells the borrower to reload: visible text "${r.text}", ${r.pulsing} pulsing placeholder bars`).join('\n')).toBe(0);
});

test('RES-14 the loan form asks the borrower to check implausible numbers and states the real rate rule', async ({ page }) => {
  knownIssue('RES-14');
  await page.setViewportSize(PHONE);
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const balance = form.getByLabel('What you owe on it today');
  const rate = form.getByLabel('Interest rate', { exact: true });
  const hintFor = field => field.evaluate(el => (el.getAttribute('aria-describedby') || '').split(/\s+/)
    .map(id => document.getElementById(id)?.innerText ?? '').join(' ').replace(/\s+/g, ' ').trim());
  // Any wording that asks the borrower to look again counts; so does reading the number the way they meant it.
  const asksToCheck = /\b(check|unusual|unlikely|did you mean|are you sure|is (this|that) (right|correct)|double|make sure|look again|(looks?|seems?) (off|wrong|low|high|unusual|small|large|too)|confirm|typo|mistake|verify)\b/i;
  const problems = [];

  // Grad PLUS has no published-rate line, so it is the quiet case.
  await form.getByRole('button', { name: '2025–26' }).click();
  await form.getByRole('radio', { name: 'Grad PLUS' }).click();
  await balance.fill('5000');
  await rate.fill('6.53');
  const plainRate = await form.innerText();
  await rate.fill('0.0653');
  const rateRead = await rate.inputValue();
  if (Number(rateRead) !== 6.53 && !addedLines(plainRate, await form.innerText()).some(l => asksToCheck.test(l))) {
    problems.push(`A Grad PLUS rate typed as 0.0653 (a decimal for 6.53%) is kept as ${rateRead}% under the same hint as 6.53, "${await hintFor(rate)}": nothing asks the borrower to check it`);
  }

  await balance.fill('2,256.40');
  const plainBalance = await form.innerText();
  await balance.fill('2.256,40');
  const balanceRead = await balance.inputValue();
  if (Number(balanceRead.replace(/,/g, '')) !== 2256.4 && !addedLines(plainBalance, await form.innerText()).some(l => asksToCheck.test(l))) {
    problems.push(`A balance pasted as 2.256,40 becomes ${balanceRead} under the same hint as 2,256.40, "${await hintFor(balance)}": nothing asks the borrower to check it`);
  }

  await balance.fill('5000');
  await rate.fill('6.53');
  const beforeZero = await form.innerText();
  await rate.fill('0');
  await rate.press('Tab');
  const zeroMessage = addedLines(beforeZero, await form.innerText()).join(' ').replace(/^!\s*/, '');
  const zeroRejected = (await rate.getAttribute('aria-invalid')) === 'true';
  if (zeroRejected && /\b(between|from)\s+0(\.0+)?\s*%?\s+(and|to)\b|(?<![\d.])0(\.0+)?\s*%?\s*(–|-|to)\s*25/i.test(zeroMessage)) {
    problems.push(`A rate of 0 is rejected with "${zeroMessage}", which says 0 is allowed`);
  }

  // The check must never block saving: the borrower may be right.
  await rate.fill('0.0653');
  await balance.fill('2.256,40');
  const shown = `rate ${await rate.inputValue()} and balance ${await balance.inputValue()}`;
  await form.getByRole('button', { name: 'Save loan' }).click();
  if (!(await appears(page.getByRole('heading', { name: 'Your loan' }), 2000)) || ((await stored(page, KEYS.loans)) ?? []).length !== 1) {
    problems.push(`Save loan with ${shown} did not save it: a check must never block saving`);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

/** Two loans, one of them dated after the cutoff and named `name`, and two snapshots, the second adding it. */
function longNameState(name) {
  const older = { id: 'r15-a', nickname: '2024–25 subsidized', servicer: 'MOHELA', kind: 'direct_sub', subsidy: 'subsidized', principal: 5500, balance: 5500, rate: 6.53, disbursementDate: '2024-09-01', minPayment: 0 };
  const named = { id: 'r15-b', nickname: name, servicer: 'MOHELA', kind: 'direct_unsub', subsidy: 'unsubsidized', principal: 4000, balance: 4000, rate: 6.52, disbursementDate: '2026-09-01', minPayment: 0 };
  return {
    loans: [older, named],
    profile: { ...PROFILE, selectedPlan: null },
    snapshots: [
      { takenAt: '2026-09-15T15:00:00.000Z', loans: [older], totalBalance: 5500 },
      { takenAt: '2026-10-15T15:00:00.000Z', loans: [older, named], totalBalance: 9500 },
    ],
  };
}

test('RES-15 a long loan name keeps Undo on screen and does not widen the page', async ({ page, browser, baseURL }) => {
  knownIssue('RES-15');
  const NAME = 'FedLoanServicingAccountNumber0123456789012345678901234567890';
  await page.setViewportSize(SMALL_PHONE);
  await openApp(page, longNameState(NAME));

  await inLoanRow(page, NAME, 'Remove');
  const undo = undoButtons(page).first();
  await undo.waitFor();
  const box = await settledBox(undo);
  const left = Math.round(box.x);
  const right = Math.round(box.x + box.width);
  const onScreen = Math.max(0, Math.min(right, SMALL_PHONE.width) - Math.max(left, 0));
  expect(left >= 0 && right <= SMALL_PHONE.width, `After removing a loan named "${NAME}" (${NAME.length} characters, no spaces) on a ${SMALL_PHONE.width}px-wide screen, the Undo button spans x ${left} to ${right}: ${onScreen} of its ${right - left}px are on screen, so a tap cannot reach it`).toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(loanRow(page, NAME), 'Tapping the middle of Undo did not bring the loan back').toBeVisible();

  // Sideways scroll where the name is printed, against the same loans under a short name.
  const baseline = await isolatedPage(browser, baseURL, { viewport: SMALL_PHONE, ...longNameState('2026–27 unsubsidized') });
  const widened = [];
  for (const tab of ['plans', 'payoff', 'records']) {
    await Promise.all([goTo(page, tab), goTo(baseline.page, tab)]);
    const [long, short] = await Promise.all([sidewaysScroll(page), sidewaysScroll(baseline.page)]);
    if (long > short + 1) widened.push(`${tab} scrolls ${long}px sideways against ${short}px with a short name`);
  }
  await baseline.close();
  expect(widened, `With that name at ${SMALL_PHONE.width}px: ${widened.join('; ')}`).toEqual([]);
});

// Regression guards: what the audit verified is sound and a fix nearby could break.

test('calendar dates and the July 1, 2026 cutoff do not shift with the time zone', async ({ browser, baseURL }) => {
  const loan = (id, nickname, disbursementDate) => ({ ...LOANS[6], id, nickname, disbursementDate });
  const loans = [loan('tz-1', 'Paid out June 30', '2026-06-30'), loan('tz-2', 'Paid out July 1', '2026-07-01')];
  for (const timezoneId of ['Pacific/Honolulu', 'Pacific/Kiritimati']) {
    const { page, close } = await isolatedPage(browser, baseURL, { viewport: DESKTOP, timezoneId, loans, snapshots: [] });
    const june = loanRow(page, 'Paid out June 30');
    const july = loanRow(page, 'Paid out July 1');
    await expect(june, `In ${timezoneId} the June 30 loan shows its own date`).toContainText('paid out Jun 30, 2026');
    await expect(june, `In ${timezoneId} the June 30 loan is before the cutoff`).not.toContainText('after Jul 1, 2026');
    await expect(july, `In ${timezoneId} the July 1 loan shows its own date`).toContainText('paid out Jul 1, 2026');
    await expect(july, `In ${timezoneId} the July 1 loan is on the cutoff`).toContainText('after Jul 1, 2026');
    await goTo(page, 'plans');
    await expect(page.getByText(/The loans? that did it:/), `In ${timezoneId} Plans names only the July 1 loan`).toHaveText('The loan that did it: Paid out July 1.');
    await close();
  }
});

test('Undo restores exactly what was removed and never rolls back a later save', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  // Remove one loan, then save an edit to another. If an Undo is still offered and brings the removed loan back, the
  // edit saved after the removal must stay. (An Undo that only reverses the save itself is fine.)
  await inLoanRow(page, '2022–23 subsidized', 'Remove');
  await inLoanRow(page, '2023–24 subsidized', 'Edit');
  const form = page.getByRole('form', { name: 'Edit this loan' });
  await form.getByLabel('What you owe on it today').fill('9999');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  const pressed = await pressUndo(page, 200);
  const loans = await stored(page, KEYS.loans);
  if (!pressed || loans.some(l => l.id === idOf('2022–23 subsidized'))) {
    const edited = loans.find(l => l.id === idOf('2023–24 subsidized'));
    expect(edited?.balance, pressed ? 'Undo brought the removed loan back and rolled back the edit saved after it' : 'The saved edit was not stored').toBe(9999);
  }

  // Clear every loan, then Undo: the same loans in the same order, and the saved records untouched.
  const before = await stored(page, KEYS.loans);
  await page.getByRole('button', { name: 'Clear my data' }).click();
  await page.getByRole('button', { name: 'Clear every loan' }).click();
  expect(await pressUndo(page), 'Clear every loan offered no Undo').toBe(true);
  await expect.poll(() => stored(page, KEYS.loans), { message: 'Undo after Clear every loan did not restore the loans exactly' }).toEqual(before);
  expect(await stored(page, KEYS.snapshots), 'Clear every loan and Undo touched the saved records').toEqual(SNAPSHOTS);
});

test('saving a loan without changing anything leaves the stored loans byte-identical', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openApp(page);
  const raw = () => page.evaluate(key => localStorage.getItem(key), KEYS.loans);
  const before = await raw();
  for (const name of ['2022–23 unsubsidized', '2025–26 subsidized']) {
    await inLoanRow(page, name, 'Edit');
    const form = page.getByRole('form', { name: 'Edit this loan' });
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(form).toHaveCount(0);
  }
  expect(await raw(), 'Opening a loan and saving it unchanged rewrote what is stored').toBe(before);
});

test('switching sections and answering plan questions on a translated page keeps every figure right', async ({ browser, baseURL }) => {
  const [control, translated] = await Promise.all([0, 1].map(() => isolatedPage(browser, baseURL, { viewport: PHONE })));
  const steps = [
    ['opening Plans', p => goTo(p, 'plans')],
    ['changing the yearly income to 38,000', p => p.getByLabel('Yearly income, before tax').fill('38000')],
    ['answering "Not sure" for employer', p => p.getByRole('radiogroup', { name: 'Who do you work for?' }).getByRole('radio', { name: 'Not sure' }).click()],
    ['opening Payoff', p => goTo(p, 'payoff')],
    ['opening Records', p => goTo(p, 'records')],
    ['saving a third snapshot', p => p.getByRole('button', { name: "Save today's snapshot" }).click()],
    ['going back to Loans', p => goTo(p, 'loans')],
  ];
  for (const [what, act] of steps) {
    // Translate whatever is on screen now, the way a translator keeps up with new content.
    await translated.page.evaluate(translatePage);
    await Promise.all([act(control.page), act(translated.page)]);
    const difference = await compareWithControl(control.page, translated.page);
    expect(difference && describeDifference(difference), `On a machine-translated page, ${what}`).toBeNull();
  }
  await Promise.all([control.close(), translated.close()]);
});

test('with JavaScript off the page says why, under the right title', async ({ browser, baseURL }) => {
  const { page, close } = await isolatedPage(browser, baseURL, { viewport: PHONE, javaScriptEnabled: false, open: false });
  await page.goto('/');
  // getByText skips <noscript>, so read the rendered text instead: innerText holds only what is laid out.
  expect(await page.locator('body').innerText(), 'With JavaScript off nothing on screen says the page needs it').toMatch(/JavaScript/);
  await expect(page).toHaveTitle(/Loan Desk/);
  await close();
});

test('the loan form rejects impossible values and cleans pasted money', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const balance = form.getByLabel('What you owe on it today');
  const rate = form.getByLabel('Interest rate', { exact: true });
  const save = form.getByRole('button', { name: 'Save loan' });
  const savedLoans = async () => (await stored(page, KEYS.loans)) ?? [];

  await form.getByRole('button', { name: '2025–26' }).click();
  await expect(rate, 'Picking 2025–26 fills in that year\'s published rate').toHaveValue('6.39');
  await balance.fill('$2,256.40');
  await expect(balance, 'A pasted "$2,256.40" is cleaned, not rejected').toHaveValue('2,256.40');

  for (const [field, value, what] of [[rate, '26', 'A rate over 25'], [balance, '0', 'A balance of 0'], [balance, '9'.repeat(400), 'A 400-digit balance']]) {
    await field.fill(value);
    await save.click();
    await expect(field, `${what} is flagged`).toHaveAttribute('aria-invalid', 'true');
    expect(await savedLoans(), `${what} was saved`).toHaveLength(0);
    await rate.fill('6.39');
    await balance.fill('$2,256.40');
  }

  await save.click();
  await expect.poll(savedLoans, { message: 'A valid loan was not saved' }).toHaveLength(1);
  const [loan] = await savedLoans();
  expect([loan.balance, loan.rate], 'The saved loan keeps the cleaned figures').toEqual([2256.4, 6.39]);
});
