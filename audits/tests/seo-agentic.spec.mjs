// What crawlers, link previews, search results, a mistyped address and a browser agent get from Loan Desk.
// Raw-HTML checks request the app under test without running JavaScript, the way GPTBot, ClaudeBot and
// PerplexityBot read it. Nothing in this file contacts a host other than the app under test (AUDIT_URL).
import { test, expect, knownIssue, openApp, seed, goTo, stored, KEYS, LOANS } from './helpers.mjs';
import {
  AGENTS, raw, metas, linkHrefs, jsonLdBlocks, readableText, coverage, isAbsoluteHttp, ownOrigins,
  fetchImage, describeImage, transparentPixels, crawl, robotsBlocksSite, paintedBackground,
  webmcpStandIn, waitForTools, runToolsAndCompareStorage,
} from './support/seo-agentic.mjs';

const pct = share => `${Math.round(share * 100)}%`;
const clip = (text, n = 160) => (text.length > n ? `${text.slice(0, n)}…` : text);
const hrefs = locator => locator.evaluateAll(links => links.map(a => a.href));
const robotsDirectives = response => [...metas(response.$, 'robots', 'googlebot'), response.headers['x-robots-tag'] ?? ''].join(' ');
const sameAddress = (a, b) => isAbsoluteHttp(a) && isAbsoluteHttp(b) && new URL(a).href === new URL(b).href;
// An address on a loopback host other than the app under test, which no one else can load. A Next build without
// metadataBase falls back to http://localhost:3000 for these tags.
const loopbackElsewhere = (href, baseURL) =>
  isAbsoluteHttp(href) && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(href).hostname) && new URL(href).origin !== new URL(baseURL).origin;

// The rules the tool exists to get right, by the names a borrower or a crawler would search for.
const RULES = {
  'the July 1, 2026 cutoff': /July\s+1,?\s+2026|2026-07-01/i,
  RAP: /\bRAP\b|Repayment Assistance Plan/,
  'Tiered Standard': /Tiered Standard/i,
  IBR: /\bIBR\b|Income-Based Repayment/i,
  PSLF: /\bPSLF\b|Public Service Loan Forgiveness/i,
  'Parent PLUS': /Parent PLUS/i,
};

