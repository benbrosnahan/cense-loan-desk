// Helpers used only by seo-agentic.spec.mjs: reading the server's HTML the way a crawler does, image headers,
// a same-origin crawl, the painted page colour, robots.txt rules and a WebMCP probe. Nothing here contacts a host
// other than the app under test.
import * as cheerio from 'cheerio';

/** User agents of readers that fetch the raw HTML, as they announce themselves. */
export const AGENTS = {
  browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  Googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

/** GETs a path from the app under test without running any JavaScript, as a crawler that reads raw HTML does. */
export async function raw(request, path, { userAgent } = {}) {
  const res = await request.get(path, { headers: userAgent ? { 'user-agent': userAgent } : {}, maxRedirects: 0 });
  const html = await res.text();
  return { status: res.status(), headers: res.headers(), html, $: cheerio.load(html) };
}

/** Values of every <meta> whose property or name is one of keys, in document order. */
export const metas = ($, ...keys) =>
  $('meta').toArray()
    .filter(m => keys.includes($(m).attr('property') ?? $(m).attr('name')))
    .map(m => $(m).attr('content') ?? '');

/** hrefs of every <link> whose rel has the token. */
export const linkHrefs = ($, token) =>
  $('link[rel][href]').toArray()
    .filter(l => ($(l).attr('rel') ?? '').toLowerCase().split(/\s+/).includes(token))
    .map(l => $(l).attr('href'));

export const jsonLdBlocks = $ => $('script[type="application/ld+json"]').toArray().map(s => $(s).text());

/** Text a reader gets from the server HTML: every text node outside script, style, noscript and template. */
export function readableText($) {
  const out = [];
  const walk = node => {
    if (node.type === 'text') out.push(node.data);
    else if (node.type === 'tag' && !['noscript', 'template'].includes(node.name)) for (const c of node.children ?? []) walk(c);
  };
  for (const n of $('body').toArray()) walk(n);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export const words = text => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of the distinct words of `shown` that also occur in `text`, with the missing words. */
export function coverage(shown, text) {
  const want = [...new Set(words(shown))];
  const have = new Set(words(text));
  const missing = want.filter(w => !have.has(w));
  return { total: want.length, found: want.length - missing.length, share: want.length ? (want.length - missing.length) / want.length : 0, missing };
}

export const isAbsoluteHttp = value => {
  try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
};

/**
 * Origins that count as this site: the app under test, plus the address the page itself declares in its
 * canonical or og:url (a local build names its production host there). Used to read links and asset
 * references; requests still only ever go to the app under test.
 */
export function ownOrigins($, baseURL) {
  const origins = new Set([new URL(baseURL).origin]);
  for (const href of [...linkHrefs($, 'canonical'), ...metas($, 'og:url')]) {
    if (isAbsoluteHttp(href)) origins.add(new URL(href).origin);
  }
  return origins;
}

/** The path and query of a URL that belongs to this site, to request it from the app under test instead. */
export const appPath = (href, base) => {
  const u = new URL(href, base);
  return u.pathname + u.search;
};

/** Format and pixel size read from the file header: PNG, ICO, GIF, JPEG, BMP, WebP, or SVG (no pixel size). */
export function imageInfo(buffer) {
  const b = Buffer.from(buffer ?? []);
  const ascii = (start, end) => b.subarray(start, end).toString('latin1');
  if (b.length >= 26 && b.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 6 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) {
    let width = 0;
    let height = 0;
    for (let i = 0, n = b.readUInt16LE(4); i < n && 6 + 16 * (i + 1) <= b.length; i++) {
      const w = b[6 + 16 * i] || 256;
      const h = b[7 + 16 * i] || 256;
      if (w * h > width * height) { width = w; height = h; }
    }
    return { format: 'ico', width, height };
  }
  if (b.length >= 10 && ascii(0, 3) === 'GIF') return { format: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return { format: 'jpeg', width: 0, height: 0 };
  }
  if (b.length >= 26 && ascii(0, 2) === 'BM') return { format: 'bmp', width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const chunk = ascii(12, 16);
    if (chunk === 'VP8X') return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
    return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  const start = ascii(0, 512).trimStart().toLowerCase();
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return { format: 'svg', width: 0, height: 0 };
  return { format: 'unknown', width: 0, height: 0 };
}

/** GETs an image this site references (from the app under test) and reads its header. */
export async function fetchImage(request, href, base) {
  const path = appPath(href, base);
  const res = await request.get(path);
  const body = res.status() === 200 ? await res.body() : Buffer.alloc(0);
  return { href, path, status: res.status(), type: res.headers()['content-type'] ?? '', body, ...imageInfo(body) };
}

export const describeImage = i =>
  `${i.href} answers ${i.status}${i.status === 200 ? ` (${i.format}${i.width ? ` ${i.width}x${i.height}` : ''})` : ''}`;

/** Pixels with any transparency, decoded by the browser itself (a data: URL never taints the canvas). */
export const transparentPixels = (page, image) =>
  page.evaluate(async ({ b64, type }) => {
    const img = new Image();
    img.src = `data:${type};base64,${b64}`;
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) n++;
    return n;
  }, { b64: image.body.toString('base64'), type: image.type.split(';')[0] || 'image/png' });

/**
 * Breadth-first crawl of plain <a href> links in server HTML, staying on this site and never running JavaScript.
 * Returns each page's path, status and readable text.
 */
export async function crawl(request, baseURL, own, { maxPages = 12, maxDepth = 2 } = {}) {
  const seen = new Set(['/']);
  const queue = [['/', 0]];
  const pages = [];
  while (queue.length && pages.length < maxPages) {
    const [path, depth] = queue.shift();
    const res = await request.get(path);
    const type = res.headers()['content-type'] ?? '';
    if (res.status() !== 200 || !type.includes('text/html')) { pages.push({ path, status: res.status(), text: '' }); continue; }
    const $ = cheerio.load(await res.text());
    pages.push({ path, status: 200, text: readableText($) });
    if (depth >= maxDepth) continue;
    for (const a of $('a[href]').toArray()) {
      let u;
      try { u = new URL($(a).attr('href'), new URL(path, baseURL)); } catch { continue; }
      if (!own.has(u.origin)) continue;
      const next = u.pathname + u.search;
      if (!seen.has(next)) { seen.add(next); queue.push([next, depth + 1]); }
    }
  }
  return pages;
}

/** True when robots.txt keeps this user agent away from the whole site (Disallow: / with no Allow: /). */
export function robotsBlocksSite(text, agent) {
  const groups = [];
  let group = null;
  let inAgents = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!inAgents) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
      inAgents = true;
    } else {
      inAgents = false;
      if (group && (key === 'allow' || key === 'disallow')) group.rules.push({ key, value });
    }
  }
  const name = agent.toLowerCase();
  const named = groups.filter(g => g.agents.some(a => a !== '*' && name.includes(a)));
  const rules = (named.length ? named : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
  const blocked = rules.some(r => r.key === 'disallow' && ['/', '/*'].includes(r.value));
  const reopened = rules.some(r => r.key === 'allow' && ['/', '/*', '/$'].includes(r.value));
  return blocked && !reopened;
}

