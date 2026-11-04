// Site tools. Adapted from PerfMaster's tool engines.
import * as cheerio from 'cheerio';

function toolFetch(url, init) {
  const headers = new Headers(init?.headers);
  headers.set('User-Agent', 'cense-audit-kit');
  return fetch(url, { ...init, headers });
}

function getFetchErrorMessage(status, url) {
  switch (status) {
    case 401:
      return `The website at ${url} requires authentication (HTTP 401). This tool can only check publicly accessible pages.`;
    case 403:
      return `The website at ${url} is blocking automated requests (HTTP 403 Forbidden). The site may have bot protection or a WAF that prevents programmatic access.`;
    case 404:
      return `The page at ${url} was not found (HTTP 404). Check the URL and try again.`;
    case 429:
      return `The website at ${url} is blocking this request (HTTP 429 Too Many Requests). The site likely has bot protection (e.g., Vercel Attack Challenge, Cloudflare) or rate limiting enabled. Try again later or try a different URL.`;
    case 451:
      return `The page at ${url} is unavailable for legal reasons (HTTP 451).`;
    case 500:
      return `The website at ${url} returned a server error (HTTP 500). The site may be experiencing issues.`;
    case 502:
      return `The website at ${url} returned a bad gateway error (HTTP 502). The site's server may be down.`;
    case 503:
      return `The website at ${url} is temporarily unavailable (HTTP 503). Try again later.`;
    default:
      return `Failed to fetch ${url}: the server returned HTTP ${status}.`;
  }
}

// Header check

export async function analyzeHeaders(url) {
  const response = await toolFetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });

  // A 403 or 429 response doesn't carry the site's real headers, so stop here.
  if (response.status === 429 || response.status === 403) {
    throw new Error(getFetchErrorMessage(response.status, url));
  }

  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const analysis = [];

  // Cache headers
  const cacheControl = headers['cache-control'];
  analysis.push({
    name: 'Cache-Control',
    value: cacheControl || null,
    status: cacheControl ? (cacheControl.includes('no-store') ? 'warning' : 'good') : 'missing',
    recommendation: cacheControl
      ? (cacheControl.includes('no-store')
        ? 'Consider enabling caching for static assets to improve load times.'
        : 'Cache-Control is configured.')
      : 'Add Cache-Control headers. Use "public, max-age=31536000, immutable" for static assets.',
  });

  // Compression
  const contentEncoding = headers['content-encoding'];
  analysis.push({
    name: 'Content-Encoding',
    value: contentEncoding || null,
    status: contentEncoding ? 'good' : 'warning',
    recommendation: contentEncoding
      ? `Compression enabled: ${contentEncoding}`
      : 'Enable gzip or Brotli compression to reduce transfer sizes by 60-80%.',
  });

  // Security headers
  const securityHeaders = [
    {
      name: 'Strict-Transport-Security',
      rec: 'Add HSTS header: "max-age=63072000; includeSubDomains; preload"',
    },
    {
      name: 'X-Content-Type-Options',
      rec: 'Add "X-Content-Type-Options: nosniff" to prevent MIME sniffing.',
    },
    {
      name: 'X-Frame-Options',
      rec: 'Add "X-Frame-Options: DENY" or "SAMEORIGIN" to prevent clickjacking.',
    },
    {
      name: 'Content-Security-Policy',
      rec: 'Add a Content-Security-Policy to prevent XSS and data injection.',
    },
    {
      name: 'Referrer-Policy',
      rec: 'Add "Referrer-Policy: strict-origin-when-cross-origin" for privacy.',
    },
    {
      name: 'Permissions-Policy',
      rec: 'Add Permissions-Policy to control browser features (camera, geolocation, etc.).',
    },
  ];

  for (const sh of securityHeaders) {
    const val = headers[sh.name.toLowerCase()];
    analysis.push({
      name: sh.name,
      value: val || null,
      status: val ? 'good' : 'missing',
      recommendation: val ? `${sh.name} is set.` : sh.rec,
    });
  }

  // Performance headers
  const etag = headers['etag'];
  analysis.push({
    name: 'ETag',
    value: etag || null,
    status: etag ? 'good' : 'warning',
    recommendation: etag
      ? 'ETag is set for conditional requests.'
      : 'Consider adding ETag headers for efficient cache validation.',
  });

  const vary = headers['vary'];
  analysis.push({
    name: 'Vary',
    value: vary || null,
    status: vary ? 'good' : 'warning',
    recommendation: vary
      ? `Vary header set: ${vary}`
      : 'Add "Vary: Accept-Encoding" for proper CDN caching with compression.',
  });

  const good = analysis.filter(a => a.status === 'good').length;
  const warnings = analysis.filter(a => a.status === 'warning').length;
  const missing = analysis.filter(a => a.status === 'missing').length;

  return {
    url,
    statusCode: response.status,
    allHeaders: headers,
    analysis,
    summary: { good, warnings, missing, total: analysis.length },
    score: Math.round((good / analysis.length) * 100),
  };
}

// Meta tags

export async function validateMeta(url) {
  const response = await toolFetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(getFetchErrorMessage(response.status, url));
  }

  const html = await response.text();
  return parseMetaTags(html, url);
}

