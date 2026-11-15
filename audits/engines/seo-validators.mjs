// Meta tag and structured data validators. Adapted from PerfMaster's SEO validators.

import * as cheerio from 'cheerio';

// --- Meta tags ---

export function validateMetaFromHtml(html, url) {
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

  const good = tags.filter((t) => t.status === 'good').length;
  const warnings = tags.filter((t) => t.status === 'warning').length;
  const missing = tags.filter((t) => t.status === 'missing').length;

  // Build social preview data
  const ogImage = getMeta('og:image');
  let previewImage = null;
  if (ogImage) {
    try {
      previewImage = ogImage.startsWith('http') ? ogImage : new URL(ogImage, url).href;
    } catch {
      previewImage = ogImage;
    }
  }
  let siteName;
  try {
    siteName = getMeta('og:site_name') || new URL(url).hostname;
  } catch {
    siteName = getMeta('og:site_name') || url;
  }
  const preview = {
    title: getMeta('og:title') || title || url,
    description: getMeta('og:description') || desc || '',
    image: previewImage,
    url: getMeta('og:url') || url,
    siteName,
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

// --- Structured data ---

const SCHEMA_REQUIREMENTS = {
  Article: { required: ['headline', 'author', 'datePublished', 'image'], recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'] },
  NewsArticle: { required: ['headline', 'author', 'datePublished', 'image'], recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'] },
  BlogPosting: { required: ['headline', 'author', 'datePublished', 'image'], recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'] },
  Product: { required: ['name', 'image'], recommended: ['description', 'offers', 'aggregateRating', 'review', 'brand', 'sku'] },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHours', 'image', 'url', 'geo', 'priceRange', 'aggregateRating'] },
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs', 'contactPoint', 'address', 'description'] },
  Person: { required: ['name'], recommended: ['url', 'image', 'jobTitle', 'sameAs'] },
  WebSite: { required: ['name', 'url'], recommended: ['potentialAction', 'description'] },
  WebPage: { required: ['name'], recommended: ['description', 'breadcrumb', 'mainEntity'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  HowTo: { required: ['name', 'step'], recommended: ['description', 'image', 'totalTime', 'estimatedCost'] },
  Recipe: { required: ['name', 'image'], recommended: ['author', 'datePublished', 'description', 'prepTime', 'cookTime', 'recipeIngredient', 'recipeInstructions', 'aggregateRating', 'nutrition'] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['description', 'endDate', 'image', 'offers', 'performer', 'organizer'] },
  VideoObject: { required: ['name', 'description', 'thumbnailUrl', 'uploadDate'], recommended: ['contentUrl', 'duration', 'embedUrl'] },
  Review: { required: ['itemReviewed', 'author', 'reviewRating'], recommended: ['datePublished', 'reviewBody'] },
  SoftwareApplication: { required: ['name', 'offers'], recommended: ['operatingSystem', 'applicationCategory', 'aggregateRating', 'description'] },
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

  const context = obj['@context'];
  if (!context) {
    errors.push('Missing @context. Should be "https://schema.org".');
  } else if (typeof context === 'string' && !context.includes('schema.org')) {
    warnings.push(`@context is "${context}". Expected "https://schema.org".`);
  }

  if (!obj['@type']) {
    errors.push('Missing @type property.');
  }

  const reqs = SCHEMA_REQUIREMENTS[type];
  if (reqs) {
    for (const prop of reqs.required) {
      const present = obj[prop] !== undefined && obj[prop] !== null && obj[prop] !== '';
      properties.push({ name: prop, value: present ? summarizeValue(obj[prop]) : '', required: true, present });
      if (!present) errors.push(`Missing required property "${prop}" for ${type}.`);
    }
    for (const prop of reqs.recommended) {
      const present = obj[prop] !== undefined && obj[prop] !== null && obj[prop] !== '';
      properties.push({ name: prop, value: present ? summarizeValue(obj[prop]) : '', required: false, present });
      if (!present) warnings.push(`Missing recommended property "${prop}" for ${type}.`);
    }
  } else {
    warnings.push(`Schema type "${type}" is valid but not in our validation database. Basic checks only.`);
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@')) continue;
      properties.push({ name: key, value: summarizeValue(val), required: false, present: true });
    }
  }

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

export function validateStructuredDataFromHtml(html, url) {
  const $ = cheerio.load(html);

  const jsonLdItems = extractJsonLd($);
  const microdataItems = extractMicrodata($);
  const allItems = [...jsonLdItems, ...microdataItems];

  const totalErrors = allItems.reduce((sum, item) => sum + item.errors.length, 0);
  const totalWarnings = allItems.reduce((sum, item) => sum + item.warnings.length, 0);
  const validItems = allItems.filter((item) => item.errors.length === 0).length;

  const richResultTypes = new Set([
    'Article', 'NewsArticle', 'BlogPosting', 'Product', 'LocalBusiness',
    'FAQPage', 'HowTo', 'Recipe', 'Event', 'VideoObject', 'Review',
    'BreadcrumbList', 'SoftwareApplication', 'Course', 'JobPosting',
  ]);
  const eligibleTypes = allItems
    .filter((item) => richResultTypes.has(item.type) && item.errors.length === 0)
    .map((item) => item.type);

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
