// UX heuristics: DOM context, deterministic findings and scoring. Adapted from PerfMaster's UX engine.
import { m3FindingsToUXFindings, engineCoverageFrom } from './design.mjs';
import { postProcessFindings } from './finding-postprocess.mjs';

const SEVERITY_DEDUCTIONS = {
  P1: 12,
  P2: 5,
  P3: 2,
};

const CATEGORY_TO_SCORE_FIELD = {
  'Typography': 'typographyScore',
  'Color/Contrast': 'contrastScore',
  'Layout': 'layoutScore',
  'Spacing': 'layoutScore',
  'Visual Hierarchy': 'layoutScore',
  'Mobile Responsiveness': 'responsiveScore',
  'Navigation': 'navigationScore',
  'CTA': 'navigationScore',
  'Content': 'contentScore',
  'Imagery': 'contentScore',
  'Accessibility': 'contrastScore',
  'Consistency': 'layoutScore',
  'Forms': 'navigationScore',
  'Performance Indicators': 'contentScore',
};

// --- DOM collection ---

export async function collectDOMContext(page) {
  return await page.evaluate(() => {
    // Relative luminance per WCAG 2.0
    function luminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function parseColor(color) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }

    function contrastRatio(fg, bg) {
      const fgRGB = parseColor(fg);
      const bgRGB = parseColor(bg);
      if (!fgRGB || !bgRGB) return 0;
      const l1 = luminance(...fgRGB);
      const l2 = luminance(...bgRGB);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    // Visible text elements (top 50)
    const textSelectors = 'p, span, h1, h2, h3, h4, h5, h6, li, a, button, label, td, th, blockquote, figcaption';
    const allTextEls = Array.from(document.querySelectorAll(textSelectors));
    const textElements = [];
    for (const el of allTextEls) {
      if (textElements.length >= 50) break;
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      textElements.push({
        tag: el.tagName.toLowerCase(),
        text: text.substring(0, 50),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        contrastRatio: Math.round(contrastRatio(style.color, style.backgroundColor) * 100) / 100,
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }

    // Interactive elements (buttons and links)
    const interactiveEls = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'));
    const interactiveElements = [];
    for (const el of interactiveEls) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      interactiveElements.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().substring(0, 50),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
      });
    }

    // Images
    const imgEls = Array.from(document.querySelectorAll('img'));
    const images = [];
    for (const img of imgEls) {
      if (!isVisible(img)) continue;
      const rect = img.getBoundingClientRect();
      images.push({
        src: (img.src || '').substring(0, 80),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        hasAlt: !!img.alt,
      });
    }

    // Heading hierarchy
    const headingEls = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headings = headingEls
      .filter(el => isVisible(el))
      .map(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().substring(0, 60),
          fontSize: style.fontSize,
          x: Math.round(rect.x + window.scrollX),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });

    // Viewport overflow and sticky/fixed chrome walk the same element list. Positioning cannot be read from a
    // screenshot, so it has to come from the DOM.
    const selectorOf = el => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : '';
      return `${tag}${id}${cls}`;
    };
    const overflowElements = [];
    const stickyElements = [];
    const allEls = document.querySelectorAll('*');
    for (const el of Array.from(allEls)) {
      if (overflowElements.length < 10 && el.scrollWidth > el.clientWidth + 2) {
        overflowElements.push(selectorOf(el));
      }
      if (stickyElements.length < 10) {
        const pos = window.getComputedStyle(el).position;
        if (pos === 'sticky' || pos === 'fixed') stickyElements.push(`${selectorOf(el)} (${pos})`);
      }
      if (overflowElements.length >= 10 && stickyElements.length >= 10) break;
    }

    return {
      textElements,
      interactiveElements,
      images,
      headings,
      overflowElements,
      stickyElements,
      documentDimensions: {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
    };
  });
}

// Only string and number fields survive, and a block with nothing usable is dropped so the P1 cap still applies.
export function parseAIEvidence(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw;
  const str = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
  const evidence = {
    measured: str(e.measured),
    required: str(e.required),
    selector: str(e.selector),
    sample: str(e.sample),
    ...(typeof e.count === 'number' && isFinite(e.count) ? { count: e.count } : {}),
  };
  return Object.values(evidence).some(v => v !== undefined) ? evidence : undefined;
}

// --- Scoring ---