function parseMetaTags(html, url) {
  const $ = cheerio.load(html);

  const getMeta = (name) =>
    $(`meta[name="${name}"]`).attr('content') ||
    $(`meta[property="${name}"]`).attr('content') ||
    null;

  const tags = [];

  // Title
  const title = $('title').text().trim();
  tags.push({
    name: 'title',
    content: title || null,
    status: title ? (title.length > 60 ? 'warning' : 'good') : 'missing',
    recommendation: title
      ? (title.length > 60
        ? `Title is ${title.length} chars. Keep under 60 for best display in search results.`
        : `Title is ${title.length} chars. Good length.`)
      : 'Add a <title> tag. It\'s critical for SEO and browser tabs.',
  });

  // Description
  const desc = getMeta('description');
  tags.push({
    name: 'meta description',
    content: desc,
    status: desc ? (desc.length > 160 ? 'warning' : 'good') : 'missing',
    recommendation: desc
      ? (desc.length > 160
        ? `Description is ${desc.length} chars. Keep under 160.`
        : `Description is ${desc.length} chars. Good length.`)
      : 'Add a meta description. It appears in search result snippets.',
  });

  // Viewport
  const viewport = getMeta('viewport');
  tags.push({
    name: 'viewport',
    content: viewport,
    status: viewport ? 'good' : 'missing',
    recommendation: viewport
      ? 'Viewport is set.'
      : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile.',
  });

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href') || null;
  tags.push({
    name: 'canonical',
    content: canonical,
    status: canonical ? 'good' : 'warning',
    recommendation: canonical
      ? `Canonical URL: ${canonical}`
      : 'Add a canonical URL to prevent duplicate content issues.',
  });

  // Open Graph
  const ogTags = [
    { prop: 'og:title', label: 'og:title' },
    { prop: 'og:description', label: 'og:description' },
    { prop: 'og:image', label: 'og:image' },
    { prop: 'og:url', label: 'og:url' },
    { prop: 'og:type', label: 'og:type' },
  ];

  for (const og of ogTags) {
    const val = getMeta(og.prop);
    tags.push({
      name: og.label,
      content: val,
      status: val ? 'good' : (og.prop === 'og:type' ? 'warning' : 'missing'),
      recommendation: val
        ? `Set to: ${val.length > 80 ? val.substring(0, 80) + '...' : val}`
        : `Add ${og.label} for better social media sharing.`,
    });
  }

  // Twitter Card
  const twitterTags = [
    { name: 'twitter:card', label: 'twitter:card' },
    { name: 'twitter:title', label: 'twitter:title' },
    { name: 'twitter:description', label: 'twitter:description' },
    { name: 'twitter:image', label: 'twitter:image' },
  ];

  for (const tw of twitterTags) {
    const val = getMeta(tw.name);
    tags.push({
      name: tw.label,
      content: val,
      status: val ? 'good' : 'warning',
      recommendation: val
        ? `Set to: ${val.length > 80 ? val.substring(0, 80) + '...' : val}`
        : `Add ${tw.label} for Twitter card previews.`,
    });
  }

  // Language
  const lang = $('html').attr('lang');
  tags.push({
    name: 'lang attribute',
    content: lang || null,
    status: lang ? 'good' : 'missing',
    recommendation: lang
      ? `Language: ${lang}`
      : 'Add lang attribute to <html> for accessibility and SEO.',
  });

  // Favicon
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || null;
  tags.push({
    name: 'favicon',
    content: favicon,
    status: favicon ? 'good' : 'warning',
    recommendation: favicon
      ? `Favicon found: ${favicon}`
      : 'Add a favicon for better browser tab identification.',
  });

  const good = tags.filter(t => t.status === 'good').length;
  const warnings = tags.filter(t => t.status === 'warning').length;
  const missing = tags.filter(t => t.status === 'missing').length;

  // Social preview data
  const ogImage = getMeta('og:image');
  const preview = {
    title: getMeta('og:title') || title || url,
    description: getMeta('og:description') || desc || '',
    image: ogImage ? (ogImage.startsWith('http') ? ogImage : new URL(ogImage, url).href) : null,
    url: getMeta('og:url') || url,
    siteName: getMeta('og:site_name') || new URL(url).hostname,
  };

  const score = Math.round((good / tags.length) * 100);

  return {
    url,
    tags,
    preview,
    summary: { good, warnings, missing, total: tags.length },
    score,
  };
}

// Structured data

