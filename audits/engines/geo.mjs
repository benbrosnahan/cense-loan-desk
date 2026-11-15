// GEO scan. Adapted from PerfMaster's GEO engine.

import * as cheerio from 'cheerio';
import { validateMetaFromHtml, validateStructuredDataFromHtml } from './seo-validators.mjs';

export { validateMetaFromHtml, validateStructuredDataFromHtml };

const USER_AGENT = 'cense-audit-kit';

// --- Known LLM / AI bots ---

const LLM_BOTS = [
  { name: 'GPTBot', owner: 'OpenAI' },
  { name: 'ChatGPT-User', owner: 'OpenAI' },
  { name: 'ClaudeBot', owner: 'Anthropic' },
  { name: 'anthropic-ai', owner: 'Anthropic' },
  { name: 'CCBot', owner: 'Common Crawl' },
  { name: 'Google-Extended', owner: 'Google' },
  { name: 'GoogleOther', owner: 'Google' },
  { name: 'PerplexityBot', owner: 'Perplexity' },
  { name: 'cohere-ai', owner: 'Cohere' },
  { name: 'Bytespider', owner: 'ByteDance' },
  { name: 'Amazonbot', owner: 'Amazon' },
  { name: 'Meta-ExternalAgent', owner: 'Meta' },
  { name: 'Applebot-Extended', owner: 'Apple' },
  { name: 'Diffbot', owner: 'Diffbot' },
];

// --- Helpers ---

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function safeFetch(url, opts = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeout ?? 15000);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, ...opts.headers },
    });
    clearTimeout(t);
    return r;
  } catch {
    clearTimeout(t);
    return null;
  }
}

// --- robots.txt parsing ---

function parseRobotsTxt(text) {
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const key = line.slice(0, ci).trim().toLowerCase();
    const val = line.slice(ci + 1).trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) {
        cur = { agents: [], rules: [] };
        blocks.push(cur);
      }
      cur.agents.push(val);
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      cur.rules.push({ type: key, path: val });
    }
  }
  return blocks;
}

function botAccess(blocks, bot) {
  for (const b of blocks) {
    if (b.agents.some(a => a.toLowerCase() === bot.toLowerCase())) {
      if (b.rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === '/*'))) return 'blocked';
      if (b.rules.every(r => r.type === 'allow') || b.rules.length === 0) return 'allowed';
      return 'partial';
    }
  }
  for (const b of blocks) {
    if (b.agents.includes('*')) {
      if (b.rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === '/*'))) return 'blocked-wildcard';
      return 'allowed';
    }
  }
  return 'allowed';
}

// --- Page data extraction ---

function extractPage(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const robotsMeta = $('meta[name="robots"]').attr('content') || '';
  const lang = $('html').attr('lang') || '';

  const og = {};
  $('meta[property^="og:"]').each((_, el) => {
    og[$(el).attr('property') || ''] = $(el).attr('content') || '';
  });

  const twitter = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    twitter[$(el).attr('name') || ''] = $(el).attr('content') || '';
  });
  // Also check property-based twitter tags (some sites use property instead of name)
  $('meta[property^="twitter:"]').each((_, el) => {
    twitter[$(el).attr('property') || ''] = $(el).attr('content') || '';
  });

  const headings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    headings.push({
      level: parseInt(el.tagName?.[1] || '0', 10) || 0,
      text: $(el).text().trim().replace(/\s+/g, ' ').slice(0, 200),
    });
  });

  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { jsonLd.push(JSON.parse($(el).html() || '')); } catch { /* skip invalid JSON-LD */ }
  });

  const microdata = [];
  $('[itemtype]').each((_, el) => {
    microdata.push($(el).attr('itemtype') || '');
  });

  // Visible text word count
  const $body = $('body').clone();
  $body.find('script, style, noscript, svg, path').remove();
  const text = $body.text().replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean);

  // Block-level chunks (paragraphs, list items, blockquotes, table cells, headings,
  // dt/dd) for the SSR↔CSR diff. Anything ≥ 20 chars after whitespace collapse.
  const bodyChunks = [];
  $body.find('p, li, blockquote, td, dt, dd, h1, h2, h3, h4, h5, h6').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length >= 20) bodyChunks.push(t.slice(0, 500));
  });

  return { title, description, canonical, robotsMeta, lang, og, twitter, headings, jsonLd, microdata, wordCount: words.length, bodyChunks };
}

