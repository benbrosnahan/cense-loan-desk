// Page context: robots and indexability, sitemap membership and site type. Adapted from PerfMaster's page context engine.
// Everything here is best-effort: a failed robots.txt or sitemap fetch leaves the field undefined, and an undetermined
// signal never suppresses a finding.

// The site types the design engine accepts. This kit always passes 'saas'.
export const SITE_TYPES = ['saas', 'unknown'];

// --- Robots / indexability ---

// Directives may be bot-scoped ("googlebot: noindex"): honour the major crawlers.
const BOT_SCOPES = new Set(['robots', 'googlebot', 'bingbot', 'googlebot-news', 'otherbot']);

export function isNoindexDirective(directive) {
  if (!directive) return false;
  for (const raw of directive.toLowerCase().split(',')) {
    let token = raw.trim();
    if (!token) continue;
    const colon = token.indexOf(':');
    if (colon !== -1) {
      if (!BOT_SCOPES.has(token.slice(0, colon).trim())) continue;
      token = token.slice(colon + 1).trim();
    }
    if (token === 'noindex' || token === 'none') return true;
  }
  return false;
}

// A page is non-indexable only on an explicit noindex directive. Absence from the sitemap is not enough: plenty of
// indexable pages are never listed, and indexable:false down-ranks findings. inSitemap is carried for the reader only.
export function resolveIndexable(input) {
  const metaNoindex = isNoindexDirective(input.robotsMeta);
  const headerNoindex = isNoindexDirective(input.xRobotsTag);
  if (metaNoindex || headerNoindex) {
    const raw = metaNoindex
      ? `meta robots: ${(input.robotsMeta || '').trim()}`
      : `X-Robots-Tag: ${(input.xRobotsTag || '').trim()}`;
    return { indexable: false, robots: raw.slice(0, 160) };
  }
  const seen = input.robotsMeta?.trim() || input.xRobotsTag?.trim();
  return { indexable: true, ...(seen ? { robots: seen.slice(0, 160) } : {}) };
}

export function coerceSiteType(value) {
  return typeof value === 'string' && SITE_TYPES.includes(value) ? value : 'unknown';
}

// --- Sitemap membership ---

const SITEMAP_FETCH_TIMEOUT_MS = 8_000;
const SITEMAP_MAX_CHILDREN = 5;
const SITEMAP_MAX_URLS = 50_000;
const SITEMAP_CACHE_TTL_MS = 30 * 60_000;

// Per-origin cache: an audit reads many states of one site back to back.
const sitemapCache = new Map();

// Clear the module-level sitemap cache.
export function _resetSitemapCache() {
  sitemapCache.clear();
}

// Trailing slash, hash and host case are not identity: normalize them away.
export function normalizeUrlForSitemap(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

export function sitemapContains(pageUrl, urls) {
  const target = normalizeUrlForSitemap(pageUrl);
  for (const u of urls) if (normalizeUrlForSitemap(u) === target) return true;
  return false;
}

export function extractLocs(xml) {
  const out = [];
  for (const m of Array.from(xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi))) {
    out.push(m[1].replace(/&amp;/g, '&').trim());
  }
  return out;
}

export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

export function parseSitemapUrlsFromRobotsTxt(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (m) out.push(m[1]);
  }
  return out;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'cense-audit-kit' },
      signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Resolve the origin's sitemap URL set. Returns null when it cannot be determined (no robots.txt hint, no
// /sitemap.xml, fetch failure): callers must treat null as "unknown", never as "not listed".
export async function fetchSitemapUrls(origin) {
  const cached = sitemapCache.get(origin);
  if (cached && Date.now() - cached.at < SITEMAP_CACHE_TTL_MS) return cached.urls;

  let urls = null;
  try {
    const robotsTxt = await fetchText(`${origin}/robots.txt`);
    const candidates = robotsTxt ? parseSitemapUrlsFromRobotsTxt(robotsTxt).slice(0, 3) : [];
    if (!candidates.length) candidates.push(`${origin}/sitemap.xml`);

    const collected = new Set();
    const queue = [...candidates];
    let childrenFetched = 0;
    while (queue.length && collected.size < SITEMAP_MAX_URLS) {
      const next = queue.shift();
      const xml = await fetchText(next);
      if (!xml) continue;
      const locs = extractLocs(xml);
      if (isSitemapIndex(xml)) {
        for (const child of locs) {
          if (childrenFetched >= SITEMAP_MAX_CHILDREN) break;
          childrenFetched++;
          queue.push(child);
        }
        continue;
      }
      for (const loc of locs) {
        collected.add(loc);
        if (collected.size >= SITEMAP_MAX_URLS) break;
      }
    }
    if (collected.size) urls = collected;
  } catch {
    urls = null;
  }

  sitemapCache.set(origin, { at: Date.now(), urls });
  return urls;
}

// --- Collection ---

function headerValue(response, name) {
  try {
    const headers = response?.headers();
    if (!headers) return null;
    const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name);
    return hit ? hit[1] : null;
  } catch {
    return null;
  }
}

// Robots meta from the rendered DOM, X-Robots-Tag from the navigation response, sitemap membership from the origin.
// The site type is passed in as data.
export async function collectPageContext(page, url, response, siteType) {
  let robotsMeta = null;
  try {
    robotsMeta = await page.evaluate(() => {
      const el = document.querySelector('meta[name="robots" i], meta[name="googlebot" i]');
      return el ? el.getAttribute('content') : null;
    });
  } catch {
    /* non-fatal */
  }

  const xRobotsTag = headerValue(response, 'x-robots-tag');

  let inSitemap;
  try {
    const sitemapUrls = await fetchSitemapUrls(new URL(url).origin);
    if (sitemapUrls) inSitemap = sitemapContains(url, sitemapUrls);
  } catch {
    /* non-fatal: stays undefined ("unknown") */
  }

  const { indexable, robots } = resolveIndexable({ robotsMeta, xRobotsTag, inSitemap });
  return {
    indexable,
    ...(robots ? { robots } : {}),
    ...(inSitemap !== undefined ? { inSitemap } : {}),
    siteType: coerceSiteType(siteType),
  };
}