// Required and recommended properties per schema type
const SCHEMA_REQUIREMENTS = {
  Article: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'],
  },
  NewsArticle: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'],
  },
  BlogPosting: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'],
  },
  Product: {
    required: ['name', 'image'],
    recommended: ['description', 'offers', 'aggregateRating', 'review', 'brand', 'sku'],
  },
  LocalBusiness: {
    required: ['name', 'address'],
    recommended: ['telephone', 'openingHours', 'image', 'url', 'geo', 'priceRange', 'aggregateRating'],
  },
  Organization: {
    required: ['name', 'url'],
    recommended: ['logo', 'sameAs', 'contactPoint', 'address', 'description'],
  },
  Person: {
    required: ['name'],
    recommended: ['url', 'image', 'jobTitle', 'sameAs'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction', 'description'],
  },
  WebPage: {
    required: ['name'],
    recommended: ['description', 'breadcrumb', 'mainEntity'],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
  },
  HowTo: {
    required: ['name', 'step'],
    recommended: ['description', 'image', 'totalTime', 'estimatedCost'],
  },
  Recipe: {
    required: ['name', 'image'],
    recommended: ['author', 'datePublished', 'description', 'prepTime', 'cookTime', 'recipeIngredient', 'recipeInstructions', 'aggregateRating', 'nutrition'],
  },
  Event: {
    required: ['name', 'startDate', 'location'],
    recommended: ['description', 'endDate', 'image', 'offers', 'performer', 'organizer'],
  },
  VideoObject: {
    required: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['contentUrl', 'duration', 'embedUrl'],
  },
  Review: {
    required: ['itemReviewed', 'author', 'reviewRating'],
    recommended: ['datePublished', 'reviewBody'],
  },
  SoftwareApplication: {
    required: ['name', 'offers'],
    recommended: ['operatingSystem', 'applicationCategory', 'aggregateRating', 'description'],
  },
};

function getSchemaType(obj) {
  const type = obj['@type'];
  if (Array.isArray(type)) return String(type[0] || 'Unknown');
  return String(type || 'Unknown');
}

function summarizeValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.length > 80 ? val.substring(0, 80) + '...' : val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (typeof val === 'object') {
    const type = val['@type'];
    if (type) return `{${type}}`;
    return '{object}';
  }
  return String(val);
}

function validateSchema(obj, type) {
  const errors = [];
  const warnings = [];
  const properties = [];

  // Check @context
  const context = obj['@context'];
  if (!context) {
    errors.push('Missing @context. Should be "https://schema.org".');
  } else if (typeof context === 'string' && !context.includes('schema.org')) {
    warnings.push(`@context is "${context}". Expected "https://schema.org".`);
  }

  // Check @type
  if (!obj['@type']) {
    errors.push('Missing @type property.');
  }

  // Validate required and recommended properties
  const reqs = SCHEMA_REQUIREMENTS[type];
  if (reqs) {
    for (const prop of reqs.required) {
      const present = obj[prop] !== undefined && obj[prop] !== null && obj[prop] !== '';
      properties.push({
        name: prop,
        value: present ? summarizeValue(obj[prop]) : '',
        required: true,
        present,
      });
      if (!present) {
        errors.push(`Missing required property "${prop}" for ${type}.`);
      }
    }
    for (const prop of reqs.recommended) {
      const present = obj[prop] !== undefined && obj[prop] !== null && obj[prop] !== '';
      properties.push({
        name: prop,
        value: present ? summarizeValue(obj[prop]) : '',
        required: false,
        present,
      });
      if (!present) {
        warnings.push(`Missing recommended property "${prop}" for ${type}.`);
      }
    }
  } else {
    warnings.push(`Schema type "${type}" is valid but not in our validation database. Basic checks only.`);
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@')) continue;
      properties.push({
        name: key,
        value: summarizeValue(val),
        required: false,
        present: true,
      });
    }
  }

  // Check for common issues
  if (obj['image']) {
    const img = obj['image'];
    if (typeof img === 'string' && !img.startsWith('http')) {
      warnings.push('Image URL should be an absolute URL (starting with https://).');
    }
  }

  if (obj['url']) {
    const urlVal = obj['url'];
    if (typeof urlVal === 'string' && !urlVal.startsWith('http')) {
      warnings.push('URL should be an absolute URL (starting with https://).');
    }
  }

  if (obj['datePublished'] || obj['dateModified']) {
    const dateStr = String(obj['datePublished'] || obj['dateModified']);
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      warnings.push(`Date "${dateStr}" should be in ISO 8601 format (YYYY-MM-DD).`);
    }
  }

  return { errors, warnings, properties };
}

function extractJsonLd($) {
  const items = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);

      // Handle @graph arrays
      const schemas = parsed['@graph'] ? parsed['@graph'] : Array.isArray(parsed) ? parsed : [parsed];

      for (const schema of schemas) {
        const type = getSchemaType(schema);
        const { errors, warnings, properties } = validateSchema(schema, type);
        items.push({ type, source: 'json-ld', raw, parsed: schema, errors, warnings, properties });
      }
    } catch (e) {
      items.push({
        type: 'Invalid JSON-LD',
        source: 'json-ld',
        raw,
        parsed: null,
        errors: [`JSON parse error: ${e.message}`],
        warnings: [],
        properties: [],
      });
    }
  });

  return items;
}

function extractMicrodata($) {
  const items = [];

  $('[itemscope][itemtype]').each((_, el) => {
    const itemtype = $(el).attr('itemtype') || '';
    const type = itemtype.split('/').pop() || 'Unknown';
    const properties = [];

    $(el).find('[itemprop]').each((_, prop) => {
      const name = $(prop).attr('itemprop') || '';
      const value = $(prop).attr('content') || $(prop).text().trim().substring(0, 80);
      properties.push({ name, value, required: false, present: true });
    });

    const warnings = [];
    if (properties.length === 0) {
      warnings.push('Microdata item has no itemprop properties.');
    }

    items.push({
      type,
      source: 'microdata',
      raw: `<${el.tagName || 'div'} itemscope itemtype="${itemtype}">`,
      parsed: null,
      errors: [],
      warnings,
      properties,
    });
  });

  return items;
}