test('SEO-01 a reader that runs no JavaScript gets the first-run screen and can follow links to the repayment rules', async ({ page, browser, request, baseURL }) => {
  knownIssue('SEO-01');
  // What a first-time visitor reads once the scripts have run: the yardstick for the first two checks.
  await openApp(page, { seeded: false });
  const shown = await page.locator('body').innerText();
  const headline = (await page.locator('#main').getByRole('heading').first().innerText()).trim();

  // 1. Crawlers and AI fetchers that read raw HTML get the same words.
  const home = await raw(request, '/');
  const serverText = readableText(home.$);
  const server = coverage(shown, serverText);
  expect.soft(server.share, `Server HTML of / carries ${server.found} of the ${server.total} distinct words the first-run screen shows (${pct(server.share)}), with ${home.$('h1').length} <h1> and ${home.$('a[href]').length} links: a reader that skips JavaScript gets ${serverText ? `only "${clip(serverText)}"` : 'no body text at all outside <noscript>'}, not "${headline}"`).toBeGreaterThanOrEqual(0.8);

  // 2. Before the scripts arrive (a first visit on a slow phone), the page already shows that screen.
  const noScript = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const bare = await noScript.newPage();
  await bare.goto('/');
  const paintedText = (await bare.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  await noScript.close();
  const painted = coverage(shown, paintedText);
  expect.soft(painted.share, `Until the scripts run, the page shows ${painted.found} of the ${painted.total} first-run words (${pct(painted.share)}): "${clip(paintedText)}"`).toBeGreaterThanOrEqual(0.8);

  // 3. From /, plain links in server HTML lead to pages that state the rules.
  const pages = await crawl(request, baseURL, ownOrigins(home.$, baseURL));
  const text = pages.map(p => p.text).join('\n');
  const missing = Object.entries(RULES).filter(([, rule]) => !rule.test(text)).map(([name]) => name);
  expect.soft(missing, `Server HTML reachable from / by plain links (${pages.map(p => `${p.path} ${p.status}`).join(', ')}) names ${Object.keys(RULES).length - missing.length} of ${Object.keys(RULES).length} repayment rules; missing: ${missing.join(', ')}`).toEqual([]);
});

test('SEO-02 a shared link shows a preview image and names its own address', async ({ request, baseURL }) => {
  knownIssue('SEO-02');
  const home = await raw(request, '/');
  const own = ownOrigins(home.$, baseURL);
  const [ogImage] = metas(home.$, 'og:image', 'og:image:url', 'og:image:secure_url');
  const [twitterImage] = metas(home.$, 'twitter:image', 'twitter:image:src');
  const [ogUrl] = metas(home.$, 'og:url');
  const [card] = metas(home.$, 'twitter:card');
  const tags = `og:image ${ogImage ?? '(none)'}, twitter:image ${twitterImage ?? '(none)'}, og:url ${ogUrl ?? '(none)'}, twitter:card ${card ?? '(none)'}`;

  expect.soft(isAbsoluteHttp(ogImage), `A shared link shows no picture: server HTML of / has no absolute og:image (${tags})`).toBe(true);
  expect.soft(twitterImage === undefined || isAbsoluteHttp(twitterImage), `twitter:image must be absolute when present (${tags})`).toBe(true);
  for (const [tag, href] of [['og:image', ogImage], ['twitter:image', twitterImage]]) {
    // An image hosted on another site is accepted as declared: this suite never fetches other hosts.
    if (!isAbsoluteHttp(href) || !own.has(new URL(href).origin)) continue;
    const image = await fetchImage(request, href, baseURL);
    expect.soft(image.status === 200 && ['png', 'jpeg', 'gif', 'webp'].includes(image.format) && image.width >= 600 && image.height >= 315,
      `${tag} ${describeImage(image)}: a large link preview needs a PNG, JPEG, GIF or WebP of at least 600x315`).toBe(true);
  }
  expect.soft(isAbsoluteHttp(ogUrl), `The preview does not name the page's own address: no absolute og:url (${tags})`).toBe(true);
  expect.soft([ogImage, twitterImage, ogUrl].filter(href => loopbackElsewhere(href, baseURL)), `Share tags name a loopback address that no one else can reach (${tags})`).toEqual([]);
});

test('SEO-05 a tagged link to / declares one canonical address, and the server HTML describes Loan Desk as structured data', async ({ request, baseURL }) => {
  knownIssue('SEO-05');
  const tagged = '/?utm_source=beehiiv&utm_medium=email';
  const page = await raw(request, tagged);
  const canonicals = linkHrefs(page.$, 'canonical');
  expect.soft(canonicals.length, `${tagged} declares ${canonicals.length} canonical addresses (${canonicals.join(', ') || 'none'}), so search engines must guess whether it or / is the page to show`).toBe(1);
  const [canonical] = canonicals;
  if (canonical !== undefined) {
    const url = isAbsoluteHttp(canonical) ? new URL(canonical) : null;
    expect.soft(Boolean(url && url.pathname === '/' && !url.search), `The canonical "${canonical}" should be the absolute address of / without the tracking query`).toBe(true);
  }
  const [ogUrl] = metas(page.$, 'og:url');
  expect.soft(sameAddress(ogUrl, canonical), `og:url ${ogUrl ?? '(none)'} should name the same address as the canonical (${canonical ?? 'none'})`).toBe(true);
  expect.soft([canonical, ogUrl].filter(href => loopbackElsewhere(href, baseURL)), `The canonical (${canonical ?? 'none'}) or og:url (${ogUrl ?? 'none'}) names a loopback address that search engines cannot reach`).toEqual([]);

  const blocks = jsonLdBlocks(page.$);
  expect.soft(blocks.length, `Server HTML of / has ${blocks.length} JSON-LD blocks, so readers that skip JavaScript get no machine-readable summary of what Loan Desk is`).toBeGreaterThan(0);
  const nodes = [];
  for (const block of blocks) {
    try {
      nodes.push(...[JSON.parse(block)].flat().flatMap(data => data?.['@graph'] ?? [data]));
    } catch (error) {
      expect.soft(error.message, `A JSON-LD block does not parse: ${clip(block)}`).toBe('');
    }
  }
  if (blocks.length) {
    expect.soft(nodes.some(node => node?.['@type'] && /Loan Desk/i.test(String(node.name ?? ''))), `No JSON-LD node has an @type and the name Loan Desk: ${clip(blocks.join(' '))}`).toBe(true);
    expect.soft(blocks.join(' ').match(/"(aggregateRating|review|reviews|ratingValue)"/g) ?? [], 'Structured data must not claim ratings or reviews the page does not show').toEqual([]);
  }

  // The 404 must not claim the homepage's address or description.
  const missing = await raw(request, `/seo-05-no-such-page-${Date.now()}`);
  expect.soft(missing.status, 'An unknown address must stay a 404').toBe(404);
  expect.soft(linkHrefs(missing.$, 'canonical'), 'The 404 must not declare a canonical address').toEqual([]);
  expect.soft(jsonLdBlocks(missing.$).length, "The 404 must not carry the app's structured data").toBe(0);
});

test('SEO-06 search results and iPhone home screens get a raster Cense icon', async ({ request, page, baseURL }) => {
  knownIssue('SEO-06');
  const home = await raw(request, '/');
  // Formats Google's favicon guide lists. SVG is not among them.
  const LISTED = ['png', 'ico', 'gif', 'jpeg', 'bmp'];
  const icons = await Promise.all(linkHrefs(home.$, 'icon').map(href => fetchImage(request, href, baseURL)));
  const raster = icons.filter(i => i.status === 200 && LISTED.includes(i.format) && Math.min(i.width, i.height) >= 48);
  expect.soft(raster.length, `Google's favicon crawler finds no icon in a format it lists: the linked icons are ${icons.map(describeImage).join('; ') || 'none'}; it needs a PNG, ICO, GIF, JPEG or BMP of at least 48x48`).toBeGreaterThan(0);

  const favicon = await fetchImage(request, '/favicon.ico', baseURL);
  expect.soft(favicon.status === 200 && LISTED.includes(favicon.format), `${describeImage(favicon)}, so anything that asks for the icon at its standard address gets none`).toBe(true);

  const linkedTouch = [...linkHrefs(home.$, 'apple-touch-icon'), ...linkHrefs(home.$, 'apple-touch-icon-precomposed')];
  const touch = await Promise.all((linkedTouch.length ? linkedTouch : ['/apple-touch-icon.png']).map(href => fetchImage(request, href, baseURL)));
  const usable = touch.filter(i => i.status === 200 && ['png', 'jpeg'].includes(i.format) && i.width >= 180 && i.height >= 180);
  expect.soft(usable.length, `An iPhone Home Screen shortcut gets no Cense icon: ${linkedTouch.length ? `the linked apple-touch-icon ${touch.map(describeImage).join('; ')}` : `no apple-touch-icon is linked and ${describeImage(touch[0])}`}; it needs an opaque PNG of at least 180x180`).toBeGreaterThan(0);
  if (usable.length) {
    const clear = await transparentPixels(page, usable[0]);
    expect.soft(clear, `The apple-touch-icon ${usable[0].href} has ${clear} transparent pixels, which iOS fills with black`).toBe(0);
  }
});

test('SEO-07 a mistyped address shows a Loan Desk page with a way back and word that saved loans are safe', async ({ page, request, baseURL }) => {
  knownIssue('SEO-07');
  const path = `/seo-07-no-such-page-${Date.now()}`;
  const home = await raw(request, '/');
  const own = ownOrigins(home.$, baseURL);

  // The app's own look in both colour schemes, to compare the 404 with.
  await openApp(page, { seeded: false });
  const look = {};
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    look[colorScheme] = await paintedBackground(page);
  }

  const response = await page.goto(path);
  expect.soft(response.status(), 'An unknown address must answer 404').toBe(404);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const wayBack = await page.getByRole('link').evaluateAll((links, origins) => links
    .filter(a => { const u = new URL(a.href); return origins.includes(u.origin) && u.pathname === '/' && !u.hash && a.checkVisibility(); })
    .map(a => a.innerText.trim()), [...own]);
  expect.soft(wayBack, `The 404 is a dead end: ${wayBack.length} visible links back to Loan Desk, and the whole page reads "${text}"`).not.toEqual([]);
  expect.soft(text, `The 404 never says that saved loans are untouched; it reads "${text}"`).toMatch(/\b(saved|stored|your (loans|data|numbers|information))\b/i);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const shade = await paintedBackground(page);
    expect.soft(shade, `In ${colorScheme} mode the 404 paints ${shade[0]} where Loan Desk paints ${look[colorScheme][0]}, so it does not look like the app`).toEqual(look[colorScheme]);
  }

  const served = await raw(request, path);
  const titles = served.$('head title').toArray().map(t => served.$(t).text());
  const homeTitle = home.$('head title').first().text();
  expect.soft(titles, `The 404's head has ${titles.length} <title> tags (${titles.map(t => `"${t}"`).join(', ')}); it needs exactly one, its own`).toHaveLength(1);
  expect.soft(titles.filter(t => t === homeTitle), `The 404 carries the homepage title "${homeTitle}"`).toEqual([]);
  expect.soft(robotsDirectives(served), 'The 404 must ask not to be indexed').toMatch(/noindex|none/i);
  expect.soft(linkHrefs(served.$, 'canonical'), 'The 404 must not declare a canonical address').toEqual([]);
  expect.soft(metas(served.$, 'og:url'), 'The 404 must not name an og:url').toEqual([]);
  const [homeOgTitle] = metas(home.$, 'og:title');
  expect.soft(metas(served.$, 'og:title').filter(t => t === homeOgTitle), `The 404 reuses the homepage's og:title "${homeOgTitle}", so a shared bad link previews as the app`).toEqual([]);
  const [homeDescription] = metas(home.$, 'description');
  expect.soft(metas(served.$, 'description').filter(d => d === homeDescription), `The 404 reuses the homepage description "${clip(homeDescription ?? '', 60)}"`).toEqual([]);
});

