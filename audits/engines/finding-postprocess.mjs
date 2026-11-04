// Finding post-processing: identity, page context, engine cross-check, self-consistency and severity cap. Adapted from PerfMaster's post-processing engine.
// Every pass may lower severity or rewrite prose. None may drop a finding.
import { AI_THEME_IDS } from './finding-themes.mjs';

// --- Severity ---

const SEVERITY_ORDER = ['P1', 'P2', 'P3'];

// Drop one tier. P3 is the floor: demotion never deletes a finding.
export function demoteSeverity(severity) {
  const i = SEVERITY_ORDER.indexOf(severity);
  return i === -1 ? 'P3' : SEVERITY_ORDER[Math.min(i + 1, SEVERITY_ORDER.length - 1)];
}

// A measurement is a number, not an adjective: prose in `measured` is not evidence.
export function hasMeasurement(finding) {
  const measured = finding.evidence?.measured;
  return typeof measured === 'string' && /\d/.test(measured);
}

// An unmeasured P1 caps at P2. Nothing is dropped.
export function applySeverityCap(findings) {
  return findings.map(f => (f.severity === 'P1' && !hasMeasurement(f) ? { ...f, severity: 'P2' } : f));
}

// --- themeId ---

// Stop words, plus filler that varies between phrasings of one defect.
const THEME_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'of', 'in', 'on', 'across', 'and',
  'or', 'to', 'for', 'with', 'at', 'by', 'from', 'into', 'as', 'be', 'been',
  'it', 'its', 'this', 'that', 'these', 'those', 'has', 'have', 'had',
  'use', 'page',
]);

// Cardinals are counts, and a themeId may never encode a count.
const THEME_CARDINALS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);

// Deliberately narrow: "header" is not folded into "heading" (site header and section heading are different
// defects), and quantity words like few/many stay so "too few CTAs" can never collapse into "too many CTAs".
const THEME_SYNONYMS = {
  conflicting: 'inconsistent',
  different: 'inconsistent',
  differing: 'inconsistent',
  mismatched: 'inconsistent',
  varying: 'inconsistent',
  varied: 'inconsistent',
  inconsistency: 'inconsistent',
  sizing: 'size',
  sized: 'size',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
};