export async function validateStructuredData(url) {
  const res = await toolFetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(getFetchErrorMessage(res.status, url));
  }

  const html = await res.text();
  return validateStructuredDataFromHtml(html, url);
}

function validateStructuredDataFromHtml(html, url) {
  const $ = cheerio.load(html);

  const jsonLdItems = extractJsonLd($);
  const microdataItems = extractMicrodata($);
  const allItems = [...jsonLdItems, ...microdataItems];

  const totalErrors = allItems.reduce((sum, item) => sum + item.errors.length, 0);
  const totalWarnings = allItems.reduce((sum, item) => sum + item.warnings.length, 0);
  const validItems = allItems.filter(item => item.errors.length === 0).length;

  // Rich result eligibility
  const richResultTypes = new Set([
    'Article', 'NewsArticle', 'BlogPosting', 'Product', 'LocalBusiness',
    'FAQPage', 'HowTo', 'Recipe', 'Event', 'VideoObject', 'Review',
    'BreadcrumbList', 'SoftwareApplication', 'Course', 'JobPosting',
  ]);
  const eligibleTypes = allItems
    .filter(item => richResultTypes.has(item.type) && item.errors.length === 0)
    .map(item => item.type);

  return {
    url,
    totalSchemas: allItems.length,
    items: allItems,
    summary: {
      total: allItems.length,
      valid: validItems,
      withErrors: allItems.length - validItems,
      totalErrors,
      totalWarnings,
      jsonLd: jsonLdItems.length,
      microdata: microdataItems.length,
    },
    richResultEligibility: {
      eligible: eligibleTypes.length > 0,
      types: Array.from(new Set(eligibleTypes)),
    },
  };
}

// Sitemap

