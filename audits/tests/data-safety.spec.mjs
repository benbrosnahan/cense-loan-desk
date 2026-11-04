// Data safety: what a borrower enters is kept, or the page says plainly that it was not, and what the page says
// about where data lives is true. Known issues RES-01 to RES-08 from audits/ROADMAP.md come first, then regression
// guards for behaviour the audit verified.
import { test, expect, knownIssue, openApp, seed, goTo, sections, stored, KEYS, LOANS, PROFILE, PHONE } from './helpers.mjs';
import {
  appData, rawData, balances, usd, openRow, addLoan, statusTexts, visibleLines, toastLines, textOf, pageStart,
  appSettled, refuseWrites, blockStorage, switchTab, firstVisitData, leftovers, eraseEverything, announced,
  liveTexts, inViewLines, countWrites, clickAndRead, short, RESTORE, NOT_SAVING, DEVICE_CLAIM, OTHER_PLACE, UNREADABLE, FAILED,
} from './support/data-safety.mjs';

test('RES-01 edits typed over the example loans are still there after adding a loan of your own', async ({ page }) => {
  knownIssue('RES-01');
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Look around with example loans' }).click();

  // The first-run card invites this: start with the examples and swap in your own numbers later.
  // One edit is a balance; the other changes only who services the loan.
  const edits = {
    'Freshman subsidized': loan => loan.balance === 1234,
    'Sophomore unsubsidized': loan => loan.servicer === 'Aidvantage',
  };
  await openRow(page, 'Freshman subsidized');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('What you owe on it today').fill('1234');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await openRow(page, 'Sophomore unsubsidized');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Who do you pay?').selectOption('Aidvantage');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const edited = async () => {
    const loans = (await appData(page)).loans ?? [];
    return Object.keys(edits).filter(name => loans.some(l => l?.nickname === name && edits[name](l)));
  };
  await expect.poll(async () => (await edited()).length).toBe(2);
  expect(await visibleLines(page, /\bexamples?\b/i), 'After two example loans were edited, nothing marks the other six as examples any more').not.toEqual([]);

  await page.getByRole('button', { name: 'Add a loan' }).click();
  await addLoan(page, { year: '2025–26', balance: 7777 });
  await expect.poll(() => balances(page)).toContain(7777);

  const kept = await edited();
  const after = ((await appData(page)).loans ?? []).map(l => `${l.nickname}, ${l.servicer}, ${usd(l.balance)}`);
  const said = (await statusTexts(page)).join(' | ') || 'nothing';
  const undo = await page.getByRole('status').getByRole('button', { name: 'Undo' }).count();
  expect(kept, `Edits typed over the example loans (balance $1,234 on Freshman subsidized, servicer Aidvantage on Sophomore unsubsidized) were deleted when a $7,777 loan was added: ${kept.length} of 2 kept, stored now ${JSON.stringify(after)}, and the page said "${said}" ${undo ? 'with' : 'with no'} Undo`).toEqual(Object.keys(edits));

  await page.reload();
  await page.locator('#main').waitFor();
  await expect(page.getByRole('button', { name: /\$1,234/ }), 'The edited loan should still be listed after a reload').toHaveCount(1);
});