test('SEO-08 a borrower can carry saved loans to a new address before the app moves', async ({ page, browser, baseURL }, testInfo) => {
  knownIssue('SEO-08');
  // The written host decision this issue also asks for is a policy record no test can check.
  // The current address: a returning borrower with eight loans and two dated records.
  await openApp(page);
  const COPY = /download|backup|export|save .*(file|copy)/i;
  const RESTORE = /restore|import|upload|\bload\b|open .*(file|backup)/i;
  const offered = [...new Set((await page.getByRole('button', { name: COPY }).or(page.getByRole('link', { name: COPY })).allInnerTexts()).map(name => name.trim()))]
    .filter(name => !RESTORE.test(name))
    .sort((a, b) => Number(/backup/i.test(b)) - Number(/backup/i.test(a)));

  // A new address. localStorage belongs to an origin and does not follow a redirect, so the app opens there
  // with nothing saved, exactly as it does in this fresh context.
  const elsewhere = await browser.newContext({ baseURL });
  const there = await elsewhere.newPage();
  there.on('dialog', dialog => dialog.accept()); // a restore may ask before it writes
  await openApp(there, { seeded: false });
  const restoreControl = () => there.getByRole('button', { name: RESTORE }).or(there.getByRole('link', { name: RESTORE }));
  const fileInputs = await there.locator('input[type="file"]').count();
  const restoreControls = await restoreControl().count();
  expect(fileInputs + restoreControls, `At a new address Loan Desk opens empty and offers no way to bring the 8 loans along: ${fileInputs} file inputs and ${restoreControls} restore or import controls on its first screen, while the current address offers only ${offered.map(n => `"${n}"`).join(', ') || 'nothing'}, which no screen reads back`).toBeGreaterThan(0);

  // Take each file the current address offers and load it at the new one until the loans arrive.
  const files = [];
  for (const name of offered) {
    const control = page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true })).first();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5_000 }).catch(() => null), control.click()]);
    if (download) {
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      files.push(file);
    }
  }
  for (const file of files) {
    if (await there.locator('input[type="file"]').count()) {
      await there.locator('input[type="file"]').first().setInputFiles(file);
    } else {
      const [chooser] = await Promise.all([there.waitForEvent('filechooser', { timeout: 5_000 }), restoreControl().first().click()]);
      await chooser.setFiles(file);
    }
    // A restore may reload the page, so a read that lands mid-navigation counts as not there yet.
    const count = async () => (await stored(there, KEYS.loans).catch(() => null))?.length ?? 0;
    for (const until = Date.now() + 3_000; (await count()) !== LOANS.length && Date.now() < until;) await there.waitForTimeout(100);
    if ((await count()) === LOANS.length) break;
  }
  await there.waitForLoadState();
  const loansThere = await stored(there, KEYS.loans);
  await elsewhere.close();
  expect(loansThere?.map(l => l.id), `After loading ${files.length} files the current address offers (${offered.join(', ')}), ${loansThere?.length ?? 0} of 8 loans reached the new address`).toEqual(LOANS.map(l => l.id));
});