function singularize(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('sses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Deterministic title to theme slug: lowercase, drop measurements, drop stop words, singularize, fold synonyms,
// dedupe, sort, first 8 tokens. Sorting makes wording order irrelevant. This is the fallback for a finding with
// no valid taxonomy id. It aims for a stable id, not a good one: merging harder would hide findings.
export function normalizeFindingTitle(title) {
  const tokens = [];
  const seen = new Set();
  for (const raw of String(title || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    let word = singularize(raw);
    word = THEME_SYNONYMS[word] || word;
    // No measurement or count may reach a themeId, and "1,234px" splits into ['1', '234px'], so any surviving
    // digit-bearing token is dropped. Heading levels are safe: h1..h6 fold to 'heading' above.
    if (/\d/.test(word)) continue;
    if (THEME_STOP_WORDS.has(word) || THEME_CARDINALS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    tokens.push(word);
  }
  return tokens.sort().slice(0, 8).join('-');
}

export function themeIdForAiTitle(title) {
  const slug = normalizeFindingTitle(title);
  return `ai:${slug || 'untitled'}`;
}

// Validate an AI finding's themeId against the closed taxonomy, then namespace it. Anything not in the list falls
// back to the title normalizer, never to a shared bucket, which would merge unrelated defects. A classification
// miss costs grouping quality, never the finding.
export function coerceAiThemeId(raw, title) {
  if (typeof raw === 'string') {
    const id = raw.trim().toLowerCase().replace(/^ai:/, '');
    if (AI_THEME_IDS.has(id)) return `ai:${id}`;
  }
  return themeIdForAiTitle(title);
}

export function themeIdForRule(ruleId) {
  return `eng:${ruleId}`;
}

// The design engine's public rule-id registry. The tables below key off these slugs, and a table keyed on an id
// the engine no longer emits fails open: the lookup silently misses.
export const ENGINE_RULE_IDS = new Set([
  // color / contrast
  'contrast-fail', 'text-color-fragmentation', 'contrast-coverage',
  // typography
  'font-family-fragmentation', 'font-size-fragmentation', 'small-body-text',
  'small-ui-labels', 'tight-leading', 'weak-type-hierarchy', 'typography-coverage',
  // shape / elevation
  'radius-fragmentation', 'radius-off-scale', 'elevation-fragmentation',
  // states
  'stylesheets-unreadable', 'no-hover-styles', 'no-focus-visible', 'no-visible-focus',
  // motion
  'reduced-motion-missing', 'reduced-motion-unknown', 'duration-too-short',
  'duration-too-long', 'linear-movement', 'ease-in-entrance', 'layout-animated',
  'infinite-loop',
  // a11y / layout
  'tap-target', 'tap-target-comfort', 'missing-alt', 'heading-order', 'no-h1',
  'multiple-h1', 'missing-landmarks',
  // performance
  'dom-size',
]);

// Recovers a rule id from the message when an engine build emits none. The ids are the current registry slugs, so
// both land on the same `eng:<ruleId>` themeId. Order is specific-first.
export const ENGINE_RULE_PATTERNS = [
  { re: /below WCAG contrast/i, id: 'contrast-fail' },
  { re: /distinct text colors/i, id: 'text-color-fragmentation' },
  { re: /distinct font-families/i, id: 'font-family-fragmentation' },
  { re: /distinct font-sizes/i, id: 'font-size-fragmentation' },
  { re: /reading-copy text node\(s\) below/i, id: 'small-body-text' },
  { re: /UI label\(s\) at/i, id: 'small-ui-labels' },
  { re: /line-height <|tight leading/i, id: 'tight-leading' },
  { re: /border-radius value\(s\) off/i, id: 'radius-off-scale' },
  { re: /distinct border-radius values/i, id: 'radius-fragmentation' },
  { re: /distinct box-shadow recipes/i, id: 'elevation-fragmentation' },
  { re: /no visible focus indicator/i, id: 'no-visible-focus' },
  { re: /No :focus-visible styles/i, id: 'no-focus-visible' },
  { re: /No :hover styles/i, id: 'no-hover-styles' },
  { re: /no hover feedback|no visual change on hover/i, id: 'hover-no-feedback' },
  { re: /under \d+ms/i, id: 'duration-too-short' },
  { re: /over \d+ms/i, id: 'duration-too-long' },
  { re: /linear easing|linear movement/i, id: 'linear-movement' },
  { re: /using ease-in/i, id: 'ease-in-entrance' },
  { re: /animate layout props/i, id: 'layout-animated' },
  { re: /infinite decorative loop/i, id: 'infinite-loop' },
  { re: /No @media \(prefers-reduced-motion/i, id: 'reduced-motion-missing' },
  { re: /running under prefers-reduced-motion/i, id: 'reduced-motion-ungated' },
  { re: /tap target|pointer target/i, id: 'tap-target' },
  { re: /missing alt text|accessible name/i, id: 'missing-alt' },
  { re: /heading-order jump/i, id: 'heading-order' },
  { re: /No <h1> found/i, id: 'no-h1' },
  { re: /<h1> elements/i, id: 'multiple-h1' },
  { re: /Missing landmark/i, id: 'missing-landmarks' },
  { re: /Weak type hierarchy/i, id: 'weak-type-hierarchy' },
  { re: /DOM elements/i, id: 'dom-size' },
];

// Prefer the engine's own ruleId; otherwise recover it.
export function engineRuleId(message, explicit) {
  if (explicit && /^[a-z][a-z0-9-]*$/.test(explicit)) return explicit;
  for (const rule of ENGINE_RULE_PATTERNS) if (rule.re.test(message)) return rule.id;
  return normalizeFindingTitle(message).split('-').slice(0, 5).join('-') || 'unmapped';
}

// Rules that count or assert something about the whole document and cannot name one offending node.
export const PAGE_LEVEL_RULE_IDS = new Set([
  'text-color-fragmentation', 'font-family-fragmentation', 'font-size-fragmentation',
  'radius-fragmentation', 'radius-off-scale', 'elevation-fragmentation',
  'weak-type-hierarchy', 'dom-size', 'no-hover-styles', 'hover-no-feedback',
  'no-focus-visible', 'reduced-motion-missing', 'reduced-motion-ungated',
  'missing-landmarks', 'no-h1', 'multiple-h1',
]);

// WCAG criteria we can attribute with confidence.
export const WCAG_BY_RULE = {
  'tap-target': '2.5.8',
  // A comfort finding only exists because 2.5.8 was satisfied, outright or via an exception. Naming the criterion
  // keeps `exceptionApplied` auditable.
  'tap-target-comfort': '2.5.8',
  'contrast-fail': '1.4.3',
  'missing-alt': '1.1.1',
  'no-focus-visible': '2.4.7',
  'no-visible-focus': '2.4.7',
  'heading-order': '1.3.1',
  'reduced-motion-missing': '2.3.3',
  'reduced-motion-ungated': '2.3.3',
};

// --- Page context ---

// Harm narratives that require the visitor to have arrived from organic search. Narrow on purpose: it must not
// match a generic mention of "search" (a site search box, a search results template).
export const SEARCH_ARRIVAL_RE = new RegExp(
  [
    'arriv\\w*\\s+(?:on|at|to)?\\s*(?:this\\s+page\\s+)?(?:from|via)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:google|search|organic|serp)',
    'land\\w*\\s+(?:here|on\\s+this\\s+page)?\\s*(?:from|via)\\s+(?:a\\s+|the\\s+)?(?:google|search)',
    '(?:from|via|through)\\s+(?:a\\s+|the\\s+)?(?:google\\s+search|search\\s+engine|search\\s+results?|organic\\s+search)',
    'organic\\s+(?:search|traffic|visitors?|arrivals?|entrances?)',
    'search\\s+(?:visitors?|traffic|arrivals?|entrances?|referrals?)',
    'search[- ]engine\\s+(?:visitors?|traffic|users?|results?\\s+page)',
    '\\bserps?\\b',
    'first[- ]time\\s+(?:searchers?|search\\s+visitors?)',
  ].join('|'),
  'i',
);

export function dependsOnOrganicArrival(finding) {
  return SEARCH_ARRIVAL_RE.test(`${finding.title} ${finding.description}`);
}

// Remove whole sentences that make the search-arrival claim. Returns '' when every sentence made it: the caller
// then substitutes the noindex note, so the finding keeps its title, recommendation and evidence.
export function stripSearchArrivalClause(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter(s => !SEARCH_ARRIVAL_RE.test(s));
  if (kept.length === sentences.length) return String(text || '');
  return kept.join(' ').trim();
}

// On a non-indexable page, drop one tier and strip the arrival clause from any finding whose harm depends on
// organic arrival. Down-rank, never delete.
export function applyPageContext(findings, pageContext) {
  if (!pageContext || pageContext.indexable !== false) return findings;
  const robots = pageContext.robots ? ` (${pageContext.robots})` : '';
  return findings.map(f => {
    if (!dependsOnOrganicArrival(f)) return f;
    const severity = demoteSeverity(f.severity);
    const note =
      `This page is not indexable${robots}, so nobody can arrive here from search — ` +
      `the search-arrival claim was removed${severity === f.severity ? '' : ' and the severity down-ranked'}.`;
    const stripped = stripSearchArrivalClause(f.description);
    return { ...f, severity, description: stripped ? `${stripped} ${note}` : note };
  });
}

// --- Engine cross-check ---

// Properties a deterministic rule also measures: `re` is the wording that claims the property, `ruleIds` the rules
// that would have fired had it failed, `requires` the coverage needed for "did not fire" to mean "passed".
export const COVERED_PROPERTIES = [
  {
    label: 'contrast',
    // "size contrast" and "scale contrast" are typographic, not colour: the contrast rule never measured them.
    re: /(?<!size )(?<!scale )(?<!weight )\bcontrast\b|\billegible\b|\bunreadable text\b/i,
    ruleIds: ['contrast-fail'],
    // A contrast pass that skipped background-image nodes has not cleared a hero overlay.
    requires: c => c.contrastComplete && c.sampleComplete,
  },
  {
    // Only the claim the engine measures: headings that share one size. Subtler claims are never contradicted.
    label: 'type hierarchy',
    re: /\b(?:flat|weak)\s+(?:type|typographic|visual)?\s*hierarchy\b|headings?[^.]{0,40}\b(?:same|identical|indistinguishable)\s+size/i,
    ruleIds: ['weak-type-hierarchy', 'font-size-fragmentation', 'heading-order'],
    requires: c => c.sampleComplete,
  },
  {
    label: 'tap target',
    re: /\b(?:tap|touch|pointer|hit)\s+(?:target|area)\b|too small to (?:tap|click)/i,
    // When every undersized target took the AA spacing exception the engine emits only tap-target-comfort.
    ruleIds: ['tap-target', 'tap-target-comfort'],
    requires: c => c.sampleComplete,
  },
  {
    label: 'motion',
    re: /\b(?:animation|animations|motion|transition|transitions)\b/i,
    ruleIds: [
      'reduced-motion-missing', 'reduced-motion-ungated', 'duration-too-short', 'duration-too-long',
      'linear-movement', 'ease-in-entrance', 'layout-animated', 'infinite-loop',
    ],
    // Cross-origin stylesheets make the CSSOM motion analysis partial.
    requires: c => c.cssomComplete,
  },
];

// The engine measures, AI findings infer. Where a rule covers the same property, ran with full coverage and did not
// fire, the AI finding is flagged contradictedByEngine and drops a tier. Engine findings are never touched, and a
// finding already flagged is left alone.
export function crossCheckAgainstEngine(findings, coverage) {
  if (!coverage) return findings;
  return findings.map(f => {
    if (f.source === 'engine' || f.contradictedByEngine) return f;
    // Match the title only: a title is the claim, while a description mentions neighbouring properties in passing.
    for (const prop of COVERED_PROPERTIES) {
      if (!prop.re.test(f.title)) continue;
      if (!prop.requires(coverage)) continue;
      if (prop.ruleIds.some(id => coverage.ruleIds.has(id))) continue;
      return {
        ...f,
        contradictedByEngine: true,
        severity: demoteSeverity(f.severity),
        description:
          `${f.description} The deterministic ${prop.label} check measured this page and did not flag it, ` +
          'so this observation is unconfirmed and was down-ranked.',
      };
    }
    return f;
  });
}

// --- Self-consistency ---

// Opposed claims that cannot both be actioned. Kept few and literal on purpose.
const CONTRADICTION_PAIRS = [
  {
    id: 'cta-density',
    label: 'CTA density',
    a: /(?:too many|repeated|repetitive|redundant|duplicate|duplicated|competing)[^.]{0,40}\b(?:ctas?|calls?[- ]to[- ]action|primary buttons?)/i,
    b: /(?:add|needs?|missing|lacks?|no|introduce|include)[^.]{0,40}\b(?:another |a second |an additional |more )?(?:ctas?|calls?[- ]to[- ]action)/i,
  },
  {
    id: 'density',
    label: 'content density',
    a: /\btoo (?:dense|cramped|cluttered|crowded)\b|\bovercrowded\b|information overload/i,
    b: /\btoo (?:sparse|empty|airy)\b|excessive (?:whitespace|white space)|too much (?:whitespace|white space)|\bfeels empty\b/i,
  },
  {
    id: 'type-size',
    label: 'type size',
    a: /(?:text|font|type|copy|label)[^.]{0,30}too (?:small|tiny)/i,
    b: /(?:text|font|type|copy|heading)[^.]{0,30}too (?:large|big|oversized)/i,
  },
];

// Two findings on one page pointing in opposite directions cannot both be right, so both are demoted and annotated
// for a human to adjudicate. AI findings on the same device only: the engine measures, and a desktop/mobile
// disagreement is usually legitimate.
export function selfConsistencyPass(findings) {
  const out = [...findings];
  const byDevice = new Map();
  out.forEach((f, i) => {
    if (f.source === 'engine') return;
    const list = byDevice.get(f.device) || [];
    list.push(i);
    byDevice.set(f.device, list);
  });

  for (const indices of Array.from(byDevice.values())) {
    for (const pair of CONTRADICTION_PAIRS) {
      const sideA = [];
      const sideB = [];
      for (const i of indices) {
        const text = `${out[i].title} ${out[i].description}`;
        const isA = pair.a.test(text);
        const isB = pair.b.test(text);
        if (isA && !isB) sideA.push(i);
        else if (isB && !isA) sideB.push(i);
      }
      if (!sideA.length || !sideB.length) continue;
      for (const [side, other] of [[sideA, sideB], [sideB, sideA]]) {
        for (const i of side) {
          out[i] = {
            ...out[i],
            severity: demoteSeverity(out[i].severity),
            description:
              `${out[i].description} Contradicts "${out[other[0]].title}" on the same page ` +
              `(${pair.label}) — both were down-ranked for manual adjudication.`,
          };
        }
      }
    }
  }
  return out;
}

// --- Identity and provenance stamping ---

const RENDER_CONTEXTS = new Set(['svg', 'canvas', 'aria-hidden', 'dom']);

export function coerceRenderContext(value) {
  return typeof value === 'string' && RENDER_CONTEXTS.has(value) ? value : 'dom';
}

// themeId, viewport, renderContext default, observedOn and sampleSize.
export function stampIdentity(finding, ctx) {
  const themeId = finding.themeId
    || (finding.source === 'engine'
      ? themeIdForRule(engineRuleId(finding.title))
      : themeIdForAiTitle(finding.title));
  return {
    ...finding,
    themeId,
    renderContext: coerceRenderContext(finding.renderContext),
    ...(finding.viewport || !ctx.viewport ? {} : { viewport: ctx.viewport }),
    observedOn: finding.observedOn ?? ctx.observedOn ?? 1,
    sampleSize: finding.sampleSize ?? ctx.sampleSize ?? 1,
  };
}

// Run every pass in order. Severity-lowering passes run before the cap so a demotion can never be undone, and the
// cap is idempotent.
export function postProcessFindings(findings, ctx) {
  let out = findings.map(f => stampIdentity(f, ctx));
  out = applyPageContext(out, ctx.pageContext);
  out = crossCheckAgainstEngine(out, ctx.coverage);
  out = selfConsistencyPass(out);
  out = applySeverityCap(out);
  return out;
}