/**
 * The colour a person sees at two corners of the viewport: the first ancestor with a background, else the
 * canvas, which takes the root's background or, when the root has none, the body's.
 */
export const paintedBackground = page =>
  page.evaluate(() => {
    const visible = c => c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c);
    const bg = el => getComputedStyle(el).backgroundColor;
    const canvas = [document.documentElement, document.body].map(bg).find(visible) ?? 'rgb(255, 255, 255)';
    return [[2, 2], [innerWidth - 3, innerHeight - 3]].map(([x, y]) => {
      for (let el = document.elementFromPoint(x, y); el && el !== document.documentElement && el !== document.body; el = el.parentElement) {
        if (visible(bg(el))) return bg(el);
      }
      return canvas;
    });
  });

/**
 * Init script for a page that should behave like a browser that exposes WebMCP. When the browser already has
 * the API (Chromium with experimental web platform features), it is left alone. When it has none, a small
 * recording stand-in is installed on both document and navigator, so either shape of registration shows up.
 */
export function webmcpStandIn() {
  if (document.modelContext || navigator.modelContext) return;
  const tools = new Map();
  const mc = new EventTarget();
  mc.registerTool = (tool, options) => {
    tools.set(tool?.name, tool);
    options?.signal?.addEventListener?.('abort', () => tools.delete(tool?.name));
    return Promise.resolve();
  };
  mc.unregisterTool = name => { tools.delete(typeof name === 'string' ? name : name?.name); };
  mc.provideContext = ({ tools: list = [] } = {}) => { tools.clear(); for (const t of list) tools.set(t?.name, t); };
  mc.clearContext = () => tools.clear();
  mc.getTools = async () => [...tools.values()];
  mc.executeTool = async (tool, input) => (tools.get(tool?.name ?? tool) ?? tool)?.execute?.(input, {});
  mc.auditStandIn = true;
  for (const target of [document, navigator]) Object.defineProperty(target, 'modelContext', { value: mc, configurable: true });
}

/** The tools the page has registered, as plain data. null when the page has no WebMCP object at all. */
export const listTools = page =>
  page.evaluate(async () => {
    const mc = document.modelContext ?? navigator.modelContext;
    if (!mc?.getTools) return null;
    const list = await mc.getTools();
    return list.map(t => ({
      name: String(t.name ?? ''),
      title: String(t.title ?? ''),
      description: String(t.description ?? ''),
      readOnly: t.annotations?.readOnlyHint === true,
      schema: typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema ?? null),
    }));
  });

/** Polls for registered tools for up to `ms`, returning as soon as any appear. */
export async function waitForTools(page, ms = 1000) {
  const until = Date.now() + ms;
  let tools = await listTools(page);
  while ((tools?.length ?? 0) === 0 && Date.now() < until) {
    await page.waitForTimeout(100);
    tools = await listTools(page);
  }
  return tools;
}

/** Runs every registered tool once with empty input and reports whether localStorage changed. */
export const runToolsAndCompareStorage = page =>
  page.evaluate(async () => {
    const mc = document.modelContext ?? navigator.modelContext;
    const snapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
    const before = snapshot();
    for (const tool of await mc.getTools()) {
      const run = Promise.resolve().then(() => mc.executeTool(tool, {}));
      await Promise.race([run.catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    return before === snapshot();
  });