test('RES-02 a loan saved in one tab survives a change made in another tab that was already open', async ({ page }) => {
  knownIssue('RES-02');
  const a = page;
  await openApp(a);
  const b = await a.context().newPage();
  await b.goto('/');
  await b.locator('#main').waitFor();

  await switchTab(b, a);
  await a.getByRole('button', { name: 'Add a loan' }).click();
  await addLoan(a, { year: '2025–26', balance: 7777 });
  await expect.poll(() => balances(a)).toContain(7777);
  const savedByA = await rawData(a);

  // Back to the other tab, without reloading it, to remove a different loan.
  await switchTab(a, b);
  await openRow(b, '2022–23 subsidized');
  await b.getByRole('button', { name: 'Remove', exact: true }).click();
  // Let tab B's save land, if it makes one.
  await b.waitForFunction(([key, before]) => localStorage.getItem(key) !== before, [KEYS.loans, savedByA.loans], { timeout: 2000 }).catch(() => {});

  const after = await balances(a);
  const bSaid = (await statusTexts(b)).join(' | ') || 'nothing';
  expect(after, `Tab A saved a $7,777 loan (${LOANS.length + 1} stored). Tab B, open since before, then removed "2022–23 subsidized", and storage now holds ${after.length} loans without A's: ${JSON.stringify(after)}. Tab B said only "${bSaid}"`).toContain(7777);

  await a.reload();
  await a.locator('#main').waitFor();
  await expect(a.getByRole('button', { name: /\$7,777/ }), "Tab A's loan should still be listed after a reload").toHaveCount(1);

  // While an income is typed into tab A one key at a time, tab B must not write back what it only read: a late
  // write-back lands on top of a newer keystroke and rolls it back (52,000 becoming 5,200 moves RAP from $217 to $10).
  await countWrites(b);
  await switchTab(b, a);
  await goTo(a, 'plans');
  const income = a.getByLabel('Yearly income, before tax');
  await income.fill('');
  await income.pressSequentially('61250', { delay: 40 });
  await expect.poll(async () => (await appData(a)).profile?.income).toBe(61250);
  await b.waitForFunction(() => (window.__appWrites ?? 0) > 0, null, { timeout: 750 }).catch(() => {});
  const writes = await b.evaluate(() => window.__appWrites ?? 0);
  expect(writes, `While 61250 was typed in tab A, tab B wrote its copy back ${writes} times`).toBe(0);
});

test('RES-03 when the browser refuses to save, the page never says "Saved" and keeps a warning on screen', async ({ page }) => {
  knownIssue('RES-03');
  await refuseWrites(page);
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const liveBefore = new Set(await liveTexts(page));
  await addLoan(page, { year: '2025–26', balance: 7000 });
  await expect(page.getByRole('heading', { name: 'Your loan', exact: true })).toBeVisible();

  const said = await statusTexts(page);
  const kept = await rawData(page);
  const warnings = await visibleLines(page, NOT_SAVING);
  expect(said.filter(text => /^saved\b/i.test(text)), `The browser refused every write (${KEYS.loans} holds ${kept.loans}), yet the page announced ${JSON.stringify(said)} and showed ${warnings.length} warnings that nothing is being kept`).toEqual([]);
  // At the moment of saving, the borrower hears or sees that the loan was not kept, not only somewhere off screen.
  const toldNow = [
    ...(await liveTexts(page)).filter(text => !liveBefore.has(text) && NOT_SAVING.test(text)),
    ...(await inViewLines(page, NOT_SAVING)),
  ];
  expect(toldNow, `Saving gave no sign in view or in a new announcement that the loan was not kept (live regions: ${JSON.stringify(await liveTexts(page))})`).not.toEqual([]);

  // Another action replaces the save message. A warning that the loan is not being kept must still be on screen.
  await goTo(page, 'plans');
  await page.getByRole('button', { name: /^Use .+ as my plan$/ }).first().click();
  const toast = new Set(await toastLines(page));
  const lasting = (await visibleLines(page, NOT_SAVING)).filter(line => !toast.has(line));
  expect(lasting, `Once the save message is replaced, nothing on screen says this browser is not keeping the loan (toast now ${JSON.stringify([...toast])})`).not.toEqual([]);
});