// --- Audit: robots.txt ---

// A missing robots.txt and an unreadable one are different facts. A real 404 means
// crawlers are unrestricted, so it stays a pass. An unreachable one is `unknown` and
// is not scored at all. `measured: false` means the fetch taught us nothing.
async function auditRobots(origin) {
  const res = await safeFetch(`${origin}/robots.txt`, { timeout: 10000 });

  if (!res) {
    return {
      found: false,
      measured: false,
      unmeasuredReason: 'robots.txt fetch failed (network error or timeout)',
      bots: LLM_BOTS.map(b => ({ ...b, status: 'unknown' })),
    };
  }

  const raw = await res.text().catch(() => '');

  // A real 404 is a real answer: no robots.txt means nothing is disallowed.
  if (res.status === 404 || res.status === 410) {
    return { found: false, measured: true, bots: LLM_BOTS.map(b => ({ ...b, status: 'no-robots-txt' })) };
  }

  if (!res.ok) {
    return {
      found: false,
      measured: false,
      unmeasuredReason: `robots.txt returned HTTP ${res.status}`,
      bots: LLM_BOTS.map(b => ({ ...b, status: 'unknown' })),
    };
  }

  const blocks = parseRobotsTxt(raw);
  return { found: true, measured: true, bots: LLM_BOTS.map(b => ({ ...b, status: botAccess(blocks, b.name) })) };
}

// --- Audit: SSR fetch ---

async function fetchSSR(url) {
  const res = await safeFetch(url, { timeout: 15000 });
  if (!res) {
    return { html: '', data: null, status: 0, measured: false, unmeasuredReason: 'SSR fetch failed (network error or timeout)' };
  }
  const html = await res.text();

  // A non-2xx body is not the site. An error document usually has a <title>, so it
  // must not count as server-rendered content. `measured: false` stops that.
  if (!res.ok) {
    return {
      html,
      data: extractPage(html),
      status: res.status,
      measured: false,
      unmeasuredReason: `server returned HTTP ${res.status}`,
    };
  }

  return { html, data: extractPage(html), status: res.status, measured: true };
}

// --- Audit: LLM discovery ---

// Is this 200 actually the text file we asked for, or a catch-all HTML rewrite?
// SPA hosts answer every path with a 200 and the homepage, so `.ok` alone is not proof.
function isPlausibleTextFile(res, body) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml')) return false;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<?xml')) return false;
  return body.trim().length > 0;
}

// Same question for a JSON manifest.
function isPlausibleJson(res, body) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) return false;
  try {
    const v = JSON.parse(body);
    return !!v && typeof v === 'object';
  } catch {
    return false;
  }
}

async function checkDiscovery(origin, url) {
  const [llms, llmsFull, md, aiPlugin] = await Promise.all([
    safeFetch(`${origin}/llms.txt`, { timeout: 10000 }),
    safeFetch(`${origin}/llms-full.txt`, { timeout: 10000 }),
    safeFetch(url, { headers: { Accept: 'text/markdown' }, timeout: 10000 }),
    safeFetch(`${origin}/.well-known/ai-plugin.json`, { timeout: 10000 }),
  ]);

  let llmsTxtResult = { found: false };
  if (llms?.ok) {
    const text = await llms.text();
    if (isPlausibleTextFile(llms, text)) {
      llmsTxtResult = { found: true, preview: text.slice(0, 1500) };
    }
  }

  let llmsFullTxtResult = { found: false };
  if (llmsFull?.ok) {
    const text = await llmsFull.text();
    if (isPlausibleTextFile(llmsFull, text)) {
      llmsFullTxtResult = { found: true, size: text.length };
    }
  }

  const mdContentType = md?.headers?.get('content-type') || '';
  const markdownResult = { served: mdContentType.includes('text/markdown'), contentType: mdContentType };

  // The manifest must at least parse as JSON.
  let aiPluginResult = { found: false };
  if (aiPlugin?.ok) {
    const body = await aiPlugin.text().catch(() => '');
    aiPluginResult = { found: isPlausibleJson(aiPlugin, body) };
  }

  return { llmsTxt: llmsTxtResult, llmsFullTxt: llmsFullTxtResult, markdown: markdownResult, aiPlugin: aiPluginResult };
}

// --- Compare SSR vs CSR ---