test('SEO-09 the Plans note links the federal Repayment Calculator by its current name and address', async ({ page }) => {
  knownIssue('SEO-09');
  await openApp(page);
  await goTo(page, 'plans');
  const text = await page.locator('#main').innerText();
  const oldName = text.match(/Loan Simulator/gi) ?? [];
  const federal = (await hrefs(page.getByRole('link'))).filter(href => new URL(href).hostname.endsWith('studentaid.gov'));
  const current = (await hrefs(page.getByRole('link', { name: /Repayment Calculator/i })))
    .filter(href => { const u = new URL(href); return u.hostname === 'studentaid.gov' && /^\/repayment-calculator(\/|$)/.test(u.pathname); });
  // Sentences that credit the federal tool with holding income flat, which its documentation does not say.
  const credits = text.split(/(?<=[.!?])\s+|\n+/)
    .filter(s => /Loan Simulator|Repayment Calculator|federal (tool|calculator|simulator)/i.test(s) && /income/i.test(s) && /\b(flat|constant|held|holds?)\b/i.test(s));

  expect.soft(oldName.length, `The Plans tab names the retired federal "Loan Simulator" ${oldName.length} times; the tool is now called the Repayment Calculator`).toBe(0);
  const stale = federal.filter(href => /loan-simulator/i.test(href));
  expect.soft(stale, `The federal tool link points at its old address ${stale.join(', ')} instead of https://studentaid.gov/repayment-calculator/`).toEqual([]);
  expect.soft(current.length, `No Plans tab link is named "Repayment Calculator" and points at https://studentaid.gov/repayment-calculator/ (studentaid.gov links: ${federal.join(', ') || 'none'})`).toBeGreaterThan(0);
  expect.soft(credits, 'The Plans tab credits the federal tool with holding income flat, which its own documentation does not state').toEqual([]);
});