test('RES-04 after "Clear my data" nothing of the borrower is left for the next person on that browser', async ({ page, browser }) => {
  knownIssue('RES-04');
  const fresh = await firstVisitData(browser);
  await openApp(page); // 8 loans, income 52,000 and other answers, 2 dated records
  // The borrower last saved a MOHELA loan and left another loan's edit form open.
  await openRow(page, '2024–25 subsidized');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await openRow(page, '2022–23 subsidized');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await eraseEverything(page);
  await expect.poll(async () => (await appData(page)).loans?.length ?? 0).toBe(0);

  const left = leftovers(await appData(page), fresh);
  expect(left, `After "Clear my data", this browser still holds ${left.join('; ')}`).toEqual([]);

  // The next person, in the same tab: no loan of the earlier borrower reopens, and their servicer is not preselected.
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  const reopened = await page.getByRole('heading', { name: 'Edit this loan' }).count();
  const form = reopened ? await page.getByLabel('What you owe on it today').inputValue() : '';
  expect(reopened, `The erased loan's edit form reopens for the next person (balance ${form}), and saving it would write it back`).toBe(0);
  await page.getByRole('button', { name: 'Add a loan' }).click();
  expect(await page.getByLabel('Who do you pay?').inputValue(), "The next person's new loan form preselects the earlier borrower's servicer").toBe('Not sure yet');

  // And after a reload: none of the earlier borrower's records, plan or income show.
  await page.reload();
  await page.locator('#main').waitFor();
  const recordsTab = await textOf(sections(page).getByRole('button', { name: /^Records/ }));
  const summary = await textOf(page.getByRole('region', { name: 'Summary' }));
  await goTo(page, 'plans');
  const income = await page.getByLabel('Yearly income, before tax').inputValue();
  expect({ recordsTab, summary, income }, "The next person sees the earlier borrower's records, plan or income")
    .toEqual({ recordsTab: 'Records', summary: expect.not.stringMatching(/a month on/), income: '' });
});

test('RES-05 after the browser drops its data, the start screen loads it back from a file the app saved', async ({ page }) => {
  knownIssue('RES-05');
  await openApp(page);
  const before = await appData(page);

  // Keep a copy: a backup if the page offers one, otherwise the spreadsheet, the only file it offers today.
  const backup = page.getByRole('button', { name: /\bback ?up\b/i });
  const save = (await backup.count()) ? backup.first() : page.getByRole('button', { name: 'Download as a spreadsheet' });
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }).catch(() => null), save.click()]);
  expect(file, 'The page offered no file to keep').not.toBeNull();
  const path = await file.path();

  // The browser drops the site's storage (Safari after weeks away, cleared site data) and the borrower comes back.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#main').waitFor();

  const restore = page.getByRole('button', { name: RESTORE }).or(page.getByRole('link', { name: RESTORE })).filter({ visible: true });
  const offered = await restore.count();
  const fileInputs = await page.locator('input[type="file"]').count();
  const buttons = await page.getByRole('button').filter({ visible: true }).allInnerTexts();
  expect(offered, `The borrower kept "${file.suggestedFilename()}", but the start screen has no way to load it back: ${fileInputs} file inputs, and its only buttons are ${JSON.stringify(buttons)}`).toBeGreaterThan(0);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), restore.first().click()]);
  expect(chooser, 'The restore control did not open a file picker').not.toBeNull();
  await chooser.setFiles(path);
  await page.waitForFunction(key => !['[]', null].includes(localStorage.getItem(key)), KEYS.loans, { timeout: 5000 }).catch(() => {});
  expect(await appData(page), 'Loading the saved file should bring back the same loans, answers and dated records').toEqual(before);
});

test('RES-06 the page says loans are kept in this browser, and the start screen says they may be in another one', async ({ page, browser }) => {
  knownIssue('RES-06');
  const claims = new Map();
  const collect = async where => {
    for (const line of await visibleLines(page, DEVICE_CLAIM)) claims.set(line, [...(claims.get(line) ?? []), where]);
  };
  await page.setViewportSize(PHONE);
  await openApp(page);
  await collect('375 px Loans');
  await goTo(page, 'records');
  await collect('375 px Records');
  await page.setViewportSize({ width: 1024, height: 768 });
  await collect('1024 px Records');
  const listed = [...claims].map(([line, where]) => `"${short(line, 80)}" (${where.join(', ')})`);
  expect(listed, `Each browser, in-app browser and Home Screen icon keeps its own copy, but the page says: ${listed.join('; ')}`).toEqual([]);

  // Someone who added loans elsewhere opens the page in a different browser or app and sees the start screen.
  const elsewhere = await browser.newContext({ viewport: PHONE });
  try {
    const other = await elsewhere.newPage();
    await openApp(other, { seeded: false });
    const hint = await visibleLines(other, OTHER_PLACE);
    const privacy = (await visibleLines(other, /\bthis browser\b/i)).map(line => short(line, 80));
    expect(hint, `The empty start screen never says loans added in another browser or app are still there; it says only ${JSON.stringify(privacy)}`).not.toEqual([]);
  } finally {
    await elsewhere.close();
  }
});