function comparePages(ssrData, csrData) {
  if (!ssrData || !csrData) return { error: 'Missing data for comparison' };

  const titleStatus = !ssrData.title ? 'missing-ssr' : ssrData.title === csrData.title ? 'match' : 'different';
  const descStatus = !ssrData.description ? 'missing-ssr' : ssrData.description === csrData.description ? 'match' : 'different';

  // OG comparison
  const ogKeys = Array.from(new Set([...Object.keys(ssrData.og), ...Object.keys(csrData.og)]));
  const ogComp = ogKeys.map(k => ({ key: k, ssr: ssrData.og[k] || null, csr: csrData.og[k] || null, match: ssrData.og[k] === csrData.og[k] }));

  // Twitter comparison
  const twKeys = Array.from(new Set([...Object.keys(ssrData.twitter), ...Object.keys(csrData.twitter)]));
  const twComp = twKeys.map(k => ({ key: k, ssr: ssrData.twitter[k] || null, csr: csrData.twitter[k] || null, match: ssrData.twitter[k] === csrData.twitter[k] }));

  // H1
  const ssrH1 = ssrData.headings.filter(h => h.level === 1).map(h => h.text);
  const csrH1 = csrData.headings.filter(h => h.level === 1).map(h => h.text);
  const h1Status = ssrH1.length === 0 ? 'missing-ssr' : JSON.stringify(ssrH1) === JSON.stringify(csrH1) ? 'match' : 'different';

  // Content parity: how similar the SSR (raw HTML) and CSR (post-JS DOM) word counts are.
  // Always min/max, so the value is in [0, 100] whichever side is bigger. `gapDirection` says which.
  //
  //   ssrLarger  SSR has more words. The gap is visible to LLMs but not to users (collapsed UI,
  //              screen-reader text, cookie banners JS removes). Usually not a GEO problem.
  //   csrLarger  CSR has more words. The gap is JS-injected content invisible to LLM crawlers.
  //              This is the real GEO problem.
  //   even       SSR matches CSR. Healthy.
  //   suspect    The measurement failed, so the diff is not trusted and parity defaults to 100.
  //              Either both sides are empty, or CSR came back almost empty (< 50 words) while
  //              SSR has real content (> 200 words): a cookie wall, a WAF, a hydration crash.
  const ssrW = ssrData.wordCount;
  const csrW = csrData.wordCount;
  let parity;
  let gapDirection;
  if (ssrW === 0 && csrW === 0) {
    parity = 100;
    gapDirection = 'suspect';
  } else if (ssrW > 200 && csrW < 50) {
    parity = 100;
    gapDirection = 'suspect';
  } else {
    const lo = Math.min(ssrW, csrW);
    const hi = Math.max(ssrW, csrW);
    parity = hi === 0 ? 100 : Math.round((lo / hi) * 100);
    gapDirection = ssrW === csrW ? 'even' : ssrW > csrW ? 'ssrLarger' : 'csrLarger';
  }

  // Structured data type extraction
  const flatten = (arr) =>
    arr.flatMap(j => {
      const obj = j;
      if (Array.isArray(obj['@graph'])) {
        return obj['@graph'].map(g => g['@type'] || 'Unknown');
      }
      return [obj['@type'] || 'Unknown'];
    }).filter(Boolean);

  const ssrTypes = flatten(ssrData.jsonLd);
  const csrTypes = flatten(csrData.jsonLd);
  const typesOnlyCSR = csrTypes.filter(t => !ssrTypes.includes(t));
  const typesOnlySSR = ssrTypes.filter(t => !csrTypes.includes(t));

  // Heading diff, both directions
  const ssrHSet = new Set(ssrData.headings.map(h => `${h.level}:${h.text}`));
  const csrHSet = new Set(csrData.headings.map(h => `${h.level}:${h.text}`));
  const headingsOnlyCSR = csrData.headings.filter(h => !ssrHSet.has(`${h.level}:${h.text}`));
  const headingsOnlySSR = ssrData.headings.filter(h => !csrHSet.has(`${h.level}:${h.text}`));

  // Body chunks present on one side but not the other (whitespace-normalised exact match).
  // Capped to 30 chunks per side so the report stays compact.
  const ssrChunkSet = new Set(ssrData.bodyChunks);
  const csrChunkSet = new Set(csrData.bodyChunks);
  const bodyChunksOnlySSR = ssrData.bodyChunks.filter(c => !csrChunkSet.has(c)).slice(0, 30);
  const bodyChunksOnlyCSR = csrData.bodyChunks.filter(c => !ssrChunkSet.has(c)).slice(0, 30);

  return {
    title: { status: titleStatus, ssr: ssrData.title, csr: csrData.title },
    description: { status: descStatus, ssr: ssrData.description, csr: csrData.description },
    og: ogComp,
    twitter: twComp,
    h1: { status: h1Status, ssr: ssrH1, csr: csrH1 },
    parity: {
      ssrWords: ssrData.wordCount,
      csrWords: csrData.wordCount,
      pct: parity,
      gapDirection,
      ssrChunkCount: ssrData.bodyChunks.length,
      csrChunkCount: csrData.bodyChunks.length,
      onlyInSSR: bodyChunksOnlySSR,
      onlyInCSR: bodyChunksOnlyCSR,
    },
    structuredData: { ssrTypes, csrTypes, onlyCSR: typesOnlyCSR, onlySSR: typesOnlySSR, match: JSON.stringify(ssrTypes.sort()) === JSON.stringify(csrTypes.sort()) },
    headingsOnlyCSR,
    headingsOnlySSR,
    canonical: { ssr: ssrData.canonical, csr: csrData.canonical },
    robotsMeta: { ssr: ssrData.robotsMeta, csr: csrData.robotsMeta },
    lang: { ssr: ssrData.lang, csr: csrData.lang },
  };
}