test('AGENT-01 a browser agent can list read-only Loan Desk tools for plan and payoff figures', async ({ playwright, baseURL }) => {
  knownIssue('AGENT-01');
  // A browser that exposes WebMCP: Chromium ships it behind this flag. Where a build has no API at all,
  // webmcpStandIn installs a recording stand-in instead. Only this test runs with the flag.
  const browser = await playwright.chromium.launch({ args: ['--enable-experimental-web-platform-features'] });
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const origin = new URL(baseURL).origin;
    const offPage = [];
    await context.route(url => url.origin !== origin && /^https?:$/.test(url.protocol), route => {
      offPage.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(webmcpStandIn);
    const sentinel = 'Sentinel loan 7Q4X';
    await openApp(page, { loans: LOANS.map((loan, i) => (i === 0 ? { ...loan, nickname: sentinel } : loan)) });
    await page.waitForLoadState('networkidle');
    const tools = (await waitForTools(page)) ?? [];
    const api = await page.evaluate(() => ((document.modelContext ?? navigator.modelContext)?.auditStandIn ? 'a recording stand-in for WebMCP' : "Chromium's WebMCP (document.modelContext)"));
    expect(tools.length, `With ${api} available, Loan Desk registers ${tools.length} tools, so a browser agent has to work the forms to get plan and payoff figures`).toBeGreaterThan(0);

    const about = tools.map(t => `${t.name} ${t.title} ${t.description}`).join(' ');
    expect.soft(tools.filter(t => !t.readOnly).map(t => t.name), 'Every tool only estimates, so each must be marked readOnlyHint: true').toEqual([]);
    expect.soft(about, 'The tools must cover repayment plan estimates').toMatch(/plan/i);
    expect.soft(about, 'The tools must cover the payoff, or debt-free, date').toMatch(/payoff|pay off|debt[- ]free/i);
    expect.soft(tools.filter(t => JSON.stringify(t).includes(sentinel)).map(t => t.name), 'No tool may expose a saved loan').toEqual([]);
    expect.soft(await runToolsAndCompareStorage(page), 'Running the tools must not write to storage').toBe(true);
    expect.soft(offPage, 'Nothing may leave the page').toEqual([]);
  } finally {
    await browser.close();
  }
});

// Regression guards for what the audit's SEO and agentic leads verified is good.

test('server HTML carries the title, description, language, viewport and charset that the page shows', async ({ request, page }) => {
  const { $ } = await raw(request, '/');
  const served = { lang: $('html').attr('lang') ?? '', title: $('head title').first().text(), description: metas($, 'description')[0] ?? '' };
  expect(served.lang, 'html lang').toMatch(/^en\b/i);
  expect(($('meta[charset]').attr('charset') ?? '').toLowerCase(), 'meta charset').toBe('utf-8');
  expect(metas($, 'viewport')[0] ?? '', 'meta viewport').toMatch(/width=device-width/);
  expect($('head title').length, 'exactly one <title>').toBe(1);
  expect(served.title.trim(), 'title text').not.toBe('');
  expect(served.description.trim(), 'meta description').not.toBe('');
  await openApp(page);
  const shown = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, description: document.querySelector('meta[name="description"]')?.content ?? '' }));
  expect(shown, 'What renders must match what the server sends').toEqual(served);
});