test('RES-07 one unreadable saved loan does not lock the borrower out of the loans that are fine', async ({ page }) => {
  knownIssue('RES-07');
  await seed(page, { loans: [null, ...LOANS] });
  await page.goto('/');
  await appSettled(page);

  const total = usd(LOANS.reduce((sum, l) => sum + l.balance, 0));
  const summary = await textOf(page.getByRole('region', { name: 'Summary' }));
  const controls = await page.getByRole('button').count();
  const kept = await page.evaluate(key => localStorage.getItem(key)?.length ?? 0, KEYS.loans);
  expect(summary, `With one unreadable row stored ahead of ${LOANS.length} good loans, the page shows "${await pageStart(page)}" with ${controls} controls, while the ${kept}-character list of loans is still stored`).toContain(`across ${LOANS.length} loans`);
  expect(summary, `The ${LOANS.length} good loans total ${total}`).toContain(total);
  const notice = await visibleLines(page, UNREADABLE);
  expect(notice, 'The good loans show, but nothing says some saved data could not be read, so the total may be low').not.toEqual([]);

  // Coming back later: the loans still show, and so does the notice, until the borrower deals with the copy.
  await page.reload();
  await appSettled(page);
  expect(await textOf(page.getByRole('region', { name: 'Summary' })), `After a reload the page shows "${await pageStart(page)}"`).toContain(total);
  expect(await visibleLines(page, UNREADABLE), 'After a reload nothing says some saved data could not be read').not.toEqual([]);
});

test('RES-08 when a spreadsheet cannot be prepared, the borrower is told beside the button until they try again', async ({ page }) => {
  knownIssue('RES-08');
  const downloads = [];
  const errors = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]));
  await openApp(page); // a fresh browser context has never fetched the spreadsheet code
  await page.context().setOffline(true);

  const told = await clickAndRead(page, page.getByRole('button', { name: 'Download as a spreadsheet' }));
  expect(told, `Offline, "Download as a spreadsheet" on Loans produced ${downloads.length} files and no message; the only trace is an uncaught error, ${JSON.stringify(errors)}`).not.toEqual([]);
  expect((await announced(page)).filter(text => FAILED.test(text)), `"${told[0]}" is on screen but not in a live region or focus, so a screen reader user hears nothing`).not.toEqual([]);
  // Still there when the borrower looks back: the issue is a message that vanishes or never comes, so this waits.
  await page.waitForTimeout(5000);
  expect(await visibleLines(page, FAILED), 'The failure message disappeared before the borrower tried again').toEqual(expect.arrayContaining(told));

  await goTo(page, 'records');
  const recordsButton = page.getByRole('button', { name: 'Download as a spreadsheet' });
  const toldRecords = await clickAndRead(page, recordsButton);
  expect(toldRecords, `Offline, "Download as a spreadsheet" on Records produced ${downloads.length} files and no message`).not.toEqual([]);

  await page.context().setOffline(false);
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }).catch(() => null), recordsButton.click()]);
  expect(file?.suggestedFilename() ?? 'no file', 'Back online, trying again should download the spreadsheet').toMatch(/\.xlsx$/);
  expect((await visibleLines(page, FAILED)).filter(line => toldRecords.includes(line)), 'The failure message should clear once the download works').toEqual([]);
});

// Regression guards: behaviour the audit verified, which a later change could break.

test('removing a loan and pressing Undo puts back exactly what was stored', async ({ page }) => {
  await openApp(page);
  const before = await stored(page, KEYS.loans);
  await openRow(page, '2023–24 subsidized');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(async () => (await stored(page, KEYS.loans)).length).toBe(LOANS.length - 1);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => stored(page, KEYS.loans), 'Undo should restore the stored loans exactly, in order').toEqual(before);
});