export async function validateSitemap(url) {
  // Accept either a direct sitemap URL or a site URL
  let sitemapUrl;
  if (url.endsWith('.xml') || url.includes('sitemap')) {
    sitemapUrl = url;
  } else {
    const base = url.replace(/\/$/, '');
    sitemapUrl = `${base}/sitemap.xml`;
  }

  // Fetch sitemap
  let sitemapResponse;
  try {
    sitemapResponse = await toolFetch(sitemapUrl, {
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Try sitemap_index.xml as fallback
    const altUrl = sitemapUrl.replace('sitemap.xml', 'sitemap_index.xml');
    sitemapResponse = await toolFetch(altUrl, {
      signal: AbortSignal.timeout(10000),
    });
    sitemapUrl = altUrl;
  }

  if (!sitemapResponse.ok) {
    return {
      sitemapUrl,
      found: false,
      urls: [],
      issues: ['Sitemap not found. Try providing a direct URL to your sitemap.xml.'],
      summary: { total: 0, ok: 0, redirects: 0, errors: 0, dead: 0, slow: 0 },
      error: `Sitemap not found at ${sitemapUrl}. HTTP ${sitemapResponse.status}`,
    };
  }

  const xml = await sitemapResponse.text();
  const $ = cheerio.load(xml, { xml: true });

  // Check if it's a sitemap index
  const sitemapIndex = $('sitemapindex sitemap loc');
  if (sitemapIndex.length > 0) {
    const childSitemaps = [];
    sitemapIndex.each((_, el) => {
      childSitemaps.push($(el).text().trim());
    });

    return {
      sitemapUrl,
      found: true,
      isSitemapIndex: true,
      childSitemaps,
      totalChildSitemaps: childSitemaps.length,
      issues: [],
      summary: { total: childSitemaps.length, childSitemaps: childSitemaps.length },
      message: `This is a sitemap index with ${childSitemaps.length} child sitemaps. Validate each child sitemap individually.`,
    };
  }

  // Parse URLs from sitemap
  const urls = [];
  const globalIssues = [];

  $('urlset url').each((_, el) => {
    const loc = $(el).find('loc').text().trim();
    const lastmod = $(el).find('lastmod').text().trim() || null;
    if (loc) {
      urls.push({
        loc,
        lastmod,
        status: null,
        statusText: 'pending',
        responseTimeMs: null,
        issues: [],
      });
    }
  });

  if (urls.length === 0) {
    globalIssues.push('No URLs found in sitemap. The XML may be malformed.');
    return {
      sitemapUrl,
      found: true,
      isSitemapIndex: false,
      urls: [],
      issues: globalIssues,
      summary: { total: 0, ok: 0, redirects: 0, errors: 0, dead: 0, slow: 0 },
    };
  }

  // Check for duplicates
  const seenUrls = new Set();
  const duplicates = [];
  for (const u of urls) {
    if (seenUrls.has(u.loc)) {
      duplicates.push(u.loc);
      u.issues.push('Duplicate URL in sitemap');
    }
    seenUrls.add(u.loc);
  }
  if (duplicates.length > 0) {
    globalIssues.push(`${duplicates.length} duplicate URL(s) found.`);
  }

  // Check the first 50 URLs only
  const urlsToCheck = urls.slice(0, 50);
  const checkPromises = urlsToCheck.map(async (entry) => {
    try {
      const start = Date.now();
      const res = await toolFetch(entry.loc, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      entry.responseTimeMs = Date.now() - start;
      entry.status = res.status;

      if (res.status >= 200 && res.status < 300) {
        entry.statusText = 'ok';
      } else if (res.status >= 300 && res.status < 400) {
        entry.statusText = 'redirect';
        entry.issues.push(`Redirects (${res.status}). Update sitemap to use final URL.`);
      } else if (res.status === 404) {
        entry.statusText = 'dead';
        entry.issues.push('Page returns 404. Remove from sitemap.');
      } else if (res.status === 410) {
        entry.statusText = 'dead';
        entry.issues.push('Page returns 410 (Gone). Remove from sitemap.');
      } else {
        entry.statusText = 'error';
        entry.issues.push(`HTTP ${res.status}. Investigate and fix or remove.`);
      }

      if (entry.responseTimeMs > 3000) {
        entry.issues.push(`Slow response (${entry.responseTimeMs}ms). Check server performance.`);
      }

      if (!entry.lastmod) {
        entry.issues.push('Missing lastmod. Add last modification date for better crawling.');
      }
    } catch {
      entry.status = 0;
      entry.statusText = 'error';
      entry.issues.push('Failed to reach URL. Connection timeout or DNS failure.');
    }
  });

  await Promise.all(checkPromises);

  // Check for common missing pages
  const baseUrl = new URL(url.replace(/sitemap.*$/, '')).origin;
  const commonPages = ['/', '/about', '/contact', '/privacy', '/terms'];
  const missingCommon = [];

  for (const page of commonPages) {
    const fullUrl = `${baseUrl}${page}`;
    const inSitemap = urls.some(u => {
      const normalized = u.loc.replace(/\/$/, '');
      return normalized === fullUrl || normalized === fullUrl.replace(/\/$/, '');
    });
    if (!inSitemap) {
      try {
        const res = await toolFetch(fullUrl, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          missingCommon.push(fullUrl);
        }
      } catch {
        // Page doesn't exist, skip
      }
    }
  }

  if (missingCommon.length > 0) {
    globalIssues.push(`${missingCommon.length} common page(s) exist but are missing from sitemap: ${missingCommon.join(', ')}`);
  }

  // Summary
  const ok = urlsToCheck.filter(u => u.statusText === 'ok').length;
  const redirects = urlsToCheck.filter(u => u.statusText === 'redirect').length;
  const errors = urlsToCheck.filter(u => u.statusText === 'error').length;
  const dead = urlsToCheck.filter(u => u.statusText === 'dead').length;
  const slow = urlsToCheck.filter(u => (u.responseTimeMs || 0) > 3000).length;

  if (urls.length > 50) {
    globalIssues.push(`Sitemap has ${urls.length} URLs. Only the first 50 were checked.`);
  }

  return {
    sitemapUrl,
    found: true,
    isSitemapIndex: false,
    totalUrls: urls.length,
    checkedUrls: urlsToCheck.length,
    urls: urlsToCheck,
    uncheckedUrls: urls.length > 50 ? urls.slice(50).map(u => u.loc) : [],
    missingCommonPages: missingCommon,
    duplicates,
    issues: globalIssues,
    summary: {
      total: urls.length,
      checked: urlsToCheck.length,
      ok,
      redirects,
      errors,
      dead,
      slow,
      duplicates: duplicates.length,
      missingCommon: missingCommon.length,
    },
  };
}

// Redirects

// Follow a URL's redirect chain using HEAD requests.
async function checkRedirect(url, maxRedirects = 10) {
  const hops = [];
  let currentUrl = url;

  try {
    for (let i = 0; i < maxRedirects; i++) {
      const start = Date.now();
      const response = await toolFetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      const timeMs = Date.now() - start;
      const location = response.headers.get('location');

      hops.push({ url: currentUrl, statusCode: response.status, location, timeMs });

      if (!location || response.status < 300 || response.status >= 400) {
        break;
      }

      // Resolve relative redirects
      currentUrl = location.startsWith('http')
        ? location
        : new URL(location, currentUrl).href;
    }
  } catch (err) {
    return {
      originalUrl: url,
      finalUrl: hops.length > 0 ? hops[hops.length - 1].url : url,
      finalStatus: hops.length > 0 ? hops[hops.length - 1].statusCode : 0,
      hops,
      redirectCount: hops.filter((h) => h.statusCode >= 300 && h.statusCode < 400).length,
      totalTimeMs: hops.reduce((s, h) => s + h.timeMs, 0),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  const redirectCount = hops.filter((h) => h.statusCode >= 300 && h.statusCode < 400).length;

  return {
    originalUrl: url,
    finalUrl: hops[hops.length - 1]?.url || url,
    finalStatus: hops[hops.length - 1]?.statusCode || 0,
    hops,
    redirectCount,
    totalTimeMs: hops.reduce((s, h) => s + h.timeMs, 0),
  };
}

export async function analyzeRedirects(url) {
  const result = await checkRedirect(url);

  let status;
  let message;

  if (result.finalStatus >= 400) {
    status = 'error';
    message = `Final destination returned ${result.finalStatus}. The URL may be broken.`;
  } else if (result.redirectCount === 0) {
    status = 'good';
    message = 'No redirects detected. URL resolves directly.';
  } else if (result.redirectCount === 1) {
    status = 'good';
    message = `1 redirect detected (${result.totalTimeMs}ms total). This is normal for HTTP→HTTPS or www→non-www.`;
  } else if (result.redirectCount <= 2) {
    status = 'warning';
    message = `${result.redirectCount} redirects detected (${result.totalTimeMs}ms total). Consider reducing to 1 redirect.`;
  } else {
    status = 'warning';
    message = `${result.redirectCount} redirects detected (${result.totalTimeMs}ms total). This redirect chain is hurting your TTFB. Each hop adds latency.`;
  }

  return {
    url,
    finalUrl: result.finalUrl,
    finalStatus: result.finalStatus,
    hops: result.hops,
    redirectCount: result.redirectCount,
    totalTimeMs: result.totalTimeMs,
    status,
    message,
    error: result.error,
  };
}

// Broken links (single page, no crawl)

function extractLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = [];
  const seen = new Set();
  const baseOrigin = new URL(pageUrl).origin;

  function resolveUrl(href) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('data:')) {
      return null;
    }
    try {
      return new URL(href, pageUrl).href;
    } catch {
      return null;
    }
  }

  // <a> tags
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolved = resolveUrl(href || '');
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push({
        sourceUrl: pageUrl,
        targetUrl: resolved,
        anchorText: $(el).text().trim().substring(0, 100) || $(el).attr('title') || '',
        linkType: 'a',
        isInternal: resolved.startsWith(baseOrigin),
      });
    }
  });

  // <img> tags
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const resolved = resolveUrl(src || '');
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push({
        sourceUrl: pageUrl,
        targetUrl: resolved,
        anchorText: $(el).attr('alt') || '',
        linkType: 'img',
        isInternal: resolved.startsWith(baseOrigin),
      });
    }
  });

  // <script> tags
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    const resolved = resolveUrl(src || '');
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push({
        sourceUrl: pageUrl,
        targetUrl: resolved,
        anchorText: '',
        linkType: 'script',
        isInternal: resolved.startsWith(baseOrigin),
      });
    }
  });

  // <link> tags
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolved = resolveUrl(href || '');
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push({
        sourceUrl: pageUrl,
        targetUrl: resolved,
        anchorText: $(el).attr('rel') || '',
        linkType: 'link',
        isInternal: resolved.startsWith(baseOrigin),
      });
    }
  });

  // <iframe> tags
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src');
    const resolved = resolveUrl(src || '');
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push({
        sourceUrl: pageUrl,
        targetUrl: resolved,
        anchorText: $(el).attr('title') || '',
        linkType: 'iframe',
        isInternal: resolved.startsWith(baseOrigin),
      });
    }
  });

  return links;
}