// --- Scoring ---

function calcScores(robots, ssrData, csrData, comparison, discovery, ssr = { measured: true }) {
  const checks = [];
  const add = (cat, name, score, max, status, detail) =>
    checks.push({ category: cat, name, score, maxScore: max, status, detail });

  // A check whose evidence was never obtained scores 0 out of 0. It neither passes nor
  // drags the percentage down, because the percentage is computed over what was checked.
  const notAssessed = (cat, name) =>
    add(cat, name, 0, 0, 'info',
      `Not assessed — ${ssr.unmeasuredReason ?? 'server HTML could not be read'}. This is not a pass; nothing was checked.`);

  // ── LLM Crawl Access (20) ──
  const bots = robots.bots;
  if (!robots.measured) {
    add('LLM Crawl Access', 'AI Bot Access in robots.txt', 0, 0, 'info',
      `Not measured — ${robots.unmeasuredReason ?? 'robots.txt could not be read'}. This is not a pass; nothing was checked.`);
  } else {
    const allowed = bots.filter(b => b.status === 'allowed' || b.status === 'no-robots-txt').length;
    const blocked = bots.filter(b => b.status === 'blocked' || b.status === 'blocked-wildcard').length;
    const crawlPts = Math.round((allowed / Math.max(bots.length, 1)) * 20);
    const crawlPct = bots.length ? Math.round((allowed / bots.length) * 100) : 100;
    add('LLM Crawl Access', 'AI Bot Access in robots.txt', crawlPts, 20,
      blocked === 0 ? 'pass' : crawlPct >= 50 ? 'warn' : 'fail',
      robots.found
        ? `${allowed}/${bots.length} LLM bots allowed (${blocked} blocked)`
        : `No robots.txt (HTTP 404) — all ${bots.length} LLM bots unrestricted`);
  }

  const comp = comparison;
  const sd = ssrData;

  // ── Server-Side Content (30) ──
  // These four checks read the server HTML, so they are not scored if it was never usably retrieved.
  if (!ssr.measured) {
    notAssessed('Server-Side Content', 'Title in SSR');
    notAssessed('Server-Side Content', 'Meta Description in SSR');
    notAssessed('Server-Side Content', 'H1 Tag in SSR');
    notAssessed('Server-Side Content', 'Heading Hierarchy');
  } else {
    add('Server-Side Content', 'Title in SSR', sd?.title ? 5 : 0, 5,
      sd?.title ? 'pass' : 'fail',
      sd?.title ? `"${sd.title.slice(0, 80)}"` : 'No <title> in server-rendered HTML');

    add('Server-Side Content', 'Meta Description in SSR', sd?.description ? 7 : 0, 7,
      sd?.description ? 'pass' : 'fail',
      sd?.description ? `"${sd.description.slice(0, 120)}"` : 'Missing meta description — critical for LLM content summaries');

    const h1Status = comp.h1?.status;
    add('Server-Side Content', 'H1 Tag in SSR', h1Status === 'match' ? 5 : h1Status === 'different' ? 3 : 0, 5,
      h1Status === 'match' ? 'pass' : h1Status === 'missing-ssr' ? 'fail' : 'warn',
      h1Status === 'match' ? 'H1 present & matches CSR' : h1Status === 'missing-ssr' ? 'H1 only renders via JavaScript' : 'H1 text differs between SSR/CSR');

    const ssrHeadingCount = sd?.headings?.length || 0;
    const csrHeadingCount = csrData?.headings?.length || 0;
    add('Server-Side Content', 'Heading Hierarchy', ssrHeadingCount >= 3 ? 3 : ssrHeadingCount > 0 ? 1 : 0, 3,
      ssrHeadingCount >= 3 ? 'pass' : ssrHeadingCount > 0 ? 'warn' : 'fail',
      `${ssrHeadingCount} headings in SSR (${csrHeadingCount} in CSR)`);
  }

  const parityData = comp.parity;
  const p = parityData?.pct ?? 0;
  const ssrWdc = parityData?.ssrWords ?? 0;
  const csrWdc = parityData?.csrWords ?? 0;
  const gapDir = parityData?.gapDirection;
  // Score logic:
  //  • CSR > SSR (real GEO problem): score by parity threshold (LLMs miss the JS-injected delta)
  //  • SSR ≥ CSR (LLMs see everything users see): full credit
  //  • suspect (CSR scan failed): full credit, don't penalise on a broken measurement
  let parityScore;
  let parityStatus;
  let parityDetail;
  if (gapDir === 'suspect') {
    parityScore = 10;
    parityStatus = 'pass';
    parityDetail = `CSR scan returned only ${csrWdc} words (chrome) while SSR has ${ssrWdc} — measurement suspect (cookie wall / WAF / hydration error). Defaulting to pass.`;
  } else if (gapDir === 'ssrLarger' || gapDir === 'even') {
    parityScore = 10;
    parityStatus = 'pass';
    const delta = ssrWdc - csrWdc;
    parityDetail = delta > 0
      ? `SSR contains ${ssrWdc} words vs ${csrWdc} in CSR (parity ${p}%). LLMs see all body text; the ${delta}-word SSR-only delta is content JS removes from the user view (cookie banner / accessibility helpers / collapsed UI).`
      : `SSR matches CSR exactly (${ssrWdc} words, parity ${p}%) — LLMs see everything users see.`;
  } else {
    parityScore = p >= 80 ? 10 : p >= 50 ? 6 : p >= 25 ? 3 : 0;
    parityStatus = p >= 80 ? 'pass' : p >= 50 ? 'warn' : 'fail';
    const delta = csrWdc - ssrWdc;
    parityDetail = `CSR has ${delta} more words than SSR (${csrWdc} vs ${ssrWdc}, parity ${p}%) — that delta is JS-injected content invisible to LLM crawlers. Move it into the SSR template.`;
  }
  add('Server-Side Content', 'Body Text Parity (SSR vs CSR)', parityScore, 10, parityStatus, parityDetail);

  // ── Structured Data (20) ──
  const ssrLD = sd?.jsonLd?.length || 0;
  add('Structured Data', 'JSON-LD in SSR', ssrLD ? 12 : 0, 12,
    ssrLD ? 'pass' : 'fail',
    ssrLD ? `${ssrLD} JSON-LD block(s) in server-rendered HTML` : 'No JSON-LD structured data in SSR — LLMs rely heavily on this');

  const sdComp = comp.structuredData;
  const types = sdComp?.ssrTypes || [];
  const richTypes = ['Product', 'Article', 'Organization', 'WebPage', 'BreadcrumbList', 'FAQPage', 'HowTo', 'LocalBusiness', 'WebSite', 'ItemList'];
  const hasRich = types.some(t => richTypes.includes(t));
  add('Structured Data', 'Rich Schema Types', hasRich ? 8 : types.length ? 4 : 0, 8,
    hasRich ? 'pass' : types.length ? 'warn' : 'fail',
    types.length ? `Types in SSR: ${types.join(', ')}` : 'No schema types detected');

  // ── Social & Meta Tags (15) ──
  const og = sd?.og || {};
  const ogComplete = og['og:title'] && og['og:description'] && og['og:image'];
  add('Social & Meta Tags', 'Open Graph Tags', ogComplete ? 7 : Object.keys(og).length ? 3 : 0, 7,
    ogComplete ? 'pass' : Object.keys(og).length ? 'warn' : 'fail',
    ogComplete ? 'Complete OG tags (title + description + image)' : `Missing OG: ${['og:title', 'og:description', 'og:image'].filter(k => !og[k]).join(', ')}`);

  const tw = sd?.twitter || {};
  add('Social & Meta Tags', 'Twitter Card', tw['twitter:card'] ? 4 : 0, 4,
    tw['twitter:card'] ? 'pass' : 'warn',
    tw['twitter:card'] ? `Card type: ${tw['twitter:card']}` : 'No Twitter card tags');

  add('Social & Meta Tags', 'Canonical URL', sd?.canonical ? 4 : 0, 4,
    sd?.canonical ? 'pass' : 'warn',
    sd?.canonical || 'No canonical URL');

  // ── LLM Discovery (10) ──
  add('LLM Discovery', 'llms.txt', discovery.llmsTxt.found ? 5 : 0, 5,
    discovery.llmsTxt.found ? 'pass' : 'info',
    discovery.llmsTxt.found ? 'Provides LLM-friendly site summary' : 'No /llms.txt — consider adding one for AI crawlers');

  add('LLM Discovery', 'Markdown Content Negotiation', discovery.markdown.served ? 3 : 0, 3,
    discovery.markdown.served ? 'pass' : 'info',
    discovery.markdown.served ? 'Serves markdown via Accept header' : 'No markdown via content negotiation');

  add('LLM Discovery', 'AI Plugin / MCP Discovery', discovery.aiPlugin.found ? 2 : 0, 2,
    discovery.aiPlugin.found ? 'pass' : 'info',
    discovery.aiPlugin.found ? '.well-known/ai-plugin.json found' : 'No AI plugin manifest');

  // ── Indexability (5) ──
  if (!ssr.measured) {
    notAssessed('Indexability', 'Meta Robots');
  } else {
    const rm = sd?.robotsMeta || '';
    const noindex = rm.includes('noindex');
    add('Indexability', 'Meta Robots', noindex ? 0 : 5, 5,
      noindex ? 'fail' : 'pass',
      noindex ? `Meta robots contains noindex: "${rm}"` : rm ? `Robots meta: "${rm}"` : 'No restrictive meta robots');
  }

  const total = checks.reduce((s, c) => s + c.score, 0);
  const max = checks.reduce((s, c) => s + c.maxScore, 0);
  return { checks, total, max };
}

