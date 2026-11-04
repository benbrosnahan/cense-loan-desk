/* Vendored from designMaster (JBC-Growth/designMaster) v1.3.0 — dist/audit.standalone.js,
 * unmodified build artifact. Licensed under the Apache License, Version 2.0.
 * See NOTICE at the repo root. Do not edit; re-vendor from designMaster to upgrade. */
/* designMaster M3 audit — standalone (generated). Installs window.M3Audit; auto-runs if window.M3AuditAutorun !== false. */
(() => {
  // src/audit/audit.js
  var SHAPE_SCALE = [0, 4, 8, 12, 16, 28, 9999];
  var ELEVATION_LEVELS = 6;
  var DURATION_MIN_MS = 50;
  var DURATION_MAX_MS = 1e3;
  var AMBIENT_RE = /progress|spinner|loading|loader|skel|shimmer|placeholder/i;
  var SAMPLE_CAP = 1500;
  var TIGHT_LEADING_MIN = 1.25;
  var WRAP_MIN_LINES = 2;
  var COPY_MIN_LINES = 3;
  var COPY_MIN_CHARS = 30;
  var DISPLAY_MIN_PX = 32;
  var DISPLAY_LEADING_MIN = 1.1;
  var TARGET_MIN_AA = 24;
  var TARGET_COMFORT = 48;
  var SPACING_EXCEPTION_MAX_TARGETS = 400;
  var LAYOUT_ANIMATED_PROPS = [
    "width",
    "height",
    "top",
    "left",
    "right",
    "bottom",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding",
    "inset",
    "block-size",
    "inline-size"
  ];
  var MOVEMENT_PROPS = [
    "transform",
    "top",
    "left",
    "right",
    "bottom",
    "translate",
    "width",
    "height",
    "margin",
    "scale",
    "rotate"
  ];
  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }
  function round(n, dp = 2) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
  }
  function safeStyle(el) {
    try {
      return getComputedStyle(el);
    } catch (e) {
      return null;
    }
  }
  function safeRect(el) {
    try {
      return el.getBoundingClientRect();
    } catch (e) {
      return null;
    }
  }
  function safeRectCount(el) {
    try {
      const list = el.getClientRects ? el.getClientRects() : null;
      return list ? list.length : 0;
    } catch (e) {
      return 0;
    }
  }
  function safeMatches(el, sel) {
    try {
      return typeof el.matches === "function" && el.matches(sel);
    } catch (e) {
      return false;
    }
  }
  function safeAttr(el, name) {
    try {
      return el.getAttribute ? el.getAttribute(name) : null;
    } catch (e) {
      return null;
    }
  }
  function classSig(el) {
    try {
      const tag = (el.tagName || "?").toLowerCase();
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
      return cls ? tag + "." + cls : tag;
    } catch (e) {
      return "?";
    }
  }
  var _colorProbe = null;
  var _colorCache = /* @__PURE__ */ new Map();
  function parseColor(str) {
    if (!str) return null;
    if (str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    if (typeof getComputedStyle === "undefined" || typeof document === "undefined") return null;
    if (_colorCache.has(str)) return _colorCache.get(str);
    try {
      if (!_colorProbe || !_colorProbe.isConnected) {
        _colorProbe = document.createElement("span");
        _colorProbe.style.cssText = "position:absolute!important;left:-9999px!important;top:-9999px!important;width:0;height:0;pointer-events:none;";
        (document.body || document.documentElement).appendChild(_colorProbe);
      }
      _colorProbe.style.removeProperty("color");
      _colorProbe.style.setProperty("color", str, "important");
      if (!_colorProbe.style.color) {
        _colorCache.set(str, null);
        return null;
      }
      const parsed = safeStyle(_colorProbe);
      const out = parsed ? parseResolvedColor(parsed.color) : null;
      if (_colorCache.size < 500) _colorCache.set(str, out);
      return out;
    } catch (e) {
      return null;
    }
  }
  function parseResolvedColor(parsed) {
    if (!parsed) return null;
    let m = parsed.match(/^rgba?\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      if (parts.length < 3 || parts.slice(0, 3).some((n) => !isFinite(n))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] == null || !isFinite(parts[3]) ? 1 : parts[3] };
    }
    m = parsed.match(/^color\(srgb\s+([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
      if (parts.length < 3 || parts.slice(0, 3).some((n) => !isFinite(n))) return null;
      return {
        r: clamp(parts[0], 0, 1) * 255,
        g: clamp(parts[1], 0, 1) * 255,
        b: clamp(parts[2], 0, 1) * 255,
        a: parts[3] == null || !isFinite(parts[3]) ? 1 : parts[3]
      };
    }
    return null;
  }
  function relLuminance({ r, g, b }) {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function composite(fg, bg) {
    const a = fg.a == null ? 1 : fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1
    };
  }
  function contrastRatio(fg, bg) {
    const L1 = relLuminance(fg);
    const L2 = relLuminance(bg);
    const light = Math.max(L1, L2);
    const dark = Math.min(L1, L2);
    return (light + 0.05) / (dark + 0.05);
  }
  function effectiveBackground(el) {
    const stack = [];
    let node = el;
    let unknown = false;
    let hops = 0;
    while (node && node.nodeType === 1 && hops++ < 200) {
      const cs = safeStyle(node);
      if (!cs) break;
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        unknown = true;
        break;
      }
      const raw = cs.backgroundColor;
      const bg = parseColor(raw);
      if (!bg && raw && raw !== "transparent") {
        unknown = true;
        break;
      }
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a >= 1) break;
      }
      let next = node.parentElement;
      if (!next) {
        try {
          const rootNode = node.getRootNode && node.getRootNode();
          next = rootNode && rootNode.host ? rootNode.host : null;
        } catch (e) {
          next = null;
        }
      }
      node = next;
    }
    let base = null;
    const baseEl = typeof document !== "undefined" ? document.body || document.documentElement : null;
    if (baseEl) {
      const cs = safeStyle(baseEl);
      if (cs) base = parseColor(cs.backgroundColor);
    }
    if (!base || base.a === 0) base = { r: 255, g: 255, b: 255, a: 1 };
    let acc = base;
    for (let i = stack.length - 1; i >= 0; i--) acc = composite(stack[i], acc);
    return { color: acc, unknown };
  }
  function isVisibleCs(el, cs) {
    if (!cs) return false;
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity) === 0) return false;
    if (cs.display === "contents") return true;
    const r = safeRect(el);
    if (!r || r.width <= 0 || r.height <= 0) return false;
    return true;
  }
  function hasText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length) return true;
    }
    return false;
  }
  function fontSizePx(cs) {
    return parseFloat(cs.fontSize) || 16;
  }
  function isLargeText(cs) {
    const px = fontSizePx(cs);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    return px >= 24 || px >= 18.66 && weight >= 700;
  }
  function isVerticalWritingMode(cs) {
    const wm = cs && cs.writingMode ? String(cs.writingMode) : "";
    return /^(vertical|sideways|tb)/.test(wm);
  }
  function textLineRows(el, cs) {
    try {
      if (typeof document === "undefined" || !document.createRange) return 0;
      const vertical = isVerticalWritingMode(cs || safeStyle(el));
      const starts = /* @__PURE__ */ new Set();
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          if (rects[i].width <= 0 && rects[i].height <= 0) continue;
          starts.add(Math.round(vertical ? rects[i].left : rects[i].top));
        }
      }
      return starts.size;
    } catch (e) {
      return 0;
    }
  }
  function lineBoxCount(el, cs, px, lhPx) {
    if (!cs) return 0;
    const rows = textLineRows(el, cs);
    if (rows > 0) return rows;
    if (cs.display === "inline") {
      const n = safeRectCount(el);
      if (n > 0) return n;
    }
    const rect = safeRect(el);
    if (!rect) return 0;
    const edge = (v) => parseFloat(v) || 0;
    const vertical = isVerticalWritingMode(cs);
    const contentBlock = vertical ? rect.width - edge(cs.paddingLeft) - edge(cs.paddingRight) - edge(cs.borderLeftWidth) - edge(cs.borderRightWidth) : rect.height - edge(cs.paddingTop) - edge(cs.paddingBottom) - edge(cs.borderTopWidth) - edge(cs.borderBottomWidth);
    const step = lhPx && lhPx > 0 ? lhPx : (px || 16) * 1.2;
    if (!(contentBlock > 0) || !(step > 0)) return 0;
    return contentBlock / step;
  }
  function forcedLineBreaks(el, cs) {
    let n = 0;
    try {
      for (const child of el.children) {
        if (child.tagName && String(child.tagName).toUpperCase() === "BR") n++;
      }
      if (/^(pre|pre-wrap|pre-line|break-spaces)$/.test(cs ? cs.whiteSpace : "")) {
        for (const node of el.childNodes) {
          if (node.nodeType !== 3) continue;
          const m = node.textContent.match(/\n/g);
          if (m) n += m.length;
        }
      }
    } catch (e) {
      return n;
    }
    return n;
  }
  function wrappedLineCount(el, cs, lines) {
    if (!(lines > 0)) return 0;
    return Math.max(1, lines - forcedLineBreaks(el, cs));
  }
  function isCopyText(cs, txt) {
    if (!txt || txt.length < COPY_MIN_CHARS) return false;
    if (cs && cs.textTransform === "uppercase") return false;
    return true;
  }
  var RENDER_CONTEXTS = ["dom", "svg", "canvas", "aria-hidden"];
  function renderContextFor(el, parentRc) {
    let tag = "";
    try {
      tag = (el.tagName ? String(el.tagName) : "").toLowerCase();
    } catch (e) {
      return parentRc;
    }
    if (tag === "foreignobject") return "dom";
    if (parentRc !== "dom") return parentRc;
    if (tag === "svg") return "svg";
    if (tag === "canvas") return "canvas";
    return "dom";
  }
  function collectSamples(root) {
    const samples = [];
    const state = { sampleCapped: false, openShadowRoots: 0 };
    if (!root) return { samples, ...state };
    const start = root.nodeType === 9 ? root.documentElement || null : root;
    if (!start) return { samples, ...state };
    const stack = [{ el: start, rc: "dom" }];
    while (stack.length) {
      if (samples.length >= SAMPLE_CAP) {
        state.sampleCapped = true;
        break;
      }
      const entry = stack.pop();
      const el = entry && entry.el;
      if (!el || el.nodeType !== 1) continue;
      if (safeAttr(el, "aria-hidden") === "true") continue;
      const cs = safeStyle(el);
      if (cs && cs.display === "none") continue;
      const rc = renderContextFor(el, entry.rc);
      if (isVisibleCs(el, cs)) samples.push({ el, cs, rc });
      try {
        if (el.shadowRoot) {
          state.openShadowRoots++;
          const kids2 = el.shadowRoot.children;
          for (let i = kids2.length - 1; i >= 0; i--) stack.push({ el: kids2[i], rc });
        }
        const kids = el.children;
        for (let i = kids.length - 1; i >= 0; i--) stack.push({ el: kids[i], rc });
      } catch (e) {
      }
    }
    return { samples, ...state };
  }
  function readStyleSheets() {
    const readable = [];
    let skipped = 0;
    let listUnreadable = false;
    let sheets;
    try {
      sheets = document.styleSheets;
    } catch (e) {
      listUnreadable = true;
      sheets = null;
    }
    if (sheets) {
      for (let i = 0; i < sheets.length; i++) {
        let rules = null;
        try {
          rules = sheets[i].cssRules;
        } catch (e) {
          skipped++;
          continue;
        }
        if (rules) readable.push(rules);
      }
    }
    return { readable, skipped, listUnreadable, anySkipped: skipped > 0 || listUnreadable };
  }
  function walkRules(rules, fn, state) {
    for (const rule of rules) {
      try {
        fn(rule);
      } catch (e) {
      }
      let child = null;
      try {
        child = rule.cssRules;
      } catch (e) {
      }
      if (child) walkRules(child, fn, state);
      let importedSheet = null;
      try {
        importedSheet = rule.styleSheet;
      } catch (e) {
      }
      if (importedSheet) {
        let imported = null;
        try {
          imported = importedSheet.cssRules;
        } catch (e) {
          if (state) state.skipped++;
        }
        if (imported) walkRules(imported, fn, state);
      }
    }
  }
  function makeReport() {
    return {
      score: 0,
      grade: "",
      buckets: {
        accessibility: { score: 0, max: 30, findings: [] },
        consistency: { score: 0, max: 20, findings: [] },
        motion: { score: 0, max: 25, findings: [] },
        performance: { score: 0, max: 25, findings: [] }
      },
      sections: {},
      notAutoDetectable: [],
      meta: {}
    };
  }
  var RULE_IDS = [
    // color / contrast
    "contrast-fail",
    "text-color-fragmentation",
    "contrast-coverage",
    // typography
    "font-family-fragmentation",
    "font-size-fragmentation",
    "small-body-text",
    "small-ui-labels",
    "tight-leading",
    "weak-type-hierarchy",
    "typography-coverage",
    // shape / elevation
    "radius-fragmentation",
    "radius-off-scale",
    "elevation-fragmentation",
    // states
    "stylesheets-unreadable",
    "no-hover-styles",
    "no-focus-visible",
    "no-visible-focus",
    // motion
    "reduced-motion-missing",
    "reduced-motion-unknown",
    "duration-too-short",
    "duration-too-long",
    "linear-movement",
    "ease-in-entrance",
    "layout-animated",
    "infinite-loop",
    // a11y / layout
    "tap-target",
    "tap-target-comfort",
    "missing-alt",
    "heading-order",
    "no-h1",
    "multiple-h1",
    "missing-landmarks",
    // performance
    "dom-size"
  ];
  function finding(sev, ruleId, message, extra) {
    return Object.assign({ severity: sev, ruleId, message }, extra || {});
  }
  function contributorsFrom(map, fmt, limit) {
    const out = [];
    try {
      const rows = [...map.entries()].sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
      for (const [key, rec] of rows.slice(0, limit || 6)) {
        out.push({ selector: String(rec.sig || "?"), value: String(fmt(key, rec)) });
      }
    } catch (e) {
    }
    return out;
  }
  function tally(map, key, el) {
    const rec = map.get(key) || { count: 0, sig: el ? classSig(el) : "?" };
    rec.count++;
    map.set(key, rec);
    return rec;
  }
  function selSig(sel) {
    const s = String(sel || "").replace(/\s+/g, " ").trim();
    return s.length > 80 ? s.slice(0, 79) + "\u2026" : s || "?";
  }
  function auditColorContrast(samples, ctx) {
    ctx = ctx || {};
    const textColors = /* @__PURE__ */ new Map();
    const section = { sampled: 0, skippedUnknownBg: 0, skippedUnparseable: 0, skippedRenderContext: 0 };
    const failures = [];
    for (const { el, cs, rc } of samples) {
      if (!hasText(el)) continue;
      if (rc && rc !== "dom") {
        section.skippedRenderContext++;
        continue;
      }
      const fgRaw = cs.color;
      const fg = parseColor(fgRaw);
      if (!fg) {
        section.skippedUnparseable++;
        continue;
      }
      tally(textColors, fgRaw.replace(/\s+/g, ""), el);
      const bg = effectiveBackground(el);
      if (bg.unknown) {
        section.skippedUnknownBg++;
        continue;
      }
      section.sampled++;
      const composedFg = composite(fg, bg.color);
      const ratio = contrastRatio(composedFg, bg.color);
      if (!isFinite(ratio)) {
        section.skippedUnparseable++;
        continue;
      }
      const large = isLargeText(cs);
      const threshold = large ? 3 : 4.5;
      if (ratio < threshold) {
        failures.push({
          el,
          sig: classSig(el),
          ratio: round(ratio, 2),
          threshold,
          large,
          fg: fgRaw,
          sample: (el.textContent || "").trim().slice(0, 40)
        });
      }
    }
    section.distinctTextColors = textColors.size;
    section.failureCount = failures.length;
    section.failures = failures.slice(0, 50);
    const findings = [];
    if (failures.length) {
      findings.push(finding(
        "error",
        "contrast-fail",
        `${failures.length} text node(s) below WCAG contrast (4.5:1 normal / 3:1 large).`,
        {
          count: failures.length,
          examples: failures.slice(0, 8),
          scope: "element",
          renderContext: "dom",
          wcagCriterion: "1.4.3",
          required: "\u22654.5:1 (3:1 large)"
        }
      ));
    }
    if (section.distinctTextColors > 8) {
      findings.push(finding(
        "warn",
        "text-color-fragmentation",
        `${section.distinctTextColors} distinct text colors \u2014 color fragmentation (M3 uses a small set of on-* roles).`,
        {
          count: section.distinctTextColors,
          scope: "page",
          contributors: contributorsFrom(textColors, (color, rec) => `${color} \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    const skippedTotal = section.skippedUnknownBg + section.skippedUnparseable + section.skippedRenderContext;
    if (skippedTotal) {
      findings.push(finding(
        "info",
        "contrast-coverage",
        `Contrast skipped for ${skippedTotal} element(s) (background images/gradients, colors not resolvable to sRGB, or <svg>/<canvas> artwork) \u2014 check those manually.`,
        {
          skippedUnknownBg: section.skippedUnknownBg,
          skippedUnparseable: section.skippedUnparseable,
          skippedRenderContext: section.skippedRenderContext,
          scope: "page"
        }
      ));
    }
    return { section, findings };
  }
  function auditTypography(samples, ctx) {
    ctx = ctx || {};
    const viewport = ctx.viewport || null;
    const families = /* @__PURE__ */ new Map();
    const sizes = /* @__PURE__ */ new Map();
    const lineHeights = /* @__PURE__ */ new Set();
    const smallBody = [];
    const smallLabels = [];
    const tightLeading = [];
    const headings = [];
    let bodySampled = 0;
    let headingCount = 0;
    let skippedRenderContext = 0;
    let displayLeadingRelaxed = 0;
    let formattedBlocksSkipped = 0;
    const headingSizes = /* @__PURE__ */ new Set();
    for (const { el, cs, rc } of samples) {
      if (rc && rc !== "dom") {
        skippedRenderContext++;
        continue;
      }
      const tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      const isHeading = /^h[1-6]$/.test(tag);
      if (isHeading) {
        headingCount++;
        headingSizes.add(round(fontSizePx(cs), 1));
        if (headings.length < 24) headings.push({ sig: classSig(el), tag, px: round(fontSizePx(cs), 1) });
      }
      if (!hasText(el)) continue;
      tally(families, cs.fontFamily, el);
      const px = fontSizePx(cs);
      tally(sizes, round(px, 1), el);
      const lhRaw = cs.lineHeight;
      let lhRatio = null;
      let lhPx = null;
      if (lhRaw && lhRaw !== "normal") {
        const parsed = parseFloat(lhRaw);
        if (!isNaN(parsed) && px) {
          lhPx = parsed;
          lhRatio = parsed / px;
        }
      }
      if (lhRatio != null) lineHeights.add(round(lhRatio, 2));
      if (!isHeading) {
        bodySampled++;
        const LABELISH = /eyebrow|kicker|badge|chip|tag\b|label|meta|sku|count|price|date|stars|caption|__u\b|terms|hd\b|note/i;
        const txt = (el.textContent || "").trim();
        const isProse = txt.length >= 25 && safeMatches(el, "p, li, dd, blockquote") && !LABELISH.test(typeof el.className === "string" ? el.className : "");
        if (px < 16) {
          const entry = { el, sig: classSig(el), px: round(px, 1), sample: txt.slice(0, 40) };
          if (px < 11 || isProse && px < 16) smallBody.push(entry);
          else smallLabels.push(entry);
        }
        const displayType = px >= DISPLAY_MIN_PX;
        const leadingFloor = displayType ? DISPLAY_LEADING_MIN : TIGHT_LEADING_MIN;
        if (displayType && lhRatio != null && lhRatio < TIGHT_LEADING_MIN && lhRatio >= leadingFloor) {
          displayLeadingRelaxed++;
        }
        if (lhRatio != null && lhRatio < leadingFloor) {
          const lines = lineBoxCount(el, cs, px, lhPx);
          const wrapped = wrappedLineCount(el, cs, lines);
          const wrapsAsCopy = !displayType && wrapped >= COPY_MIN_LINES;
          if (wrapsAsCopy || wrapped >= WRAP_MIN_LINES && isCopyText(cs, txt)) {
            tightLeading.push({
              el,
              sig: classSig(el),
              lineHeight: round(lhRatio, 2),
              px: round(px, 1),
              lines: round(lines, 1),
              wrapped: round(wrapped, 1),
              chars: txt.length,
              /* Which floor judged it, and which gate admitted it: a measurement
                 or the tiebreaker. `floor` is carried per entry because the
                 finding's `required` states the BODY floor, and a display-band
                 entry was held to a different one. */
              band: displayType ? "display" : "body",
              floor: leadingFloor,
              basis: wrapsAsCopy ? "line-boxes" : "copy-text"
            });
          } else if (!displayType && lines >= COPY_MIN_LINES && wrapped < COPY_MIN_LINES) {
            formattedBlocksSkipped++;
          }
        }
      }
    }
    const section = {
      distinctFamilies: families.size,
      families: [...families.keys()].slice(0, 12),
      distinctSizes: sizes.size,
      sizes: [...sizes.keys()].sort((a, b) => a - b),
      distinctLineHeights: lineHeights.size,
      smallBodyCount: smallBody.length,
      smallBody: smallBody.slice(0, 150),
      smallLabelCount: smallLabels.length,
      smallLabels: smallLabels.slice(0, 12),
      tightLeadingCount: tightLeading.length,
      tightLeading: tightLeading.slice(0, 100),
      displayLeadingRelaxed,
      formattedBlocksSkipped,
      distinctHeadingSizes: headingSizes.size,
      headingCount,
      skippedRenderContext
    };
    const findings = [];
    if (families.size > 3) {
      findings.push(finding(
        "warn",
        "font-family-fragmentation",
        `${families.size} distinct font-families \u2014 M3 favors 1-2 (brand + plain).`,
        {
          count: families.size,
          scope: "page",
          contributors: contributorsFrom(families, (fam, rec) => `${String(fam).slice(0, 48)} \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    if (sizes.size > 12) {
      findings.push(finding(
        "warn",
        "font-size-fragmentation",
        `${sizes.size} distinct font-sizes \u2014 M3 type scale has 15 named roles; unusually high counts suggest ad-hoc sizing.`,
        {
          count: sizes.size,
          scope: "page",
          contributors: contributorsFrom(sizes, (px, rec) => `${px}px \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    if (smallBody.length) {
      findings.push(finding(
        "warn",
        "small-body-text",
        `${smallBody.length} reading-copy text node(s) below 16px (or any text below 11px).`,
        {
          count: smallBody.length,
          examples: smallBody.slice(0, 8),
          scope: "element",
          renderContext: "dom",
          required: "\u226516px (\u226511px absolute)",
          viewport
        }
      ));
    }
    if (smallLabels.length) {
      findings.push(finding(
        "info",
        "small-ui-labels",
        `${smallLabels.length} UI label(s) at 12-15.9px \u2014 legitimate M3 label roles (not scored); verify their tap targets meet 48px.`,
        {
          count: smallLabels.length,
          examples: smallLabels.slice(0, 6),
          scope: "element",
          renderContext: "dom",
          viewport
        }
      ));
    }
    if (tightLeading.length) {
      findings.push(finding(
        "warn",
        "tight-leading",
        `${tightLeading.length} wrapping body text node(s) with line-height below ${TIGHT_LEADING_MIN} (measured on text that WRAPS onto ${COPY_MIN_LINES}+ line boxes, or onto ${WRAP_MIN_LINES} where the text reads as copy; rows forced by <br> do not count, and display type at ${DISPLAY_MIN_PX}px+ is judged against ${DISPLAY_LEADING_MIN}).`,
        {
          count: tightLeading.length,
          examples: tightLeading.slice(0, 8),
          scope: "element",
          renderContext: "dom",
          required: `\u2265${TIGHT_LEADING_MIN}`,
          viewport
        }
      ));
    }
    if (headingCount >= 2 && headingSizes.size <= 1) {
      findings.push(finding(
        "warn",
        "weak-type-hierarchy",
        "Weak type hierarchy \u2014 multiple headings share a single size.",
        {
          headingSizes: [...headingSizes],
          scope: "page",
          contributors: headings.slice(0, 6).map((h) => ({
            selector: h.sig,
            value: `${h.tag} \xB7 ${h.px}px`
          }))
        }
      ));
    }
    if (skippedRenderContext || displayLeadingRelaxed || formattedBlocksSkipped) {
      const parts = [];
      if (skippedRenderContext) {
        parts.push(`Typography skipped for ${skippedRenderContext} node(s) inside <svg>/<canvas> artwork \u2014 sign lettering, chart labels and diagram callouts are not reading copy.`);
      }
      if (formattedBlocksSkipped) {
        parts.push(`Leading not scored on ${formattedBlocksSkipped} node(s) that reach ${COPY_MIN_LINES}+ line boxes only via <br> \u2014 address blocks, opening hours and verse are formatted blocks, not wrapping copy.`);
      }
      if (displayLeadingRelaxed) {
        parts.push(`${displayLeadingRelaxed} display-size node(s) at ${DISPLAY_MIN_PX}px+ not scored against the ${TIGHT_LEADING_MIN} body floor \u2014 M3's own display roles are prescribed below it (36/44, 45/52, 57/64), so they are judged against ${DISPLAY_LEADING_MIN}.`);
      }
      findings.push(finding(
        "info",
        "typography-coverage",
        parts.join(" "),
        { skippedRenderContext, displayLeadingRelaxed, formattedBlocksSkipped, scope: "page" }
      ));
    }
    return { section, findings };
  }
  function normalizeRadius(v) {
    const px = parseFloat(v);
    if (isNaN(px)) return null;
    if (px >= 500) return 9999;
    return round(px, 0);
  }
  function auditShape(samples, ctx) {
    ctx = ctx || {};
    const viewport = ctx.viewport || null;
    const radii = /* @__PURE__ */ new Map();
    const offScale = /* @__PURE__ */ new Map();
    for (const { el, cs } of samples) {
      const r = cs.borderTopLeftRadius;
      if (!r || r === "0px") continue;
      const norm = normalizeRadius(r);
      if (norm == null || norm === 0) continue;
      tally(radii, norm, el);
      const onScale = SHAPE_SCALE.some((s) => Math.abs(s - norm) <= 1);
      if (!onScale) tally(offScale, norm, el);
    }
    const section = {
      distinctRadii: radii.size,
      radii: [...radii.keys()].sort((a, b) => a - b),
      scale: SHAPE_SCALE,
      offScaleValues: [...offScale.keys()].sort((a, b) => a - b)
    };
    const findings = [];
    if (radii.size > 7) {
      findings.push(finding(
        "warn",
        "radius-fragmentation",
        `${radii.size} distinct border-radius values \u2014 the M3 shape scale has 7 steps.`,
        {
          count: radii.size,
          scope: "page",
          viewport,
          contributors: contributorsFrom(radii, (px, rec) => `${px}px \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    if (offScale.size) {
      findings.push(finding(
        "warn",
        "radius-off-scale",
        `${offScale.size} border-radius value(s) off the 7-step scale (0/4/8/12/16/28/full).`,
        {
          values: [...offScale.keys()],
          scope: "page",
          viewport,
          contributors: contributorsFrom(offScale, (px, rec) => `${px}px \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    return { section, findings };
  }
  function auditElevation(samples) {
    const recipes = /* @__PURE__ */ new Map();
    for (const { el, cs } of samples) {
      const sh = cs.boxShadow;
      if (!sh || sh === "none") continue;
      tally(recipes, sh.replace(/\s+/g, " ").trim(), el);
    }
    const section = {
      distinctShadows: recipes.size,
      levels: ELEVATION_LEVELS,
      recipes: [...recipes.keys()].slice(0, 20)
    };
    const findings = [];
    if (recipes.size > ELEVATION_LEVELS) {
      findings.push(finding(
        "warn",
        "elevation-fragmentation",
        `${recipes.size} distinct box-shadow recipes \u2014 the M3 elevation scale has ${ELEVATION_LEVELS} levels (0-5).`,
        {
          count: recipes.size,
          scope: "page",
          contributors: contributorsFrom(recipes, (sh, rec) => `${String(sh).slice(0, 48)} \xB7 ${rec.count} node(s)`)
        }
      ));
    }
    return { section, findings };
  }
  var INTERACTIVE_SEL = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function collectStateSelectors(sheetInfo) {
    const info = { hasHover: false, hasFocusVisible: false, hoverSelectors: [], focusSelectors: [] };
    for (const rules of sheetInfo.readable) {
      walkRules(rules, (rule) => {
        if (rule.selectorText) {
          const s = rule.selectorText;
          if (/:hover/.test(s)) {
            info.hasHover = true;
            info.hoverSelectors.push(s);
          }
          if (/:focus-visible/.test(s)) {
            info.hasFocusVisible = true;
            info.focusSelectors.push(s);
          } else if (/:focus/.test(s)) {
            info.focusSelectors.push(s);
          }
        }
      }, sheetInfo);
    }
    return info;
  }
  function auditStates(samples, sheetInfo) {
    const stateInfo = collectStateSelectors(sheetInfo);
    const stylesUnknown = sheetInfo.anySkipped;
    let interactiveCount = 0;
    let noVisibleFocus = 0;
    const noFocusExamples = [];
    for (const { el, cs } of samples) {
      if (!safeMatches(el, INTERACTIVE_SEL)) continue;
      interactiveCount++;
      const outlineNone = cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) === 0;
      let hasRingClass = false, hasStateLayer = false;
      try {
        hasRingClass = el.classList.contains("md-focus-ring") || !!(el.querySelector && el.querySelector(".md-focus-ring"));
        hasStateLayer = el.classList.contains("md-state-layer") || !!(el.querySelector && el.querySelector(".md-state-layer"));
      } catch (e) {
      }
      if (outlineNone && !hasRingClass && !hasStateLayer && !stateInfo.hasFocusVisible && !stylesUnknown) {
        noVisibleFocus++;
        if (noFocusExamples.length < 8) {
          noFocusExamples.push({ el, sig: classSig(el), tag: el.tagName.toLowerCase(), sample: (el.textContent || el.value || "").trim().slice(0, 30) });
        }
      }
    }
    const section = {
      interactiveCount,
      hasHoverRules: stateInfo.hasHover,
      hasFocusVisibleRules: stylesUnknown && !stateInfo.hasFocusVisible ? "unknown" : stateInfo.hasFocusVisible,
      stylesheetsReachable: !sheetInfo.anySkipped,
      sheetsSkipped: sheetInfo.skipped,
      noVisibleFocusCount: noVisibleFocus,
      noVisibleFocusExamples: noFocusExamples
    };
    const findings = [];
    if (stylesUnknown) {
      findings.push(finding(
        "info",
        "stylesheets-unreadable",
        `${sheetInfo.skipped || "Some"} stylesheet(s) unreadable (cross-origin) \u2014 hover/focus coverage is unknown, not scored.`,
        { sheetsSkipped: sheetInfo.skipped, scope: "page" }
      ));
    } else {
      if (interactiveCount > 0 && !stateInfo.hasHover) {
        findings.push(finding(
          "warn",
          "no-hover-styles",
          "No :hover styles found in readable stylesheets \u2014 interactive elements likely lack hover feedback.",
          {
            scope: "page",
            contributors: [{ selector: ":hover", value: `no rule in ${sheetInfo.readable.length} readable stylesheet(s)` }]
          }
        ));
      }
      if (interactiveCount > 0 && !stateInfo.hasFocusVisible) {
        findings.push(finding(
          "error",
          "no-focus-visible",
          "No :focus-visible styles found \u2014 keyboard focus is likely invisible. Add .md-focus-ring or a :focus-visible outline.",
          {
            scope: "page",
            wcagCriterion: "2.4.7",
            contributors: [{ selector: ":focus-visible", value: `no rule in ${sheetInfo.readable.length} readable stylesheet(s)` }]
          }
        ));
      }
    }
    if (noVisibleFocus) {
      findings.push(finding(
        "error",
        "no-visible-focus",
        `${noVisibleFocus} interactive element(s) appear to have no visible focus indicator (outline removed, no focus ring).`,
        { count: noVisibleFocus, examples: noFocusExamples, scope: "element", wcagCriterion: "2.4.7" }
      ));
    }
    return { section, findings };
  }
  function parseDurationMs(v) {
    if (!v) return 0;
    v = v.trim();
    if (v.endsWith("ms")) return parseFloat(v);
    if (v.endsWith("s")) return parseFloat(v) * 1e3;
    return parseFloat(v) || 0;
  }
  var LINEAR_RE = /linear|cubic-bezier\(\s*0\s*,\s*0\s*,\s*1\s*,\s*1\s*\)/i;
  function mentionsMovement(propList) {
    return propList.some((p) => MOVEMENT_PROPS.includes(p));
  }
  function mentionsLayout(propList) {
    return propList.some((p) => LAYOUT_ANIMATED_PROPS.includes(p));
  }
  function auditMotion(sheetInfo) {
    const findings = [];
    const section = {
      hasReducedMotionQuery: false,
      reducedMotionStatus: "missing",
      // 'present' | 'missing' | 'unknown'
      activeAnimations: 0,
      tooShort: [],
      tooLong: [],
      linearMovement: [],
      easeInEntrance: [],
      layoutAnimated: [],
      infiniteLoops: [],
      sheetsSkipped: sheetInfo.skipped
    };
    let anims = [];
    try {
      if (typeof document.getAnimations === "function") anims = document.getAnimations();
    } catch (e) {
    }
    section.activeAnimations = anims.length;
    for (const a of anims) {
      try {
        const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        if (!timing) continue;
        const dur = typeof timing.duration === "number" ? timing.duration : 0;
        const iter = timing.iterations;
        const target = a.effect.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : "?";
        const targetHint = ((typeof target?.className === "string" ? target.className : "") + " " + (a.animationName || "")).trim();
        const isAmbient = AMBIENT_RE.test(targetHint) || target && target.getAttribute && target.getAttribute("role") === "progressbar" || target && target.classList && (target.classList.contains("md-linear-progress") || target.classList.contains("md-circular-progress"));
        if (iter === Infinity && !isAmbient) {
          section.infiniteLoops.push({ tag, sig: tag, name: a.animationName || a.constructor && a.constructor.name });
        }
        if (dur > 0 && dur < DURATION_MIN_MS) section.tooShort.push({ tag, sig: tag, ms: round(dur, 0) });
        if (dur > DURATION_MAX_MS && !(iter > 1)) section.tooLong.push({ tag, sig: tag, ms: round(dur, 0) });
      } catch (e) {
      }
    }
    for (const rules of sheetInfo.readable) {
      walkRules(rules, (rule) => {
        if (rule.media && /prefers-reduced-motion/i.test(rule.media.mediaText || rule.conditionText || "")) {
          section.hasReducedMotionQuery = true;
        }
        if (rule.conditionText && /prefers-reduced-motion/i.test(rule.conditionText)) {
          section.hasReducedMotionQuery = true;
        }
        if (!rule.style) return;
        const st = rule.style;
        const sel = rule.selectorText || "";
        const tProp = st.transitionProperty || st.getPropertyValue("transition-property");
        const tDur = st.transitionDuration || st.getPropertyValue("transition-duration");
        const tEase = st.transitionTimingFunction || st.getPropertyValue("transition-timing-function");
        const shorthand = st.transition || st.getPropertyValue("transition");
        if (tProp || shorthand) {
          const props = (tProp || shorthand || "").split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
          const durs = (tDur || "").split(",").map(parseDurationMs);
          const eases = (tEase || shorthand || "").toLowerCase();
          analyzeMotionDecl(section, sel, props, durs, eases, "transition");
        }
        const aDur = st.animationDuration || st.getPropertyValue("animation-duration");
        const aEase = st.animationTimingFunction || st.getPropertyValue("animation-timing-function");
        const aIter = st.animationIterationCount || st.getPropertyValue("animation-iteration-count");
        if (aDur) {
          const isInfinite = !!(aIter && /infinite/i.test(aIter));
          const iterN = aIter && !isInfinite ? parseFloat(aIter) : isInfinite ? Infinity : 1;
          const isAmbient = AMBIENT_RE.test(sel);
          const durs = aDur.split(",").map(parseDurationMs);
          for (const d of durs) {
            if (d > 0 && d < DURATION_MIN_MS) section.tooShort.push({ selector: sel, sig: selSig(sel), ms: round(d, 0) });
            if (d > DURATION_MAX_MS && !(iterN > 1)) section.tooLong.push({ selector: sel, sig: selSig(sel), ms: round(d, 0) });
          }
          if (aEase && LINEAR_RE.test(aEase) && !isAmbient) {
            section.linearMovement.push({ selector: sel, sig: selSig(sel), easing: aEase, kind: "animation" });
          }
          if (isInfinite && !isAmbient) {
            section.infiniteLoops.push({ selector: sel, sig: selSig(sel) });
          }
        }
      }, sheetInfo);
    }
    section.sheetsSkipped = sheetInfo.skipped;
    section.reducedMotionStatus = section.hasReducedMotionQuery ? "present" : sheetInfo.anySkipped ? "unknown" : "missing";
    const dedup = (arr) => arr.slice(0, 20);
    section.tooShort = dedup(section.tooShort);
    section.tooLong = dedup(section.tooLong);
    section.linearMovement = dedup(section.linearMovement);
    section.easeInEntrance = dedup(section.easeInEntrance);
    section.layoutAnimated = dedup(section.layoutAnimated);
    section.infiniteLoops = dedup(section.infiniteLoops);
    if (section.reducedMotionStatus === "missing") {
      findings.push(finding(
        "error",
        "reduced-motion-missing",
        "No @media (prefers-reduced-motion: reduce) rule found \u2014 motion is not gated for reduced-motion users.",
        {
          scope: "page",
          wcagCriterion: "2.3.3",
          contributors: [{ selector: "@media (prefers-reduced-motion: reduce)", value: "no rule found" }]
        }
      ));
    } else if (section.reducedMotionStatus === "unknown") {
      findings.push(finding(
        "info",
        "reduced-motion-unknown",
        `prefers-reduced-motion support unknown \u2014 ${sheetInfo.skipped || "some"} stylesheet(s) unreadable (cross-origin), so its absence cannot be confirmed. Not scored.`,
        { sheetsSkipped: sheetInfo.skipped, scope: "page" }
      ));
    }
    if (section.tooShort.length) {
      findings.push(finding(
        "warn",
        "duration-too-short",
        `${section.tooShort.length} animation/transition(s) under ${DURATION_MIN_MS}ms (non-instant but too fast to read).`,
        { examples: section.tooShort, scope: "element", required: `${DURATION_MIN_MS}\u2013${DURATION_MAX_MS}ms` }
      ));
    }
    if (section.tooLong.length) {
      findings.push(finding(
        "warn",
        "duration-too-long",
        `${section.tooLong.length} animation/transition(s) over ${DURATION_MAX_MS}ms (sluggish; exceeds the M3 duration scale).`,
        { examples: section.tooLong, scope: "element", required: `${DURATION_MIN_MS}\u2013${DURATION_MAX_MS}ms` }
      ));
    }
    if (section.linearMovement.length) {
      findings.push(finding(
        "warn",
        "linear-movement",
        `${section.linearMovement.length} movement animation(s) using linear easing \u2014 use an emphasized/spring curve.`,
        { examples: section.linearMovement, scope: "element" }
      ));
    }
    if (section.easeInEntrance.length) {
      findings.push(finding(
        "warn",
        "ease-in-entrance",
        `${section.easeInEntrance.length} entrance(s) using ease-in \u2014 entrances should decelerate (emphasized-decelerate).`,
        { examples: section.easeInEntrance, scope: "element" }
      ));
    }
    if (section.layoutAnimated.length) {
      findings.push(finding(
        "error",
        "layout-animated",
        `${section.layoutAnimated.length} transition(s) animate layout props (width/height/top/left/margin) \u2014 animate transform/opacity instead (jank).`,
        { examples: section.layoutAnimated, scope: "element" }
      ));
    }
    if (section.infiniteLoops.length) {
      findings.push(finding(
        "warn",
        "infinite-loop",
        `${section.infiniteLoops.length} infinite decorative loop(s) \u2014 reserve infinite motion for progress indicators.`,
        { examples: section.infiniteLoops, scope: "element" }
      ));
    }
    return { section, findings };
  }
  function analyzeMotionDecl(section, sel, props, durs, eases, kind) {
    const isAll = props.includes("all") || props.length === 0;
    const propSet = isAll ? MOVEMENT_PROPS.concat(LAYOUT_ANIMATED_PROPS) : props;
    const sig = selSig(sel);
    if (mentionsLayout(propSet) && !isAll) {
      const bad = propSet.filter((p) => LAYOUT_ANIMATED_PROPS.includes(p));
      if (bad.length) section.layoutAnimated.push({ selector: sel, sig, props: bad, kind });
    } else if (isAll) {
      section.layoutAnimated.push({ selector: sel, sig, props: ["all (may hit layout props)"], kind });
    }
    for (const d of durs) {
      if (d > 0 && d < DURATION_MIN_MS) section.tooShort.push({ selector: sel, sig, ms: round(d, 0), kind });
      if (d > DURATION_MAX_MS) section.tooLong.push({ selector: sel, sig, ms: round(d, 0), kind });
    }
    if (mentionsMovement(propSet) || isAll) {
      if (LINEAR_RE.test(eases)) section.linearMovement.push({ selector: sel, sig, easing: eases.trim().slice(0, 40), kind });
    }
    if (/(enter|open|show|reveal|fade-?in|--in\b|\.in\b)/i.test(sel) && /ease-in(?!-out)/i.test(eases)) {
      section.easeInEntrance.push({ selector: sel, sig, easing: "ease-in", kind });
    }
  }
  var TAP_TARGET_SEL = 'a[href], button, [role="button"], input:not([type="hidden"]), select, [role="link"], [role="checkbox"], [role="switch"], [role="tab"]';
  function circleIntersectsRect(cx, cy, r, rect) {
    const nx = clamp(cx, rect.left, rect.right);
    const ny = clamp(cy, rect.top, rect.bottom);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function isInlineInSentence(el, cs) {
    try {
      if (!cs || cs.display !== "inline") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const own = (el.textContent || "").trim().length;
      const all = (parent.textContent || "").trim().length;
      return all - own >= 20;
    } catch (e) {
      return false;
    }
  }
  function targetException(t, targets, spacingCheckable) {
    if (isInlineInSentence(t.el, t.cs)) return "inline";
    if (!spacingCheckable) return null;
    const radius = TARGET_MIN_AA / 2;
    const cx = t.r.left + t.r.width / 2;
    const cy = t.r.top + t.r.height / 2;
    for (const o of targets) {
      if (o === t) continue;
      try {
        if (t.el.contains(o.el) || o.el.contains(t.el)) continue;
      } catch (e) {
      }
      const oUndersized = o.r.width < TARGET_MIN_AA || o.r.height < TARGET_MIN_AA;
      if (oUndersized) {
        const ox = o.r.left + o.r.width / 2;
        const oy = o.r.top + o.r.height / 2;
        const dx = cx - ox, dy = cy - oy;
        if (dx * dx + dy * dy < TARGET_MIN_AA * TARGET_MIN_AA) return null;
      } else if (circleIntersectsRect(cx, cy, radius, o.r)) {
        return null;
      }
    }
    return "spacing";
  }
  function auditA11yLayout(samples, root, ctx) {
    ctx = ctx || {};
    const viewport = ctx.viewport || null;
    const targetNoun = viewport && viewport.isMobile ? "tap target" : "pointer target";
    const atViewport = viewport && viewport.width ? ` at ${viewport.width}px wide` : "";
    const findings = [];
    const missingAlt = [];
    const headingJumps = [];
    const missingLandmarks = [];
    const targets = [];
    for (const { el, cs } of samples) {
      if (!safeMatches(el, TAP_TARGET_SEL)) continue;
      const r = safeRect(el);
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      targets.push({ el, cs, r });
    }
    const spacingSkipReason = ctx.sampleCapped ? "sample capped" : targets.length > SPACING_EXCEPTION_MAX_TARGETS ? "too many targets" : null;
    const spacingCheckable = !spacingSkipReason;
    const undersized = [];
    const belowComfort = [];
    for (const t of targets) {
      const w = t.r.width, h = t.r.height;
      if (w >= TARGET_COMFORT && h >= TARGET_COMFORT) continue;
      const entry = {
        el: t.el,
        sig: classSig(t.el),
        tag: t.el.tagName.toLowerCase(),
        w: round(w, 0),
        h: round(h, 0),
        sample: (t.el.textContent || t.el.value || safeAttr(t.el, "aria-label") || "").trim().slice(0, 30)
      };
      if (viewport) entry.viewport = viewport;
      if (!(w < TARGET_MIN_AA || h < TARGET_MIN_AA)) {
        belowComfort.push(entry);
        continue;
      }
      const exception = targetException(t, targets, spacingCheckable);
      if (exception) {
        entry.exception = exception;
        belowComfort.push(entry);
        continue;
      }
      entry.bothAxes = w < TARGET_MIN_AA && h < TARGET_MIN_AA;
      undersized.push(entry);
    }
    undersized.sort((a, b) => a.w * a.h - b.w * b.h);
    belowComfort.sort((a, b) => a.w * a.h - b.w * b.h);
    const smallTargets = undersized.concat(belowComfort);
    const headings = [];
    for (const { el } of samples) {
      const tag = el.tagName ? String(el.tagName).toLowerCase() : "";
      if (tag === "img" && !el.hasAttribute("alt")) {
        missingAlt.push({ el, sig: classSig(el), src: (safeAttr(el, "src") || "").slice(0, 80) });
      }
      if (safeAttr(el, "role") === "img" && !safeAttr(el, "aria-label") && !safeAttr(el, "aria-labelledby")) {
        missingAlt.push({ el, sig: classSig(el), src: "[role=img] without aria-label" });
      }
      if (/^h[1-6]$/.test(tag)) headings.push(el);
    }
    let prevLevel = 0;
    for (const h of headings) {
      const level = parseInt(h.tagName[1], 10);
      if (prevLevel && level > prevLevel + 1) {
        headingJumps.push({ el: h, sig: classSig(h), from: prevLevel, to: level, sample: (h.textContent || "").trim().slice(0, 40) });
      }
      prevLevel = level;
    }
    const h1Count = headings.filter((h) => h.tagName === "H1").length;
    const landmarkSelectors = {
      main: 'main, [role="main"]',
      nav: 'nav, [role="navigation"]',
      banner: 'header, [role="banner"]',
      contentinfo: 'footer, [role="contentinfo"]'
    };
    const isFullDoc = root === document || root === document.body || root === document.documentElement;
    if (isFullDoc) {
      for (const [name, sel] of Object.entries(landmarkSelectors)) {
        try {
          if (!document.querySelector(sel)) missingLandmarks.push(name);
        } catch (e) {
        }
      }
    }
    const section = {
      smallTargetCount: smallTargets.length,
      smallTargets: smallTargets.slice(0, 150),
      undersizedCount: undersized.length,
      belowComfortCount: belowComfort.length,
      spacingExceptionChecked: spacingCheckable,
      // Why it was skipped, so "checked: false" is never read as "clean run".
      spacingExceptionSkipReason: spacingSkipReason,
      targetCount: targets.length,
      missingAltCount: missingAlt.length,
      missingAlt: missingAlt.slice(0, 60),
      headingJumpCount: headingJumps.length,
      headingJumps: headingJumps.slice(0, 20),
      h1Count,
      missingLandmarks
    };
    if (undersized.length) {
      const bothAxes = undersized.filter((e) => e.bothAxes).length;
      findings.push(finding(
        bothAxes ? "error" : "warn",
        "tap-target",
        `${undersized.length} ${targetNoun}(s) below the WCAG 2.5.8 minimum of ${TARGET_MIN_AA}\xD7${TARGET_MIN_AA}px${atViewport}${bothAxes ? ` (${bothAxes} undersized in both axes)` : ""}.`,
        {
          count: undersized.length,
          examples: undersized.slice(0, 8),
          scope: "element",
          wcagCriterion: "2.5.8",
          required: `\u2265${TARGET_MIN_AA}\xD7${TARGET_MIN_AA}px`,
          viewport
        }
      ));
    }
    if (belowComfort.length) {
      const kinds = new Set(belowComfort.map((e) => e.exception).filter(Boolean));
      const allExempt = belowComfort.every((e) => e.exception);
      const exceptionApplied = allExempt ? kinds.size === 1 ? `${[...kinds][0]}-exception` : "wcag-2.5.8-exception" : void 0;
      findings.push(finding(
        "warn",
        "tap-target-comfort",
        `${belowComfort.length} ${targetNoun}(s) smaller than M3's comfortable ${TARGET_COMFORT}\xD7${TARGET_COMFORT}px${atViewport} \u2014 they clear the WCAG 2.5.8 ${TARGET_MIN_AA}px minimum${kinds.size ? ` (${belowComfort.filter((e) => e.exception).length} via the ${[...kinds].join("/")} exception)` : ""}.`,
        Object.assign({
          count: belowComfort.length,
          examples: belowComfort.slice(0, 8),
          scope: "element",
          required: `\u2265${TARGET_COMFORT}\xD7${TARGET_COMFORT}px`,
          viewport,
          /* This finding's whole claim is about 2.5.8 — "below M3's 48px but
             clears the AA 24px minimum" — and where exceptionApplied is set, an
             exception is an exception TO a criterion. Omitting it left a consumer
             filtering on wcagCriterion === '2.5.8' unable to see any target we
             excused, which is exactly the set a reviewer most wants to audit. */
          wcagCriterion: "2.5.8"
        }, exceptionApplied ? { exceptionApplied } : {})
      ));
    }
    if (missingAlt.length) {
      findings.push(finding(
        "error",
        "missing-alt",
        `${missingAlt.length} image(s) missing alt text / accessible name.`,
        { count: missingAlt.length, examples: missingAlt.slice(0, 8), scope: "element", wcagCriterion: "1.1.1" }
      ));
    }
    if (headingJumps.length) {
      findings.push(finding(
        "warn",
        "heading-order",
        `${headingJumps.length} heading-order jump(s) (e.g. h2 -> h4).`,
        { count: headingJumps.length, examples: headingJumps, scope: "element" }
      ));
    }
    if (isFullDoc && h1Count === 0) {
      findings.push(finding(
        "warn",
        "no-h1",
        "No <h1> found \u2014 every page should have exactly one top-level heading.",
        { scope: "page", contributors: [{ selector: "h1", value: "no matching element" }] }
      ));
    }
    if (isFullDoc && h1Count > 1) {
      findings.push(finding(
        "warn",
        "multiple-h1",
        `${h1Count} <h1> elements \u2014 prefer a single top-level heading.`,
        {
          scope: "page",
          contributors: headings.filter((h) => h.tagName === "H1").slice(0, 6).map((h) => ({
            selector: classSig(h),
            value: `"${(h.textContent || "").trim().slice(0, 40)}"`
          }))
        }
      ));
    }
    if (missingLandmarks.length) {
      findings.push(finding(
        "warn",
        "missing-landmarks",
        `Missing landmark(s): ${missingLandmarks.join(", ")}.`,
        {
          landmarks: missingLandmarks,
          scope: "page",
          contributors: missingLandmarks.map((name) => ({
            selector: landmarkSelectors[name] || name,
            value: "no matching element"
          }))
        }
      ));
    }
    return { section, findings };
  }
  function scoreBucket(max, findings, weights) {
    const w = Object.assign({ error: 0.34, warn: 0.12, info: 0 }, weights || {});
    let penalty = 0;
    for (const f of findings) {
      penalty += (w[f.severity] == null ? 0.05 : w[f.severity]) * max;
    }
    return round(clamp(max - penalty, 0, max), 1);
  }
  function letterGrade(pct) {
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    return "F";
  }
  var NOT_AUTO_DETECTABLE = [
    "Spatial coherence \u2014 whether elements enter/exit from where they logically belong (a menu growing from its anchor, a sheet rising from the edge it docks to). The audit sees durations and easings, not spatial origin.",
    "Clean fades \u2014 whether opacity transitions are free of mid-fade color shifts, banding, or double-compositing. Only a human eye (or pixel diff) can judge fade quality.",
    "Jump cuts \u2014 abrupt state changes with no transition where one is expected (content swaps, route changes). Absence of animation is not itself in the DOM.",
    "Unified direction \u2014 whether a group of elements animates along a consistent axis/choreography rather than each doing its own thing.",
    "Perceived hierarchy / emphasis \u2014 whether motion draws the eye to the right thing at the right time.",
    "Content-appropriate personality \u2014 expressive vs. standard scheme being the right call for the brand and context.",
    "Interruptibility & continuity \u2014 whether in-flight animations respond gracefully to new input rather than snapping.",
    "Real contrast under imagery/gradients \u2014 text over photos or gradient backgrounds (the audit samples solid computed backgrounds only).",
    "Closed shadow roots \u2014 their internals are structurally unreachable from script and are not scanned."
  ];
  function detectViewport(override) {
    const win = typeof window !== "undefined" ? window : null;
    const vp = {
      width: win ? win.innerWidth : 0,
      height: win ? win.innerHeight : 0,
      dpr: win && win.devicePixelRatio ? round(win.devicePixelRatio, 2) : 1,
      isMobile: false
    };
    try {
      const mq = (q) => !!(win && win.matchMedia && win.matchMedia(q).matches);
      vp.isMobile = mq("(pointer: coarse)") || mq("(any-pointer: coarse)") && vp.width > 0 && vp.width <= 820;
    } catch (e) {
    }
    if (override && typeof override === "object") Object.assign(vp, override);
    vp.w = vp.width;
    vp.h = vp.height;
    return vp;
  }
  function topNodeGroups(all, limit) {
    const groups = /* @__PURE__ */ new Map();
    try {
      const n = Math.min(all ? all.length : 0, 2e4);
      for (let i = 0; i < n; i++) tally(groups, classSig(all[i]), all[i]);
    } catch (e) {
    }
    return contributorsFrom(groups, (sig, rec) => `${rec.count} node(s)`, limit || 5);
  }
  var PERF_RULE_IDS = ["layout-animated", "duration-too-long", "infinite-loop"];
  function markReused(f, owner) {
    return Object.assign({}, f, { reusedFrom: owner });
  }
  function run(opts) {
    opts = opts || {};
    const json = !!opts.json;
    const siteType = typeof opts.siteType === "string" ? opts.siteType : null;
    if (typeof document === "undefined" || typeof getComputedStyle === "undefined") {
      const empty = makeReport();
      empty.grade = "N/A";
      empty.notAutoDetectable = NOT_AUTO_DETECTABLE;
      empty.meta = {
        url: "",
        title: "",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        userAgent: "",
        viewport: null,
        siteType,
        elementsScanned: 0,
        elementsTotal: 0,
        sampleCap: SAMPLE_CAP,
        sampleCapped: false,
        sheetsSkipped: 0,
        openShadowRoots: 0,
        notes: ["No DOM available \u2014 run() requires a browser environment."],
        durationMs: 0
      };
      M3Audit.lastReport = empty;
      return empty;
    }
    const root = opts.root || document.body || document.documentElement;
    const viewport = detectViewport(opts.viewport);
    const ctx = { viewport, siteType };
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    _colorCache.clear();
    const report = makeReport();
    const notes = [];
    const sampleInfo = collectSamples(root);
    const samples = sampleInfo.samples;
    ctx.sampleCapped = sampleInfo.sampleCapped;
    const sheetInfo = readStyleSheets();
    let elementsTotal = 0;
    let allNodes = null;
    try {
      allNodes = root.querySelectorAll("*");
      elementsTotal = allNodes.length;
    } catch (e) {
      elementsTotal = samples.length;
    }
    let contentFingerprint = "";
    try {
      const hrefs = [...document.styleSheets].map((s) => s.href || "inline").join("|");
      let h = 5381;
      for (let i = 0; i < hrefs.length; i++) h = (h << 5) + h + hrefs.charCodeAt(i) | 0;
      contentFingerprint = (h >>> 0).toString(36);
    } catch (e) {
    }
    report.meta = {
      url: typeof location !== "undefined" ? location.href : "",
      title: typeof document !== "undefined" ? document.title : "",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      contentFingerprint,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewport,
      siteType,
      elementsScanned: samples.length,
      elementsTotal,
      sampleCap: SAMPLE_CAP,
      sampleCapped: sampleInfo.sampleCapped,
      sheetsSkipped: sheetInfo.skipped,
      openShadowRoots: sampleInfo.openShadowRoots,
      notes
    };
    if (sampleInfo.sampleCapped) {
      notes.push(`DOM larger than the sampling cap \u2014 only the first ${SAMPLE_CAP} visible elements were scanned; findings are a lower bound.`);
    }
    if (sheetInfo.listUnreadable) {
      notes.push("document.styleSheets was unreadable \u2014 all CSSOM checks report unknown.");
    } else if (sheetInfo.skipped > 0) {
      notes.push(`${sheetInfo.skipped} stylesheet(s) unreadable (cross-origin) \u2014 CSSOM-based checks (reduced-motion, hover/focus rules, transition analysis) are partial and report unknown rather than failing.`);
    }
    if (sampleInfo.openShadowRoots > 0) {
      notes.push(`${sampleInfo.openShadowRoots} open shadow root(s) traversed. Closed shadow roots (if any) cannot be scanned.`);
    }
    const color = auditColorContrast(samples, ctx);
    const typography = auditTypography(samples, ctx);
    const shape = auditShape(samples, ctx);
    const elevation = auditElevation(samples);
    const states = auditStates(samples, sheetInfo);
    const motion = auditMotion(sheetInfo);
    const a11y = auditA11yLayout(samples, root, ctx);
    report.meta.sheetsSkipped = sheetInfo.skipped;
    report.sections = {
      color: color.section,
      typography: typography.section,
      shape: shape.section,
      elevation: elevation.section,
      states: states.section,
      motion: motion.section,
      a11yLayout: a11y.section
    };
    const a11yFindings = [].concat(
      color.findings.filter((f) => f.severity !== "warn"),
      // contrast errors + skip-notes
      states.findings,
      a11y.findings
    );
    report.buckets.accessibility.findings = a11yFindings;
    report.buckets.accessibility.score = scoreBucket(30, a11yFindings);
    const consistencyFindings = [].concat(
      color.findings.filter((f) => f.severity === "warn"),
      typography.findings,
      shape.findings,
      elevation.findings
    );
    report.buckets.consistency.findings = consistencyFindings;
    report.buckets.consistency.score = scoreBucket(20, consistencyFindings);
    report.buckets.motion.findings = motion.findings;
    report.buckets.motion.score = scoreBucket(25, motion.findings);
    const perfFindings = motion.findings.filter((f) => PERF_RULE_IDS.indexOf(f.ruleId) !== -1).map((f) => markReused(f, "motion"));
    if (elementsTotal > 3e3) {
      perfFindings.push(finding(
        "warn",
        "dom-size",
        `${elementsTotal} DOM elements \u2014 large trees increase style/layout cost.`,
        {
          count: elementsTotal,
          scope: "page",
          viewport,
          contributors: topNodeGroups(allNodes, 5)
        }
      ));
    }
    report.buckets.performance.findings = perfFindings;
    report.buckets.performance.score = scoreBucket(25, perfFindings);
    report.score = round(
      report.buckets.accessibility.score + report.buckets.consistency.score + report.buckets.motion.score + report.buckets.performance.score,
      1
    );
    report.grade = letterGrade(report.score);
    report.notAutoDetectable = NOT_AUTO_DETECTABLE;
    report.meta.durationMs = round((typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0, 1);
    try {
      if (_colorProbe && _colorProbe.parentNode) {
        _colorProbe.parentNode.removeChild(_colorProbe);
      }
    } catch (e) {
    }
    _colorProbe = null;
    M3Audit.lastReport = report;
    if (!json) {
      try {
        printReport(report);
      } catch (e) {
      }
    }
    return report;
  }
  function printReport(r) {
    if (typeof console === "undefined") return;
    const c = console;
    const pct = r.score;
    const bar = (n, max) => {
      const filled = Math.round(n / max * 12);
      return "\u2588".repeat(filled) + "\u2591".repeat(12 - filled);
    };
    c.log("%cdesignMaster \xB7 M3 Conformance Audit", "font-size:15px;font-weight:700;");
    c.log("%c" + (r.meta.title || r.meta.url), "color:#888;");
    c.log(
      `%cSCORE ${pct}/100  (${r.grade})`,
      `font-size:22px;font-weight:800;color:${pct >= 80 ? "#2e7d32" : pct >= 60 ? "#ef6c00" : "#c62828"};`
    );
    if (r.meta.notes && r.meta.notes.length) {
      for (const n of r.meta.notes) c.log("%cNOTE %c" + n, "color:#1565c0;font-weight:700;", "color:#1565c0;");
    }
    const rows = {};
    for (const [k, b] of Object.entries(r.buckets)) {
      rows[k] = { score: `${b.score}/${b.max}`, bar: bar(b.score, b.max), findings: b.findings.length };
    }
    if (c.table) c.table(rows);
    const sevOrder = { error: 0, warn: 1, info: 2 };
    const sevStyle = { error: "color:#c62828;font-weight:700;", warn: "color:#ef6c00;", info: "color:#1565c0;" };
    const sevLabel = { error: "ERROR", warn: "WARN", info: "INFO" };
    for (const [name, b] of Object.entries(r.buckets)) {
      const grp = (c.groupCollapsed || c.group || c.log).bind(c);
      grp(
        `%c${name.toUpperCase()} \u2014 ${b.score}/${b.max}  (${b.findings.length} finding${b.findings.length === 1 ? "" : "s"})`,
        "font-weight:700;"
      );
      const sorted = b.findings.slice().sort((a, z) => sevOrder[a.severity] - sevOrder[z.severity]);
      if (!sorted.length) c.log("%cNo issues detected in this bucket.", "color:#2e7d32;");
      for (const f of sorted) {
        c.log(`%c${sevLabel[f.severity]}%c ${f.message}`, sevStyle[f.severity], "");
        if (f.examples && f.examples.length && c.groupCollapsed) {
          c.groupCollapsed("examples");
          for (const ex of f.examples) {
            if (ex.el) c.log(ex, ex.el);
            else c.log(ex);
          }
          c.groupEnd();
        }
      }
      if (c.groupEnd) c.groupEnd();
    }
    const dgrp = (c.groupCollapsed || c.log).bind(c);
    dgrp("%cSECTION DATA (raw metrics)", "font-weight:700;color:#555;");
    c.log(r.sections);
    if (c.groupEnd) c.groupEnd();
    const ngrp = (c.groupCollapsed || c.log).bind(c);
    ngrp("%cNOT AUTO-DETECTABLE \u2014 review manually (see audit/MANUAL-CHECKLIST.md)", "font-weight:700;color:#6750a4;");
    r.notAutoDetectable.forEach((s, i) => c.log(`${i + 1}. ${s}`));
    c.log("%cA passing score is necessary but NOT sufficient for M3 conformance. Run the 8-principle manual checklist before signing off.", "color:#6750a4;");
    if (c.groupEnd) c.groupEnd();
    c.log(`%cScanned ${r.meta.elementsScanned}${r.meta.sampleCapped ? ` of ${r.meta.elementsTotal}` : ""} elements in ${r.meta.durationMs}ms${r.meta.sheetsSkipped ? `; ${r.meta.sheetsSkipped} stylesheet(s) unreadable (cross-origin)` : ""}. Full object returned \u2014 expand it or run M3Audit.run({json:true}).`, "color:#888;");
  }
  var M3Audit = {
    run,
    version: "1.3.0",
    lastReport: null,
    // Stable rule ids are a PUBLIC contract (see RULE_IDS) — expose the registry
    // so consumers can validate what they receive.
    RULE_IDS,
    RENDER_CONTEXTS,
    // Expose internals for advanced/programmatic use and node dry-runs.
    _internals: {
      contrastRatio,
      relLuminance,
      composite,
      parseColor,
      parseResolvedColor,
      effectiveBackground,
      collectSamples,
      readStyleSheets,
      auditColorContrast,
      auditTypography,
      auditShape,
      auditElevation,
      auditStates,
      auditMotion,
      auditA11yLayout,
      lineBoxCount,
      textLineRows,
      isCopyText,
      isVerticalWritingMode,
      forcedLineBreaks,
      wrappedLineCount,
      renderContextFor,
      circleIntersectsRect,
      isInlineInSentence,
      targetException,
      contributorsFrom,
      detectViewport
    },
    NOT_AUTO_DETECTABLE
  };
  if (typeof window !== "undefined") {
    window.M3Audit = M3Audit;
    if (window.__M3_AUDIT_AUTORUN__) {
      try {
        M3Audit.run();
      } catch (e) {
        console.error("[M3Audit] run failed:", e);
      }
    }
  }
  if (typeof window === "undefined" && typeof globalThis !== "undefined") {
    globalThis.M3Audit = M3Audit;
  }
})();
if (typeof window!=='undefined' && window.M3Audit && window.M3AuditAutorun !== false) { try { window.M3Audit.run(); } catch(e) { console.error('M3Audit failed:', e); } }