async function checkLink(link) {
  try {
    const start = Date.now();
    const res = await toolFetch(link.targetUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const responseTimeMs = Date.now() - start;

    let statusText;
    if (res.status >= 200 && res.status < 300) {
      statusText = 'ok';
    } else if (res.status >= 300 && res.status < 400) {
      statusText = 'redirect';
    } else if (res.status >= 400) {
      statusText = 'broken';
    } else {
      statusText = 'error';
    }

    return { ...link, statusCode: res.status, statusText, responseTimeMs };
  } catch {
    return { ...link, statusCode: 0, statusText: 'timeout', responseTimeMs: null };
  }
}

export async function checkBrokenLinks(url) {
  const res = await toolFetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(getFetchErrorMessage(res.status, url));
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error('URL does not return HTML content');
  }

  const html = await res.text();
  const discoveredLinks = extractLinks(html, url);

  // Check all discovered links (parallel, batched, max 200)
  const allLinks = [];
  const batchSize = 20;
  for (let i = 0; i < discoveredLinks.length && i < 200; i += batchSize) {
    const batch = discoveredLinks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(checkLink));
    allLinks.push(...results);
  }

  const ok = allLinks.filter(l => l.statusText === 'ok').length;
  const broken = allLinks.filter(l => l.statusText === 'broken').length;
  const redirects = allLinks.filter(l => l.statusText === 'redirect').length;
  const errors = allLinks.filter(l => l.statusText === 'error').length;
  const timeouts = allLinks.filter(l => l.statusText === 'timeout').length;

  // Sort: broken first
  const statusOrder = { broken: 0, timeout: 1, error: 2, redirect: 3, ok: 4 };
  allLinks.sort((a, b) => (statusOrder[a.statusText] ?? 5) - (statusOrder[b.statusText] ?? 5));

  return {
    url,
    depth: 'page',
    pagesScanned: 1,
    pagesScannedList: [url],
    totalLinks: allLinks.length,
    totalDiscoveredLinks: discoveredLinks.length,
    links: allLinks.map(link => ({
      ...link,
      sources: [link.sourceUrl],
    })),
    summary: {
      total: allLinks.length,
      ok,
      broken,
      redirects,
      errors,
      timeouts,
    },
  };
}