// Scores AI findings only. Engine findings never deduct from these dimensions: they carry their own design score.
export function calculateScores(findings) {
  const scores = {
    typographyScore: 100,
    contrastScore: 100,
    layoutScore: 100,
    responsiveScore: 100,
    navigationScore: 100,
    contentScore: 100,
  };

  for (const finding of findings) {
    const deduction = SEVERITY_DEDUCTIONS[finding.severity] || 2;
    const field = CATEGORY_TO_SCORE_FIELD[finding.category];
    if (field && field in scores) {
      scores[field] = Math.max(0, scores[field] - deduction);
    }
  }

  // Clamp all scores to 0-100
  for (const key of Object.keys(scores)) {
    scores[key] = Math.max(0, Math.min(100, scores[key]));
  }

  // Overall UX score is a weighted average
  const uxScore = Math.round(
    scores.typographyScore * 0.18 +
    scores.contrastScore * 0.15 +
    scores.layoutScore * 0.22 +
    scores.responsiveScore * 0.20 +
    scores.navigationScore * 0.13 +
    scores.contentScore * 0.12,
  );

  return {
    uxScore: Math.max(0, Math.min(100, uxScore)),
    typographyScore: scores.typographyScore,
    contrastScore: scores.contrastScore,
    layoutScore: scores.layoutScore,
    responsiveScore: scores.responsiveScore,
    navigationScore: scores.navigationScore,
    contentScore: scores.contentScore,
  };
}

// --- Scan ---

// The viewport every measurement in this pass is bound to.
export function viewportOf(page, formFactor) {
  const vp = page.viewport();
  if (!vp) return undefined;
  return {
    width: vp.width,
    height: vp.height,
    dpr: vp.deviceScaleFactor ?? 1,
    isMobile: vp.isMobile ?? formFactor === 'mobile',
  };
}

// Scores stay null: they come from AI findings, which join at the merge step. Null never reads as a clean audit,
// where 100 from an empty list would.
export async function runDeterministicUXScan(url, page, formFactor, design, pageContext) {
  const viewport = viewportOf(page, formFactor);

  // One page per scan, so observedOn and sampleSize are 1/1.
  const postCtx = {
    device: formFactor,
    viewport,
    pageContext,
    coverage: engineCoverageFrom(design?.report),
    observedOn: 1,
    sampleSize: 1,
  };

  // Wait for full rendering: fonts, images, lazy-loaded content.
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
    await page.evaluate(() => new Promise(resolve => {
      if (document.readyState === 'complete') {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      } else {
        window.addEventListener('load', () => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      }
    }));
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch {
    /* non-fatal */
  }

  // Full-page screenshot. Viewport-fixed elements are hidden first: a full-page capture renders them once at the top,
  // over real content. Sticky elements stay: the expanded viewport never scrolls, so they render once in natural flow.
  let screenshotBase64;
  try {
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        const pos = window.getComputedStyle(el).position;
        if (pos === 'fixed') {
          el.dataset.uxHidden = '1';
          el.style.setProperty('visibility', 'hidden', 'important');
        }
      });
    });
    const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 35 });
    screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');
    await page.evaluate(() => {
      document.querySelectorAll('[data-ux-hidden]').forEach(el => {
        el.style.removeProperty('visibility');
        delete el.dataset.uxHidden;
      });
    });
  } catch (err) {
    throw new Error(`UX scan failed (${formFactor}): screenshot capture — ${err.message}`);
  }

  // An empty DOM context is not an empty page: the walk can lose its execution context right after the memory-peak
  // screenshot, and the all-empty fallback looks like a page with nothing on it. domContextError records the difference.
  let domContext;
  let domContextError;
  try {
    domContext = await collectDOMContext(page);
  } catch (err) {
    domContextError = err.message;
    domContext = {
      textElements: [],
      interactiveElements: [],
      images: [],
      headings: [],
      overflowElements: [],
      stickyElements: [],
      documentDimensions: { scrollHeight: 0, clientHeight: 0, scrollWidth: 0, clientWidth: 0 },
    };
  }

  // With no design report nothing was measured, and an empty list would read as a clean page.
  if (!design?.report) {
    throw new Error(`UX scan failed (${formFactor}): no design report${design?.error ? ` — ${design.error}` : ''}`);
  }

  const findings = postProcessFindings(m3FindingsToUXFindings(design.report, formFactor, { viewport }), postCtx);

  return {
    uxScore: null,
    typographyScore: null,
    contrastScore: null,
    layoutScore: null,
    responsiveScore: null,
    navigationScore: null,
    contentScore: null,
    totalIssues: findings.length,
    p1Count: findings.filter(f => f.severity === 'P1').length,
    p2Count: findings.filter(f => f.severity === 'P2').length,
    p3Count: findings.filter(f => f.severity === 'P3').length,
    findings,
    pageContext,
    scanData: {
      ...(formFactor === 'desktop'
        ? { desktopScreenshotBase64: screenshotBase64 }
        : { mobileScreenshotBase64: screenshotBase64 }),
      domContext,
      ...(domContextError ? { domContextError } : {}),
    },
  };
}