// --- Recommendations ---

function generateRecs(robots, ssrData, comparison, discovery) {
  const recs = [];
  const comp = comparison;
  const sd = ssrData;

  const blocked = robots.bots.filter(b => b.status === 'blocked' || b.status === 'blocked-wildcard');
  if (blocked.length > 0) {
    recs.push({
      severity: 'high',
      title: 'Unblock AI crawlers in robots.txt',
      detail: `${blocked.map(b => b.name).join(', ')} are currently blocked. These bots power AI search engines (ChatGPT, Claude, Perplexity) that drive increasing referral traffic.`,
    });
  }

  if (!sd?.description) {
    recs.push({
      severity: 'high',
      title: 'Add a meta description to SSR HTML',
      detail: 'Unlike Google (which rewrites snippets), LLMs use your meta description verbatim as a primary content summary. This is one of the highest-impact GEO signals.',
    });
  }

  if ((sd?.jsonLd?.length || 0) === 0) {
    recs.push({
      severity: 'high',
      title: 'Add JSON-LD structured data',
      detail: 'Structured data gives LLMs machine-readable context about your content (product details, pricing, reviews). Without it, LLMs must infer meaning from unstructured text.',
    });
  }

  const parityData = comp.parity;
  const parityPct = parityData?.pct ?? 100;
  const parityGapDir = parityData?.gapDirection;
  const parityOnlyCSR = (parityData?.onlyInCSR || []).slice(0, 3);
  const parityOnlySSR = (parityData?.onlyInSSR || []).slice(0, 3);
  const ssrWordsRec = parityData?.ssrWords ?? 0;
  const csrWordsRec = parityData?.csrWords ?? 0;

  // Real GEO problem: CSR has more text than SSR, so LLMs miss the JS-injected delta.
  if (parityGapDir === 'csrLarger' && parityPct < 80) {
    const sample = parityOnlyCSR.length > 0
      ? `\n\nExamples of content only visible after JS executes:\n${parityOnlyCSR.map(c => `  • "${c.slice(0, 140)}${c.length > 140 ? '…' : ''}"`).join('\n')}`
      : '';
    recs.push({
      severity: parityPct < 60 ? 'high' : 'medium',
      title: 'Move JS-injected page body into the server response',
      detail: `Parity ${parityPct}% — CSR contains ${csrWordsRec - ssrWordsRec} more words than SSR (${csrWordsRec} vs ${ssrWordsRec}). That delta is JS-injected content invisible to LLM crawlers (ChatGPT, Claude, Perplexity all fetch the raw HTML).${sample}`,
    });
  }

  // Informational: SSR has substantially more text than CSR. Usually cookie banners,
  // accessibility helpers, or fallbacks the JS removes from the user view.
  if (parityGapDir === 'ssrLarger' && parityPct < 80) {
    const sample = parityOnlySSR.length > 0
      ? `\n\nExamples of SSR-only blocks (LLMs see, users don't):\n${parityOnlySSR.map(c => `  • "${c.slice(0, 140)}${c.length > 140 ? '…' : ''}"`).join('\n')}`
      : '';
    recs.push({
      severity: 'low',
      title: 'Audit SSR-only content blocks',
      detail: `Parity ${parityPct}% — SSR contains ${ssrWordsRec - csrWordsRec} more words than CSR (${ssrWordsRec} vs ${csrWordsRec}). LLMs see this content; users don't. Usually fine (cookie banner / a11y helpers / collapsed UI), but worth checking that nothing important is hidden by JS that should be visible to users.${sample}`,
    });
  }

  const h1Data = comp.h1;
  if (h1Data?.status === 'missing-ssr') {
    recs.push({
      severity: 'medium',
      title: 'Render H1 heading server-side',
      detail: 'The page H1 only appears after JavaScript execution. Ensure it is in the initial server response for AI crawlers.',
    });
  }

  if (!sd?.og?.['og:title'] || !sd?.og?.['og:description'] || !sd?.og?.['og:image']) {
    recs.push({
      severity: 'medium',
      title: 'Complete Open Graph tags',
      detail: 'OG tags provide AI systems with canonical title, description, and image. Missing tags mean LLMs must guess what to show users.',
    });
  }

  const sdComp = comp.structuredData;
  const onlyCSR = sdComp?.onlyCSR || [];
  if (onlyCSR.length > 0) {
    recs.push({
      severity: 'medium',
      title: 'Move structured data to SSR',
      detail: `Schema types only available after JS: ${onlyCSR.join(', ')}. Inline JSON-LD in the server response.`,
    });
  }

  if (!sd?.canonical) {
    recs.push({ severity: 'low', title: 'Add canonical URL', detail: 'A canonical URL prevents LLMs from indexing duplicate versions of this page.' });
  }

  if (!discovery.llmsTxt.found) {
    recs.push({ severity: 'low', title: 'Create /llms.txt', detail: 'The llms.txt convention (like robots.txt for AI) provides a structured summary of your site for LLM crawlers. See llmstxt.org for the spec.' });
  }

  if (!discovery.markdown.served) {
    recs.push({ severity: 'low', title: 'Serve markdown via Accept header', detail: 'Some AI crawlers request text/markdown. Serving a markdown version improves content extraction quality. Cloudflare and some CDNs can automate this.' });
  }

  if (!sd?.twitter?.['twitter:card']) {
    recs.push({ severity: 'low', title: 'Add Twitter Card tags', detail: 'Twitter/X card tags improve how AI-powered social tools preview your content.' });
  }

  return recs;
}