test('crawlers and AI fetchers get the same page as a browser, and nothing tells them to stay away', async ({ request }) => {
  const responses = {};
  for (const [name, userAgent] of Object.entries(AGENTS)) responses[name] = await raw(request, '/', { userAgent });
  const normalised = html => html.replace(/\snonce="[^"]*"/g, '');
  for (const [name, response] of Object.entries(responses)) {
    expect(response.status, `${name} status`).toBe(200);
    expect(normalised(response.html) === normalised(responses.browser.html), `${name} gets different HTML from a browser (${response.html.length} against ${responses.browser.html.length} bytes)`).toBe(true);
  }
  expect(robotsDirectives(responses.browser), 'Nothing on / may say noindex').not.toMatch(/noindex|\bnone\b/i);
  const robots = await request.get('/robots.txt');
  if (robots.status() === 200) {
    const rules = await robots.text();
    const blocked = Object.keys(AGENTS).filter(name => robotsBlocksSite(rules, name === 'browser' ? '*' : name));
    expect(blocked, 'robots.txt must not shut these readers out of the site').toEqual([]);
  } else {
    expect(robots.status(), 'Without a robots.txt the answer must be 404, which allows everything').toBe(404);
  }
});

test('an unknown address answers a real 404 that asks not to be indexed', async ({ request }) => {
  for (const path of [`/no-such-page-${Date.now()}`, '/loans/2024/edit']) {
    const response = await raw(request, path);
    expect(response.status, `${path} must answer 404, not a page that looks like content`).toBe(404);
    expect(robotsDirectives(response), `${path} must ask not to be indexed`).toMatch(/noindex/i);
  }
});

