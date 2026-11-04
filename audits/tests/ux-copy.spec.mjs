// UX copy and the words around the money, at phone width: UX-12, UX-13 and UX-16 to UX-21, plus guards for copy the
// audit verified as good. A known-issue test asserts the fixed behaviour and lists every measured defect of its issue
// in one assertion, so its first line says what is wrong and by how much.
import { test, expect, openApp, goTo, stored, knownIssue, KEYS, LOANS, PROFILE, PHONE } from './helpers.mjs';
import {
  addLoanCountingTaps,
  byBalanceThenRate,
  byRateThenBalance,
  clip,
  dollars,
  escapeRe,
  fieldMessage,
  KIND_LABEL,
  lastCheckedDate,
  lateFeeNotice,
  listRows,
  loanRowFacts,
  mixedRateFormats,
  occurrences,
  payoffOrderList,
  readSection,
  sectionText,
  servicerInstructions,
  stockSentences,
} from './support/ux-copy.mjs';

// Reduced motion only makes scrolling instant; none of these issues is about motion.
test.use({ viewport: PHONE, reducedMotion: 'reduce' });

test('UX-12 the instruction that makes extra payments count comes before the payoff order and names the servicer to tell', async ({ page }) => {
  knownIssue('UX-12');
  // Not asserted: the filed fix's 'Copy the request' button, one shape among several a fix could take.
  const target = byRateThenBalance(LOANS)[0]; // where extra money goes first
  const servicers = new Set(LOANS.map(l => l.servicer));
  await openApp(page, { profile: { ...PROFILE, extraPerMonth: 0 } });
  await goTo(page, 'payoff');
  const amount = page.getByRole('textbox', { name: 'Extra each month', exact: true });
  await amount.click();
  await amount.pressSequentially('100');
  await expect(amount).toHaveValue('100');

  const rows = await listRows(payoffOrderList(page, LOANS));
  expect(rows.length, 'Payoff lists every loan in its payoff order').toBe(LOANS.length);
  const found = await servicerInstructions(page, new RegExp(`servicer|${escapeRe(target.servicer)}`, 'i'));
  const problems = [];
  if (!found.length) {
    problems.push('Payoff has no instruction to tell the servicer where extra money goes');
  } else {
    const top = Math.min(...found.map(f => f.top));
    if (top >= rows[1].top) {
      problems.push(
        `the instruction ("${clip(found[0].text, 60)}") starts at y=${top}px, after ${rows.filter(r => r.top < top).length} of ${rows.length} loans in the order (the 2nd starts at y=${rows[1].top}px)`,
      );
    }
    if (!found.some(f => f.text.includes(target.servicer))) {
      const who = found
        .map(f => /\b(?:tell|ask|contact|call)\s+(.{1,40}?)\s+(?:in writing|where|to|that)\b/i.exec(f.text)?.[1])
        .find(Boolean);
      problems.push(
        `it says to tell "${who ?? 'your servicer'}", not ${target.servicer}, who holds ${target.nickname}, where the extra goes; these loans sit with ${servicers.size} servicers`,
      );
    }
  }
  // A servicer the borrower has not looked up yet is not a name to print.
  const unsure = await page.context().newPage();
  await openApp(unsure, {
    loans: LOANS.map(l => ({ ...l, servicer: 'Not sure yet' })),
    profile: { ...PROFILE, extraPerMonth: 100 },
  });
  await goTo(unsure, 'payoff');
  const generic = await servicerInstructions(unsure, /servicer|Not sure yet/i);
  const misnamed = generic.find(f => /Not sure yet/i.test(f.text));
  if (misnamed) problems.push(`with the servicer left as "Not sure yet" it reads "${clip(misnamed.text, 60)}"`);
  else if (!generic.some(f => /servicer/i.test(f.text))) {
    problems.push('with the servicer left as "Not sure yet" it no longer tells the borrower to write to their servicer');
  }
  await unsure.close();

  expect(
    problems,
    `UX-12: a borrower adding $100 a month should meet the instruction that makes it count before the payoff order, naming who to tell. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-13 the late-fee notice leads with what a missed payment costs, and a borrower in default is told what default costs and how to end it', async ({ page }) => {
  knownIssue('UX-13');
  // Not covered here: the notice's title printing on a different page from its body (needs PDF text extraction).
  await openApp(page);
  const problems = [];
  const notice = await lateFeeNotice(page);
  if (!notice) {
    problems.push('Loans has no late-fee notice with a bold line');
  } else if (!/credit|\b90 days\b|default|delinquen|collection/i.test(notice.bold)) {
    const cost = /[^.:]*\b90 days\b[^.]*/i.exec(notice.text)?.[0].trim();
    problems.push(`the notice's only bold text is "${notice.bold}", and what a missed payment costs is in regular weight ("${cost}")`);
  }

  // One loan moves to the Default Resolution Group, which services only loans already in default.
  const moved = LOANS.find(l => l.id === 'u-3u');
  await page.getByRole('button', { name: new RegExp(`^${escapeRe(moved.nickname)}`) }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('form', { name: 'Edit this loan' });
  await form.getByLabel('Who do you pay?', { exact: true }).selectOption('Default Resolution Group');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  const text = await sectionText(page);
  const costs = /collection|garnish|wages|tax refund|offset/i.test(text);
  const exit = /rehabilitat|consolidat/i.test(text);
  if (!costs || !exit) {
    const shown = (await lateFeeNotice(page))?.bold;
    problems.push(
      `with ${moved.nickname} at the Default Resolution Group, Loans names ${costs ? 'a' : 'no'} cost of default (collection charges, wage garnishment, tax refund offset) and ${exit ? 'a' : 'no'} way out (rehabilitation, consolidation)${shown ? `, and still says "${shown}"` : ''}`,
    );
  }

  expect(
    problems,
    `UX-13: the late-fee notice should not read as permission to skip a payment, and a borrower in default needs default's costs and the way out. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-16 loan form messages point to where the field is, state the rule the check applies, and keep each hint in view', async ({ page }) => {
  knownIssue('UX-16');
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const fields = {
    date: form.getByLabel('Date it was paid out', { exact: true }),
    balance: form.getByLabel('What you owe on it today', { exact: true }),
    rate: form.getByLabel('Interest rate', { exact: true }),
  };
  const hints = {};
  for (const [name, field] of Object.entries(fields)) hints[name] = (await fieldMessage(field)).described;
  const placeholders = {
    balance: await fields.balance.getAttribute('placeholder'),
    rate: await fields.rate.getAttribute('placeholder'),
  };

  await form.getByRole('button', { name: 'Save loan' }).click();
  await expect(fields.date).toHaveAttribute('aria-invalid', 'true');
  const date = await fieldMessage(fields.date);
  const lostHints = [];
  for (const [name, hint] of Object.entries(hints)) {
    if (hint && !(await form.getByText(hint).first().isVisible())) lostHints.push(`${name} ("${hint}")`);
  }

  // A rate of 0 is rejected: the message must not say 0 is allowed.
  await fields.rate.click();
  await fields.rate.pressSequentially('0');
  await page.keyboard.press('Tab');
  const zero = await fieldMessage(fields.rate);

  // The one-tap fix offered for a cleared rate must survive the error.
  await form.getByRole('button', { name: '2024–25', exact: true }).click();
  await fields.rate.click();
  await fields.rate.press('ControlOrMeta+a');
  await fields.rate.press('Backspace');
  await page.keyboard.press('Tab');
  await expect(fields.rate).toHaveAttribute('aria-invalid', 'true'); // an empty rate is refused either way
  const useRate = await form.getByRole('button', { name: /^Use 6\.53\s?%$/ }).isVisible();
  const cleared = await fieldMessage(fields.rate);

  const problems = [];
  const says = /\b(below|beneath|underneath)\b/i.test(date.alert) ? 'below' : /\babove\b/i.test(date.alert) ? 'above' : null;
  if (date.alertBox && ((says === 'below' && date.field.top < date.alertBox.bottom) || (says === 'above' && date.field.bottom > date.alertBox.top))) {
    problems.push(
      `the date message says "${date.alert}" but the date field is ${says === 'below' ? 'above' : 'below'} it (field y=${date.field.top}-${date.field.bottom}px, message y=${date.alertBox.top}-${date.alertBox.bottom}px)`,
    );
  }
  if (zero.invalid && /\b(between|from)\s+0(?:\.0+)?%?\s+(?:and|to)\b|(?:^|\s)0(?:\.0+)?%?\s*(?:-|–|to)\s*\d/i.test(zero.alert)) {
    problems.push(`a rate of 0 is rejected with "${zero.alert}", which says 0 is allowed`);
  }
  if (lostHints.length) problems.push(`after Save the errors replace the hints for ${lostHints.join(', ')}`);
  if (!useRate) {
    problems.push(`after tapping 2024–25 and clearing the rate, "${cleared.alert}" replaces the hint and its one-tap "Use 6.53%" button`);
  }
  const rejected = (placeholder, ok) => placeholder !== null && /\d/.test(placeholder) && !ok(Number(placeholder.replace(/[^\d.]/g, '')));
  const badPlaceholders = [
    rejected(placeholders.balance, v => v > 0) && `balance "${placeholders.balance}"`,
    rejected(placeholders.rate, v => v > 0 && v <= 25) && `rate "${placeholders.rate}"`,
  ].filter(Boolean);
  if (badPlaceholders.length) problems.push(`empty fields show values the form rejects: ${badPlaceholders.join(', ')}`);

  expect(
    problems,
    `UX-16: a borrower fixing the loan form should be pointed the right way, told the real rule and keep each hint. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-17 each thing has one name on every tab, warning titles say what they warn about, and the two downloads are told apart', async ({ page }) => {
  knownIssue('UX-17');
  // Overlap: money-core's cutoff guard finds the Loans notice by its title 'Check this before anything else', which
  // this issue's fix renames, so that guard's locator moves with the fix.
  // A public-service borrower with an income who has not chosen a plan: the recommendation and PSLF warnings show.
  await openApp(page, { profile: { ...PROFILE, selectedPlan: null } });
  const download = /download|spreadsheet|export/i;
  const texts = {};
  texts.loans = await readSection(page, 'loans');
  const loansDownloads = (await page.locator('#main').getByRole('button', { name: download }).allInnerTexts()).map(t => t.trim());
  texts.plans = await readSection(page, 'plans');
  texts.payoff = await readSection(page, 'payoff');
  texts.records = await readSection(page, 'records');
  const recordsDownloads = (await page.locator('#main').getByRole('button', { name: download }).allInnerTexts()).map(t => t.trim());

  // Then a loan paid out after July 1, 2026, entered the way a borrower would.
  await goTo(page, 'loans');
  await page.getByRole('button', { name: 'Add a loan', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  await form.getByRole('button', { name: '2026–27', exact: true }).click();
  const balance = form.getByLabel('What you owe on it today', { exact: true });
  await balance.click();
  await balance.pressSequentially('3000');
  texts.form = await form.innerText();
  await form.getByRole('button', { name: 'Save loan' }).click();
  await expect(form).toHaveCount(0);
  texts.loansAfterCutoff = await readSection(page, 'loans');
  texts.plansAfterCutoff = await readSection(page, 'plans');

  const all = Object.values(texts).join('\n');
  const problems = [];
  const record = occurrences(/\brecords?(?![a-z])/i, all.replace(/\bon record\b/gi, ''));
  const snapshot = occurrences(/\bsnapshots?\b/i, all);
  if (record.count && snapshot.count) {
    problems.push(`the saved copy is a "record" ${record.count}× and a "snapshot" ${snapshot.count}× (${snapshot.quotes.join(', ')})`);
  }
  // studentaid.gov's own term, "disbursement date", may stay where the form explains it.
  const paidOut = occurrences(/\bpaid out\b/i, all);
  const disbursed = occurrences(/\bdisburs\w*/i, all.replace(/disbursement date/gi, ''));
  if (paidOut.count && disbursed.count) {
    problems.push(`a loan's date is "paid out" ${paidOut.count}× and "disbursed" ${disbursed.count}× (${disbursed.quotes.join(', ')})`);
  }
  const pickNames = ['Where we would start', 'Our pick', 'top pick'].filter(n => new RegExp(`\\b${n}\\b`, 'i').test(all));
  if (pickNames.length > 1) problems.push(`the recommended plan is ${pickNames.map(n => `"${n}"`).join(' and ')}`);
  const shared = loansDownloads.filter(n => recordsDownloads.includes(n));
  if (shared.length) problems.push(`Loans and Records both label their different files "${shared[0]}"`);
  const vague = ['Watch this one', 'One date decided this', 'Check this before anything else', 'One thing that undoes all of this'].filter(t => all.includes(t));
  if (vague.length) problems.push(`warning titles that do not say what they warn about: ${vague.map(t => `"${t}"`).join(', ')}`);
  const portfolio = occurrences(/\bportfolio\b/i, all);
  if (portfolio.count) problems.push(`"portfolio" ${portfolio.count}× (${portfolio.quotes[0]})`);
  if (!/income[- ]based repayment/i.test(texts.plans)) problems.push('IBR is never spelled out as Income-Based Repayment');

  expect(
    problems,
    `UX-17: a borrower should not have to work out which words mean the same thing. At 375x812, every section opened, before and after a loan paid out after July 1, 2026: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-18 each payoff-order row carries only what is its own, in one rate format, and no row promises a rollover the projection does not make', async ({ page }) => {
  knownIssue('UX-18');
  await openApp(page); // eight loans, Standard chosen, $100 extra
  await goTo(page, 'payoff');
  const list = payoffOrderList(page, LOANS);
  const nicknames = LOANS.map(l => l.nickname);
  const rate = await listRows(list);
  expect(rate.length, 'Payoff lists every loan in its payoff order').toBe(LOANS.length);

  await page.getByRole('radio', { name: /Smallest balance first/ }).click();
  await expect(list.getByRole('listitem').first()).toContainText(byBalanceThenRate(LOANS)[0].nickname);
  const balance = await listRows(list);
  const rollover = occurrences(/[^.]*\bfrees? up\b[^.]*\bminimum\b[^.]*/i, await sectionText(page), 1);

  const problems = [];
  const describe = ([sentence, rows]) => `"${sentence}" ×${rows.length}`;
  const byRate = stockSentences(rate.map(r => r.text), nicknames);
  if (byRate.rows.length) {
    problems.push(`under "Highest rate first", ${byRate.rows.length} of ${rate.length} rows repeat a stock sentence (${byRate.repeated.map(describe).join(', ')})`);
  }
  const mixed = mixedRateFormats(rate.map(r => r.text).join('\n'));
  if (mixed.length) problems.push(`one rate printed two ways: ${mixed.map(forms => forms.join(' and ')).join(', ')}`);
  if (rollover.count) {
    problems.push(`"Smallest balance first" rows say closing a loan frees up its minimum (${rollover.count}×), but the projection bills one required payment across all loans and only moves the extra`);
  }
  const byBalance = stockSentences(balance.map(r => r.text), nicknames);
  if (byBalance.rows.length) {
    problems.push(`under "Smallest balance first", ${byBalance.rows.length} of ${balance.length} rows repeat a stock sentence (${byBalance.repeated.map(describe).join(', ')})`);
  }

  expect(
    problems,
    `UX-18: on a phone the payoff order should not make a borrower scroll eight rows of the same sentence. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-19 the subsidized and unsubsidized loans of each year need no type tap, and a new add after Cancel starts blank', async ({ page }) => {
  knownIssue('UX-19');
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const checkedType = async () => (await form.getByRole('radiogroup', { name: 'Loan type' }).getByRole('radio', { checked: true }).innerText()).trim();
  const freshType = await checkedType();

  // Two school years of subsidized and unsubsidized loans, then next year's subsidized one.
  const loans = LOANS.slice(0, 5);
  const taps = [];
  for (const [i, loan] of loans.entries()) {
    taps.push(await addLoanCountingTaps(page, loan));
    await expect
      .poll(async () => (await stored(page, KEYS.loans))?.length ?? 0, { message: `loan ${i + 1} (${loan.nickname}) was saved` })
      .toBe(i + 1);
    await expect(form.getByLabel('What you owe on it today', { exact: true })).toHaveValue('');
  }
  // What a borrower has to give: each balance and a Save, a school year when it changes, a servicer when it
  // changes (two taps on a select). The year's subsidized-then-unsubsidized pattern should cost nothing more.
  const needed = loans.reduce((sum, loan, i) => {
    const prev = loans[i - 1];
    return sum + 2 + (!prev || prev.disbursementDate !== loan.disbursementDate ? 1 : 0) + (!prev || prev.servicer !== loan.servicer ? 2 : 0);
  }, 0);
  const counts = taps.map(t => t.length);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const typeTaps = taps.flatMap((t, i) => (t.includes('type') ? [`${i + 1} (${loans[i].nickname})`] : []));

  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a loan', exact: true }).click();
  const reopened = {
    date: await form.getByLabel('Date it was paid out', { exact: true }).inputValue(),
    rate: await form.getByLabel('Interest rate', { exact: true }).inputValue(),
    type: await checkedType(),
  };

  const problems = [];
  if (total > needed) {
    problems.push(
      `entering ${loans.length} loans with "Save and add another" took ${total} taps (${counts.join(', ')}) where ${needed} do${typeTaps.length ? `: loan ${typeTaps.join(' and ')} opened on the wrong type and needed a type tap` : ''}`,
    );
  }
  if (reopened.date || reopened.rate || reopened.type !== freshType) {
    problems.push(
      `after Cancel, "Add a loan" opened with date ${reopened.date || 'blank'}, rate ${reopened.rate || 'blank'} and type ${reopened.type}, none picked for this loan (a fresh form starts blank on ${freshType})`,
    );
  }

  expect(
    problems,
    `UX-19: adding a year's pair of loans should not cost an extra tap, and a new loan should not open with an old one's year and rate. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-20 the app says when the rules were last checked, links the regulations it applies, and its first screen does not contradict itself', async ({ page }) => {
  knownIssue('UX-20');
  // Not asserted: that the linked regulation pages are current, which needs requests to other hosts (a scheduled job).
  await openApp(page, { seeded: false });
  const firstRun = await sectionText(page);
  await page.getByRole('button', { name: 'Look around with example loans' }).click();
  const plans = await readSection(page, 'plans'); // footer included
  const links = await page.locator('#main a[href]').evaluateAll(anchors =>
    anchors.map(a => ({ href: a.href, text: a.innerText.trim(), rel: a.rel, policy: a.referrerPolicy })),
  );

  const problems = [];
  const checked = lastCheckedDate(plans);
  if (!checked) {
    problems.push('Plans and the footer give no date the rules were last checked (no "checked", "reviewed", "verified" or "updated" followed by a date up to today)');
  } else if (checked.date.getFullYear() < 2026) {
    problems.push(`"${checked.quote}" predates the 2026 rules the app applies`);
  }
  const host = href => {
    try {
      return new URL(href).hostname;
    } catch {
      return '';
    }
  };
  const ruleLinks = links.filter(l => /(^|\.)(ecfr\.gov|federalregister\.gov|govinfo\.gov|law\.cornell\.edu|regulations\.gov)$/i.test(host(l.href)));
  if (!ruleLinks.some(l => /685\.\d{3}/.test(`${l.href} ${l.text}`))) {
    problems.push(`no link to a section of 34 CFR 685: the ${links.length} links go to ${[...new Set(links.map(l => l.href))].join(', ')}`);
  }
  const leaky = ruleLinks.filter(l => !/\bnoreferrer\b/i.test(l.rel) && l.policy !== 'no-referrer');
  if (leaky.length) problems.push(`${leaky.length} regulation links would send this page's address as the referrer`);
  const claim = /[^.]*\bnowhere\b[^.]*\btogether\b[^.]*/i.exec(firstRun)?.[0].trim();
  if (claim) {
    const card = /[^.]*All three are at(?:[^.]|\.(?=\S))*/i.exec(firstRun)?.[0].trim();
    problems.push(`the first-run headline says "${claim}"${card ? ` while the card below says "${card}"` : ''}`);
  }

  expect(
    problems,
    `UX-20: a borrower should be able to see how current the rules are and open them. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

test('UX-21 on a phone each loan row shows its type once and its servicer, starts every rate in one column and keeps the cutoff tag readable', async ({ page }) => {
  knownIssue('UX-21');
  // A ninth loan whose name does not say its type, paid out after the cutoff, at the longest servicer name.
  const summer = {
    id: 'u-5s', nickname: 'Summer term', servicer: 'Default Resolution Group', kind: 'direct_sub', subsidy: 'subsidized',
    principal: 1800, balance: 1800, rate: 6.52, disbursementDate: '2026-09-01', minPayment: 0,
  };
  const loans = [...LOANS, summer];
  await openApp(page, { loans });
  const rowOf = loan => page.getByRole('button', { name: new RegExp(`^${escapeRe(loan.nickname)}\\b`) });
  const facts = [];
  for (const loan of loans) facts.push({ loan, ...(await loanRowFacts(rowOf(loan))) });
  const cuts = [];
  for (const width of [PHONE.width, 320]) {
    await page.setViewportSize({ width, height: PHONE.height });
    const { tag } = await loanRowFacts(rowOf(summer));
    if (!tag) cuts.push(`at ${width}px the row has no July 1, 2026 tag`);
    else if (tag.cutPx > 0.5) cuts.push(`${tag.cutPx}px of "${tag.text}" cut off at ${width}px`);
  }

  const problems = [];
  const typeCount = f => occurrences(new RegExp(`\\b${KIND_LABEL[f.loan.kind]}\\b`, 'i'), f.text).count;
  const twice = facts.filter(f => typeCount(f) > 1);
  if (twice.length) problems.push(`${twice.length} of ${facts.length} rows show the type twice ("${twice[0].text}")`);
  const never = facts.filter(f => typeCount(f) === 0);
  if (never.length) problems.push(`${never.length} rows never show the type ("${never[0].text}")`);
  const withServicer = facts.filter(f => f.text.includes(f.loan.servicer)).length;
  if (withServicer < facts.length) problems.push(`the servicer shows on ${withServicer} of ${facts.length} rows without opening them`);
  if (facts.some(f => !f.rate)) {
    problems.push(`${facts.filter(f => !f.rate).length} rows show no rate`);
  } else {
    const spread = values => Math.max(...values) - Math.min(...values);
    const lefts = facts.map(f => f.rate.left);
    if (spread(lefts) > 1 && spread(facts.map(f => f.rate.right)) > 1) {
      const xs = [...new Set(lefts.map(x => x.toFixed(1)))];
      problems.push(`rates start at ${xs.length} x positions (${xs.join('px, ')}px, ${spread(lefts).toFixed(1)}px apart)`);
    }
  }
  if (cuts.length) problems.push(`on ${summer.nickname}, ${cuts.join(' and ')}`);

  expect(
    problems,
    `UX-21: a borrower scanning loan rows on a phone should see each fact once, who holds the loan, and rates in one column. At 375x812: ${problems.join('; ')}`,
  ).toEqual([]);
});

// ---- Guards: form copy and entry defaults the audit found good, which the fixes above could disturb. Guards for
// the cutoff warning, the Records diff, closed plans and cleaned money live in money-core, ux-journeys, money-edges
// and resilience. ----

test('the loan form names the date the way studentaid.gov does and asks for the balance in plain words', async ({ page }) => {
  // audit:agentic#4
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const date = form.getByLabel('Date it was paid out', { exact: true });
  await expect(date).toHaveAccessibleDescription(/disbursement date/i);
  await expect(date).toHaveAccessibleDescription(/studentaid\.gov/i);
  await expect(form.getByLabel('What you owe on it today', { exact: true })).toBeVisible();
});

test('an empty save lands on the date field and gives each missing field its own announced message', async ({ page }) => {
  // audit:ux#1, with audit:a11y#6
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const date = form.getByLabel('Date it was paid out', { exact: true });
  await form.getByRole('button', { name: 'Save loan' }).click();
  await expect(date).toBeFocused();
  await expect(date).toBeInViewport();
  const messages = [];
  for (const label of ['Date it was paid out', 'What you owe on it today', 'Interest rate']) {
    const field = form.getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const { alert } = await fieldMessage(field);
    expect(alert, `"${label}" should point to an announced (role=alert) message`).not.toBe('');
    messages.push(alert);
  }
  expect(new Set(messages).size, `each field should say what it needs: ${messages.join(' | ')}`).toBe(3);
});

test('Save and add another names each saved loan and keeps the running total right', async ({ page }) => {
  // audit:ux#0
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const summary = page.getByRole('region', { name: 'Summary' });
  let total = 0;
  for (const [i, loan] of LOANS.slice(0, 2).entries()) {
    await addLoanCountingTaps(page, loan);
    total += loan.balance;
    const year = loan.nickname.split(' ')[0];
    const kind = KIND_LABEL[loan.kind].toLowerCase();
    await expect(page.getByRole('status').filter({ hasText: year })).toContainText(new RegExp(`\\b${kind}\\b`, 'i'));
    await expect(summary).toContainText(dollars(total));
    await expect(summary).toContainText(`${i + 1} loan${i ? 's' : ''}`);
    await expect(form.getByLabel('What you owe on it today', { exact: true })).toHaveValue('');
  }
});

test('Save and add another keeps the school year, its rate and the servicer for the other loan of that year', async ({ page }) => {
  // audit:agentic#5
  await openApp(page, { seeded: false });
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  const form = page.getByRole('form', { name: 'Add a loan' });
  const [sub] = LOANS; // 2022–23 subsidized at Nelnet; the unsubsidized loan of that year comes next
  await addLoanCountingTaps(page, sub);
  await expect.poll(async () => (await stored(page, KEYS.loans))?.length ?? 0, { message: 'the first loan was saved' }).toBe(1);
  await expect(form.getByLabel('What you owe on it today', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('Date it was paid out', { exact: true })).toHaveValue(sub.disbursementDate);
  await expect(form.getByLabel('Who do you pay?', { exact: true })).toHaveValue(sub.servicer);
  const rate = await form.getByLabel('Interest rate', { exact: true }).inputValue();
  expect(Number(rate), `the next form's rate should stay at ${sub.rate}% for the same school year, not "${rate}"`).toBe(sub.rate);
});