// WebMCP and AI readiness

async function checkMcpDiscovery(origin) {
  const mcpJsonUrl = `${origin}/.well-known/mcp.json`;
  const errors = [];

  let data = null;
  let found = false;
  let valid = false;
  let hasAuth = false;

  try {
    const response = await toolFetch(mcpJsonUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      found = true;
      const text = await response.text();

      try {
        data = JSON.parse(text);

        if (data.version && Array.isArray(data.servers)) {
          const serversValid = data.servers.length > 0 && data.servers.every(
            (s) => typeof s.name === 'string' && typeof s.endpoint === 'string'
          );
          if (serversValid) {
            valid = true;
          } else {
            errors.push('Servers array is empty or missing required fields (name, endpoint).');
          }

          hasAuth = data.servers.some(
            (s) => s.authentication !== undefined && s.authentication !== null
          );
        } else {
          if (!data.version) errors.push('Missing required "version" field.');
          if (!Array.isArray(data.servers)) errors.push('Missing or invalid "servers" array.');
        }
      } catch {
        errors.push('Response is not valid JSON.');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
          errors.push(`Content-Type is "${contentType}" (expected application/json).`);
        }
      }
    } else {
      errors.push(`HTTP ${response.status} response from ${mcpJsonUrl}.`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      errors.push('Request to .well-known/mcp.json timed out (5s).');
    } else if (error instanceof TypeError) {
      errors.push(`Network error fetching .well-known/mcp.json: ${error.message}`);
    } else {
      errors.push('Failed to fetch .well-known/mcp.json.');
    }
  }

  let score = 0;
  if (found) score += 50;
  if (valid) score += 25;
  if (hasAuth) score += 25;

  return { score, found, valid, hasAuth, data, errors };
}

function checkDeclarativeTools(html) {
  const findings = [];
  const tools = [];

  const toolnameRegex = /toolname\s*=\s*["']([^"']+)["']/gi;
  const foundToolnames = new Set();
  let match;

  while ((match = toolnameRegex.exec(html)) !== null) {
    foundToolnames.add(match[1]);
  }

  if (foundToolnames.size > 0) {
    findings.push(`Found ${foundToolnames.size} declarative tool(s) with toolname attribute.`);
  }

  for (const toolName of Array.from(foundToolnames)) {
    const tool = { name: toolName, inputCount: 0 };

    const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const descRegex = new RegExp(
      `toolname\\s*=\\s*["']${escapedName}["'][^>]*tooldescription\\s*=\\s*["']([^"']+)["']` +
      `|tooldescription\\s*=\\s*["']([^"']+)["'][^>]*toolname\\s*=\\s*["']${escapedName}["']`,
      'i'
    );
    const descMatch = descRegex.exec(html);
    if (descMatch) {
      tool.description = descMatch[1] || descMatch[2];
    }

    // Look for any element with toolname and count child inputs.
    // Matches div, form, section, or any tag with toolname attribute.
    const containerRegex = new RegExp(
      `<(\\w+)\\b[^>]*\\btoolname\\s*=\\s*["']${escapedName}["'][^>]*>`,
      'i'
    );
    const containerMatch = containerRegex.exec(html);
    if (containerMatch) {
      const tagName = containerMatch[1];
      const startIdx = containerMatch.index + containerMatch[0].length;
      const closeTag = `</${tagName}>`;
      const endIdx = html.indexOf(closeTag, startIdx);
      if (endIdx > startIdx) {
        const innerContent = html.slice(startIdx, endIdx);
        const inputMatches = innerContent.match(/<(input|select|textarea)\b/gi);
        tool.inputCount = inputMatches ? inputMatches.length : 0;
      }
    }

    tools.push(tool);
  }

  const hasAnyTools = tools.length > 0;
  const hasDescriptions = tools.some(t => t.description !== undefined);
  const hasSchemas = tools.some(t => t.inputCount > 0);

  if (hasAnyTools) {
    if (hasDescriptions) {
      findings.push('Tools have tooldescription attributes for AI context.');
    } else {
      findings.push('Tools are missing tooldescription attributes — AI agents may not understand their purpose.');
    }
    if (hasSchemas) {
      findings.push('Tools have form inputs defining their parameter schema.');
    } else {
      findings.push('Tools have no form inputs — AI agents cannot determine required parameters.');
    }
  } else {
    findings.push('No declarative WebMCP tools found (no toolname attributes in HTML).');
  }

  let score = 0;
  if (hasAnyTools) score += 40;
  if (hasDescriptions) score += 30;
  if (hasSchemas) score += 30;

  return { score, toolCount: tools.length, tools, findings };
}