test('links to other sites say where they go and do not hand over the page', async ({ page, request, baseURL }) => {
  const own = [...ownOrigins((await raw(request, '/')).$, baseURL)];
  const outbound = new Map();
  const collect = async where => {
    const links = await page.getByRole('link').evaluateAll((anchors, origins) => anchors
      .filter(a => /^https?:$/.test(a.protocol) && !origins.includes(a.origin))
      .map(a => ({ name: (a.getAttribute('aria-label') ?? a.innerText).trim(), href: a.href, rel: a.rel })), own);
    for (const link of links) outbound.set(`${link.href} ${link.name}`, { ...link, where });
  };
  await openApp(page, { seeded: false });
  await collect('first run');
  await seed(page);
  await page.reload();
  await page.locator('#main').waitFor();
  for (const tab of ['loans', 'plans', 'payoff', 'records']) {
    await goTo(page, tab);
    await collect(tab);
  }
  const links = [...outbound.values()];
  expect(links.length, 'The app links out (studentaid.gov, Cense)').toBeGreaterThan(0);
  expect(links.filter(l => !l.name || /^(click here|here|link|more|read more|learn more|this|this link|website)$/i.test(l.name)), 'Every outbound link says where it goes').toEqual([]);
  expect(links.filter(l => !l.rel.split(/\s+/).includes('noreferrer')), 'Every outbound link carries rel="noreferrer" (which implies noopener), so the destination gets neither this page nor its address').toEqual([]);
});

test('a payoff answer reads as text, and its heading, announcement and chart label agree', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'payoff');
  const heading = page.getByRole('heading', { level: 2, name: /sooner/ });
  const announcement = page.getByRole('status').filter({ hasText: /debt free in/i });
  const chart = page.getByRole('img', { name: /finish in/i });
  await expect(heading, 'The takeaway is a heading').toHaveCount(1);
  await expect(announcement, 'The same result is announced as a sentence').toHaveCount(1);
  await expect(chart, 'The chart has a text alternative that names the finish date').toHaveCount(1);
  const [said, announced, label] = [await heading.innerText(), await announcement.innerText(), await chart.getAttribute('aria-label')];
  const sooner = t => t.match(/(\d+ years?(?: \d+ months?)?|\d+ months?) sooner/)?.[1];
  const finish = announced.match(/debt free in ([A-Z][a-z]+) (\d{4})/);
  expect(sooner(said), `Heading "${said}" and announcement "${announced}" must give the same time saved`).toBe(sooner(announced));
  expect(finish, `The announcement names a month and year: "${announced}"`).not.toBeNull();
  expect(label, `Chart label "${label}" must give the announced finish month`).toContain(`finish in ${finish[1].slice(0, 3)} ${finish[2]}`);
});

test('the page is served static and nothing it loads or sends goes to another origin', async ({ request, page, baseURL }) => {
  const home = await raw(request, '/');
  expect(home.headers['cache-control'] ?? '', '/ is served as a static, cacheable page').not.toMatch(/no-store|private/i);
  const own = ownOrigins(home.$, baseURL);
  const references = [
    ...home.$('script[src], img[src], iframe[src], source[src], audio[src], video[src]').toArray().map(e => home.$(e).attr('src')),
    ...['stylesheet', 'preload', 'modulepreload', 'prefetch', 'preconnect', 'dns-prefetch', 'icon', 'apple-touch-icon', 'manifest'].flatMap(rel => linkHrefs(home.$, rel)),
  ];
  expect(references.filter(ref => !own.has(new URL(ref, baseURL).origin)), 'The server HTML of / loads only its own assets').toEqual([]);

  const origin = new URL(baseURL).origin;
  const offPage = [];
  await page.context().route(url => url.origin !== origin && /^https?:$/.test(url.protocol), route => {
    offPage.push(route.request().url());
    return route.abort();
  });
  await openApp(page);
  for (const tab of ['plans', 'payoff', 'records', 'loans']) await goTo(page, tab);
  expect(offPage.filter(url => !own.has(new URL(url).origin)), 'Nothing a borrower loads or does sends a request to another origin').toEqual([]);
});