test('opening a loan and saving it unchanged leaves the stored data byte for byte the same', async ({ page }) => {
  await openApp(page);
  const before = await rawData(page);
  await openRow(page, '2024–25 unsubsidized');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Edit this loan' })).toHaveCount(0);
  expect(await rawData(page), 'An edit that changes nothing should store nothing different').toEqual(before);
});

test('a second tab left idle never overwrites what the first tab saved, and a reload shows it', async ({ page }) => {
  await openApp(page);
  const idle = await page.context().newPage();
  await idle.goto('/');
  await idle.locator('#main').waitFor();

  await switchTab(idle, page);
  await page.getByRole('button', { name: 'Add a loan' }).click();
  await addLoan(page, { year: '2025–26', balance: 7777 });
  await expect.poll(() => balances(page)).toContain(7777);
  const saved = await rawData(page);

  // The other tab is only looked at: every section, one row opened, nothing changed.
  await switchTab(page, idle);
  for (const tab of ['plans', 'payoff', 'records', 'loans']) await goTo(idle, tab);
  await openRow(idle, '2022–23 subsidized');
  expect(await rawData(idle), 'Looking around in the idle tab changed what is stored').toEqual(saved);

  await idle.reload();
  await idle.locator('#main').waitFor();
  await expect(idle.getByRole('heading', { name: `Your ${LOANS.length + 1} loans` })).toBeVisible();
});

test('with site storage blocked, the app still opens and works for the visit', async ({ page }) => {
  await blockStorage(page);
  await openApp(page, { seeded: false });
  const access = await page.evaluate(() => { try { return typeof localStorage; } catch (e) { return e.name; } });
  expect(access, 'This test needs storage blocked').toBe('SecurityError');

  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await addLoan(page, { year: '2024–25', balance: 6000 });
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(usd(6000));
  await goTo(page, 'records');
  await page.getByRole('button', { name: "Save today's snapshot" }).click();
  await expect(sections(page).getByRole('button', { name: /^Records/ })).toHaveText(/1/);
});

test('unreadable or unknown saved values still open the app, and every section works', async ({ page }) => {
  await seed(page, {
    loans: '[{"id":"u-1s","nickname":', // a write cut off part way
    profile: JSON.stringify({ ...PROFILE, goal: 'fastest', employment: 'astronaut', selectedPlan: 'save' }),
    snapshots: 'not json',
  });
  await page.goto('/');
  await appSettled(page);
  expect(await page.locator('#main').count(), `The app did not open: "${await pageStart(page)}"`).toBe(1);

  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  for (const tab of ['plans', 'payoff', 'records', 'loans']) {
    await goTo(page, tab);
    expect(await page.locator('#main').count(), `Opening ${tab} with unknown saved answers broke the page: "${await pageStart(page)}"`).toBe(1);
  }
});

test('links to other sites open in a new tab, so a half-typed loan is never lost', async ({ page }) => {
  const external = [];
  const check = async where => {
    const origin = new URL(page.url()).origin;
    const links = await page.getByRole('link').evaluateAll(as => as.map(a => ({ text: a.textContent.trim(), href: a.href, target: a.target })));
    for (const link of links) if (new URL(link.href).origin !== origin) external.push({ ...link, where });
  };
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByLabel('What you owe on it today').fill('4321');
  await check('first loan form');
  await addLoan(page, { year: '2024–25', balance: 4321 });
  await page.getByRole('button', { name: 'Add a loan' }).click();
  await page.getByLabel('What you owe on it today').fill('1234');
  await check('Loans with the form open');

  expect(external.length, 'Expected links to other sites (studentaid.gov, Cense) to check').toBeGreaterThan(0);
  const sameTab = external.filter(link => link.target !== '_blank').map(link => `${link.text} -> ${link.href} (${link.where})`);
  expect(sameTab, 'These links replace the page, and the loan being typed with it').toEqual([]);
});