function checkImperativeTools(html) {
  const findings = [];
  let detected = false;
  let registerToolCalls = 0;

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const scriptBlocks = [];
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const tag = scriptMatch[0].substring(0, scriptMatch[0].indexOf('>') + 1);
    if (/\bsrc\s*=/i.test(tag)) continue;
    scriptBlocks.push(scriptMatch[1]);
  }

  const allScriptContent = scriptBlocks.join('\n');

  const modelContextRegex = /navigator\s*\.\s*modelContext/g;
  const modelContextMatches = allScriptContent.match(modelContextRegex);

  if (modelContextMatches && modelContextMatches.length > 0) {
    detected = true;
    findings.push(`Found ${modelContextMatches.length} reference(s) to navigator.modelContext in inline scripts.`);
  }

  const registerToolRegex = /navigator\s*\.\s*modelContext\s*\.\s*registerTool/g;
  const registerMatches = allScriptContent.match(registerToolRegex);

  if (registerMatches) {
    registerToolCalls = registerMatches.length;
    findings.push(`Found ${registerToolCalls} registerTool() call(s).`);
  }

  if (!detected) {
    const htmlModelContext = html.match(/navigator\s*\.\s*modelContext/g);
    if (htmlModelContext && htmlModelContext.length > 0) {
      detected = true;
      findings.push(`Found ${htmlModelContext.length} reference(s) to navigator.modelContext in HTML attributes.`);
    }
  }

  let hasDescriptionsInCode = false;
  if (registerToolCalls > 0) {
    const descInCodeRegex = /registerTool\s*\(\s*\{[^}]*description\s*:/g;
    const descMatches = allScriptContent.match(descInCodeRegex);
    if (descMatches && descMatches.length > 0) {
      hasDescriptionsInCode = true;
      findings.push('registerTool calls include description fields.');
    } else {
      findings.push('registerTool calls may be missing description fields — check implementation.');
    }
  }

  if (!detected) {
    findings.push('No imperative WebMCP tool registration detected in inline scripts.');
    findings.push('Note: This check cannot detect tools registered via external JavaScript files.');
  }

  let score = 0;
  if (detected) score += 50;
  if (hasDescriptionsInCode) score += 50;

  return { score, detected, registerToolCalls, findings };
}

function generateRecommendations(mcpDiscovery, declarative, imperative) {
  const recommendations = [];

  if (!mcpDiscovery.found) {
    recommendations.push(
      'Add a .well-known/mcp.json file to enable MCP server discovery. ' +
      'This lets AI agents find and connect to your API endpoints automatically.'
    );
  } else if (!mcpDiscovery.valid) {
    recommendations.push(
      'Fix the structure of .well-known/mcp.json — it should include a "version" field ' +
      'and a "servers" array where each server has "name" and "endpoint" properties.'
    );
  }

  if (mcpDiscovery.found && !mcpDiscovery.hasAuth) {
    recommendations.push(
      'Consider adding authentication configuration to your MCP servers. ' +
      'This helps AI agents understand how to authenticate with your API.'
    );
  }

  if (declarative.toolCount === 0 && !imperative.detected) {
    recommendations.push(
      'Add WebMCP declarative tools to your HTML using toolname attributes on <form> elements. ' +
      'Example: <form toolname="search" tooldescription="Search products"> to expose functionality to AI agents.'
    );
  }

  if (declarative.toolCount > 0 && !declarative.tools.some(t => t.description)) {
    recommendations.push(
      'Add tooldescription attributes to your WebMCP tools so AI agents understand what each tool does.'
    );
  }

  if (declarative.toolCount > 0 && !declarative.tools.some(t => t.inputCount > 0)) {
    recommendations.push(
      'Add form inputs (input, select, textarea) inside your tool forms to define parameter schemas for AI agents.'
    );
  }

  if (!imperative.detected && declarative.toolCount === 0) {
    recommendations.push(
      'Consider implementing imperative WebMCP tools using navigator.modelContext.registerTool() ' +
      'for dynamic tool registration that depends on runtime state.'
    );
  }

  if (imperative.detected && imperative.registerToolCalls === 0) {
    recommendations.push(
      'navigator.modelContext is referenced but no registerTool() calls were found. ' +
      'Call navigator.modelContext.registerTool() to register tools for AI agents.'
    );
  }

  if (mcpDiscovery.score === 0 && declarative.score === 0 && imperative.score === 0) {
    recommendations.push(
      'This page has no AI/MCP integration. Start with .well-known/mcp.json for server discovery ' +
      'or add toolname attributes to existing forms for quick wins.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Your page has strong AI readiness. Consider testing with AI agents to verify tool discovery and execution work end-to-end.'
    );
  }

  return recommendations;
}

export async function checkWebMcp(url) {
  const origin = new URL(url).origin;

  const mcpDiscovery = await checkMcpDiscovery(origin);

  let html = '';
  try {
    const pageResponse = await toolFetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (pageResponse.ok) {
      html = await pageResponse.text();
      if (html.length > 5 * 1024 * 1024) {
        html = html.substring(0, 5 * 1024 * 1024);
      }
    }
  } catch {
    // Page fetch failure is non-fatal
  }

  const webmcpDeclarative = checkDeclarativeTools(html);
  const webmcpImperative = checkImperativeTools(html);

  const aiReadinessScore = Math.round(
    mcpDiscovery.score * 0.40 +
    webmcpDeclarative.score * 0.30 +
    webmcpImperative.score * 0.30
  );

  const recommendations = generateRecommendations(mcpDiscovery, webmcpDeclarative, webmcpImperative);

  return {
    url,
    aiReadinessScore,
    mcpDiscovery,
    webmcpDeclarative,
    webmcpImperative,
    recommendations,
  };
}