// --- Build category score map ---

function buildCategoryScores(checks) {
  const sum = (cat) => {
    const items = checks.filter(c => c.category === cat);
    return {
      score: items.reduce((s, c) => s + c.score, 0),
      max: items.reduce((s, c) => s + c.maxScore, 0),
    };
  };
  return {
    crawlAccess: sum('LLM Crawl Access'),
    serverContent: sum('Server-Side Content'),
    structuredData: sum('Structured Data'),
    socialMeta: sum('Social & Meta Tags'),
    discovery: sum('LLM Discovery'),
    indexability: sum('Indexability'),
  };
}

// --- Default empty report ---

function emptyReport() {
  return {
    geoScore: 0,
    measurementValid: true,
    categories: {
      crawlAccess: { score: 0, max: 20 },
      serverContent: { score: 0, max: 30 },
      structuredData: { score: 0, max: 20 },
      socialMeta: { score: 0, max: 15 },
      discovery: { score: 0, max: 10 },
      indexability: { score: 0, max: 5 },
    },
    contentParity: 0,
    ssrWordCount: 0,
    csrWordCount: 0,
    checks: [],
    recommendations: [],
    comparison: {},
    robots: {},
    discovery: {},
  };
}

// --- Main scanner ---

// `page` is a Puppeteer page already open on `url`. This only reads page.content(), then fetches
// the raw HTML and compares the two. Open it with page.goto(url, { waitUntil: 'domcontentloaded',
// timeout: 30000 }) and wait 10 seconds first, or the CSR word count will not be comparable.
export async function runGeoScan(url, page) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    console.error(`[GeoScan] Invalid URL: ${url}`);
    return emptyReport();
  }

  // 1. Get CSR HTML from the already-navigated page (post-JavaScript render)
  let csrData = null;
  let csrHtml = '';
  try {
    csrHtml = await withTimeout(page.content(), 10000, 'CSR page.content()');
    csrData = extractPage(csrHtml);
  } catch (err) {
    console.error('[GeoScan] Failed to get CSR HTML:', err instanceof Error ? err.message : err);
  }

  // 2. Fetch SSR HTML via raw HTTP. Starts unmeasured, so a thrown or timed-out fetch
  // cannot fall through into the scored path.
  let ssrData = null;
  let ssrWordCount = 0;
  let ssrMeasured = false;
  let ssrUnmeasuredReason = 'SSR fetch did not complete';
  try {
    const ssr = await withTimeout(fetchSSR(url), 20000, 'SSR fetch');
    ssrData = ssr.data;
    ssrWordCount = ssrData?.wordCount || 0;
    ssrMeasured = ssr.measured;
    ssrUnmeasuredReason = ssr.unmeasuredReason ?? ssrUnmeasuredReason;
  } catch (err) {
    console.error('[GeoScan] SSR fetch failed:', err instanceof Error ? err.message : err);
  }

  // 3. Fetch robots.txt. Also starts unmeasured, not "no robots.txt": a timed-out audit
  // must not score as a pass.
  let robots = {
    found: false,
    measured: false,
    unmeasuredReason: 'robots.txt audit did not complete',
    bots: LLM_BOTS.map(b => ({ ...b, status: 'unknown' })),
  };
  try {
    robots = await withTimeout(auditRobots(origin), 15000, 'robots.txt audit');
  } catch (err) {
    console.error('[GeoScan] robots.txt audit failed:', err instanceof Error ? err.message : err);
  }

  // 4. LLM discovery checks
  let discovery = {
    llmsTxt: { found: false },
    llmsFullTxt: { found: false },
    markdown: { served: false, contentType: '' },
    aiPlugin: { found: false },
  };
  try {
    discovery = await withTimeout(checkDiscovery(origin, url), 30000, 'LLM discovery');
  } catch (err) {
    console.error('[GeoScan] Discovery check failed:', err instanceof Error ? err.message : err);
  }

  // 5. Compare SSR vs CSR
  const comparison = comparePages(ssrData, csrData);

  // 6. Score
  const { checks, total, max } = calcScores(robots, ssrData, csrData, comparison, discovery, {
    measured: ssrMeasured,
    unmeasuredReason: ssrUnmeasuredReason,
  });
  const geoScore = max > 0 ? Math.round((total / max) * 100) : 0;

  // 7. Recommendations
  const recommendations = generateRecs(robots, ssrData, comparison, discovery);

  // 8. Content parity
  const parityData = comparison.parity;
  const contentParity = parityData?.pct ?? (csrData ? 0 : 100);

  // 9. Meta and structured-data validation on the rendered HTML. Non-fatal: a validator
  // error must never fail the GEO audit.
  let metaResult;
  let structuredDataResult;
  if (csrHtml) {
    try {
      metaResult = validateMetaFromHtml(csrHtml, url);
      structuredDataResult = validateStructuredDataFromHtml(csrHtml, url);
    } catch (err) {
      console.error('[GeoScan] Meta/SD validation failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    geoScore,
    measurementValid: true,
    categories: buildCategoryScores(checks),
    contentParity,
    ssrWordCount,
    csrWordCount: csrData?.wordCount || 0,
    checks,
    recommendations,
    comparison,
    robots: { found: robots.found, bots: robots.bots },
    discovery,
    metaResult,
    structuredDataResult,
  };
}
