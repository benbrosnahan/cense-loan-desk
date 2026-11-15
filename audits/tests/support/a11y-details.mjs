// Helpers used only by a11y-details.spec.mjs: colour compositing for text and chart marks, pixel comparison,
// what Chromium's accessibility tree says about a control, a walk through every app state, and probes for the
// toast and the payoff chart's hover box.
import { expect, openApp, goTo, LOANS } from '../helpers.mjs';
import { loanRow, loanItem, decodePng, contrast } from './a11y.mjs';

// ---------- In-page kit ----------

/**
 * Installs window.__a11yd in the page once per document: colour conversion through a canvas (so any CSS colour
 * syntax works), compositing of translucent colours and opacity, the WCAG ratio, and a way to finish every
 * running transition, including the 0.01ms ones the app's reduced-motion rule gives every element.
 */
function kitSource() {
  if (window.__a11yd) return;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = color => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const channel = v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = c => `#${c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const settle = () => {
    for (let i = 0; i < 20; i++) {
      const running = document.getAnimations();
      if (!running.length) break;
      for (const a of running) {
        try { a.finish(); } catch { /* an infinite animation cannot finish */ }
      }
    }
  };
  const chain = el => {
    const out = [];
    for (let n = el; n; n = n.parentElement) out.unshift(n);
    return out;
  };
  /** Opacity reaching each element of the chain, root first. */
  const opacities = nodes => {
    let p = 1;
    return nodes.map(n => (p *= parseFloat(getComputedStyle(n).opacity)));
  };
  /** The opaque colour painted behind `el`'s content: every background from the root down to `el`, over white. */
  const backdrop = el => {
    const nodes = chain(el);
    const ops = opacities(nodes);
    let bg = [255, 255, 255, 1];
    nodes.forEach((n, i) => {
      const c = rgba(getComputedStyle(n).backgroundColor);
      c[3] *= ops[i];
      bg = over(c, bg);
    });
    return bg;
  };
  const opacityOf = el => opacities(chain(el)).at(-1);
  const shown = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility === 'visible' && opacityOf(el) > 0.01;
  };
  /** Text that is visually hidden on purpose: clipped to a pixel, like Tailwind's sr-only. */
  const srOnly = el => {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if ((cs.position === 'absolute' || cs.position === 'fixed') && (r.width <= 1 || r.height <= 1)) return true;
      if (cs.clip !== 'auto' && cs.clip !== '' && (r.width <= 1 || r.height <= 1)) return true;
    }
    return false;
  };
  const label = el => (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.id || el.tagName)
    .replace(/\s+/g, ' ').trim().slice(0, 60);

  /** Every visible run of text under `root`, with its colour composited over what is behind it. */
  const textPairs = root => {
    settle();
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent.replace(/\s+/g, ' ').trim();
      const el = t.parentElement;
      if (!text || !el || el.closest('script, style, noscript, option, [aria-hidden="true"] svg')) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      if (![...range.getClientRects()].some(r => r.width > 1 && r.height > 1)) continue;
      if (getComputedStyle(el).visibility !== 'visible' || srOnly(el)) continue;
      const cs = getComputedStyle(el);
      const bg = backdrop(el);
      const fg = rgba(el instanceof SVGElement ? cs.fill : cs.color);
      fg[3] *= opacityOf(el);
      const solid = over(fg, bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      out.push({
        text: text.length > 40 ? `${text.slice(0, 39)}…` : text,
        fg: hex(solid),
        bg: hex(bg),
        ratio: ratio(solid, bg),
        need: large ? 3 : 4.5,
        disabled: !!el.closest('button:disabled, input:disabled, select:disabled, [aria-disabled="true"], fieldset:disabled'),
        countInBar: /^\d+$/.test(text) && !!el.closest('nav[aria-label="Sections"]'),
      });
    }
    return out;
  };

  /** The placeholder of every empty text field under `root`, composited over the field's own fill. */
  const placeholderPairs = root => {
    settle();
    return [...root.querySelectorAll('input[placeholder], textarea[placeholder]')]
      .filter(el => el.placeholder && !el.value && shown(el))
      .map(el => {
        const ps = getComputedStyle(el, '::placeholder');
        const bg = backdrop(el);
        const fg = rgba(ps.color);
        fg[3] *= parseFloat(ps.opacity || '1') * opacityOf(el);
        const solid = over(fg, bg);
        return {
          field: label(el), placeholder: el.placeholder, invalid: el.getAttribute('aria-invalid') === 'true',
          fg: hex(solid), bg: hex(bg), ratio: ratio(solid, bg),
        };
      });
  };

  /**
   * The chart's marks against the colour behind the chart: every line drawn with a stroke of 2px or more and no
   * fill (the balance lines, not the 1px gridlines, which the table and labels make decorative), and every label.
   */
  const chartInk = svg => {
    settle();
    const bg = backdrop(svg);
    const lines = [];
    const labels = [];
    for (const el of svg.querySelectorAll('path, polyline, line')) {
      const cs = getComputedStyle(el);
      if (cs.stroke === 'none' || parseFloat(cs.strokeWidth) < 2 || !shown(el)) continue;
      if (el.tagName !== 'line' && cs.fill !== 'none' && rgba(cs.fill)[3] > 0) continue;
      const c = rgba(cs.stroke);
      c[3] *= parseFloat(cs.strokeOpacity || '1') * opacityOf(el);
      const solid = over(c, bg);
      lines.push({ dash: cs.strokeDasharray, color: hex(solid), ratio: ratio(solid, bg) });
    }
    for (const el of svg.querySelectorAll('text')) {
      if (!el.textContent.trim() || !shown(el)) continue;
      const cs = getComputedStyle(el);
      const c = rgba(cs.fill);
      c[3] *= parseFloat(cs.fillOpacity || '1') * opacityOf(el);
      const solid = over(c, bg);
      labels.push({ text: el.textContent.trim(), color: hex(solid), ratio: ratio(solid, bg) });
    }
    return { background: hex(bg), lines, labels };
  };

  window.__a11yd = { rgba, over, ratio, hex, settle, backdrop, shown, label, textPairs, placeholderPairs, chartInk };
}

const kit = page => page.evaluate(kitSource);

/** Finishes every running animation and transition, so colours are read in their settled state. */
export async function settleStyles(page) {
  await kit(page);
  await page.evaluate(() => window.__a11yd.settle());
}

/** Text under `locator` (or the whole page) with its composited colours, WCAG ratio and the ratio it needs. */
export async function textContrast(target) {
  const page = 'page' in target ? target.page() : target;
  await kit(page);
  return 'page' in target
    ? target.evaluate(el => window.__a11yd.textPairs(el))
    : page.evaluate(() => window.__a11yd.textPairs(document.body));
}

/** The placeholders of the empty fields under `locator`, against the field's fill. */
export async function placeholderContrast(locator) {
  await kit(locator.page());
  return locator.evaluate(el => window.__a11yd.placeholderPairs(el));
}

/** The payoff chart's lines and labels against the colour behind the chart. */
export async function chartInk(svg) {
  await kit(svg.page());
  return svg.evaluate(el => window.__a11yd.chartInk(el));
}

// ---------- Pixels ----------

/**
 * A screenshot of `locator` and `pad` pixels around it, taken with the pointer parked in the corner, nothing
 * focused and every transition finished, so two shots differ only by the state under test.
 */
export async function quietShot(page, locator, { pad = 3, blur = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  if (blur) await page.evaluate(() => document.activeElement?.blur?.());
  await settleStyles(page);
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const clip = {
    x, y,
    width: Math.min(width, Math.ceil(box.x + box.width + pad)) - x,
    height: Math.min(height, Math.ceil(box.y + box.height + pad)) - y,
  };
  return decodePng(await page.screenshot({ clip, animations: 'disabled' }));
}

/** How many pixels differ between two shots, and how many of those changed by 3:1 or more. */
export function changedPixels(a, b) {
  const total = Math.max(a.width * a.height, b.width * b.height);
  if (a.width !== b.width || a.height !== b.height) return { changed: total, strong: total, total };
  let changed = 0;
  let strong = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = a.pixel(x, y);
      const q = b.pixel(x, y);
      if (p[0] === q[0] && p[1] === q[1] && p[2] === q[2]) continue;
      changed++;
      if (contrast(p, q) >= 3) strong++;
    }
  }
  return { changed, strong, total };
}

/** Of the columns from `from` to `to` (fractions of the width), how many hold a pixel at 3:1 against the most common colour. */
export function inkedColumns(png, from, to) {
  const counts = new Map();
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const key = png.pixel(x, y).join();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const background = [...counts.entries()].sort((p, q) => q[1] - p[1])[0][0].split(',').map(Number);
  let inked = 0;
  let columns = 0;
  for (let x = Math.round(png.width * from); x <= Math.round(png.width * to); x++) {
    columns++;
    for (let y = 0; y < png.height; y++) {
      if (contrast(png.pixel(x, y), background) >= 3) {
        inked++;
        break;
      }
    }
  }
  return { inked, columns, background };
}

/**
 * Moves keyboard focus onto `locator` with a real Tab press from the focusable element before it, so the
 * browser treats it as keyboard focus (:focus-visible). Returns whether `locator` ended up focused.
 */
export async function tabOnto(page, locator) {
  await locator.evaluate(el => {
    const tabbable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
    const i = tabbable.indexOf(el);
    if (i > 0) tabbable[i - 1].focus();
    else document.activeElement?.blur?.();
  });
  await page.keyboard.press('Tab');
  return locator.evaluate(el => el === document.activeElement);
}

// ---------- Accessibility tree ----------

/** What Chromium's accessibility tree exposes for one element: role, name, description, value and properties. */
export async function axOf(locator) {
  const page = locator.page();
  const mark = `ax${Math.random().toString(36).slice(2)}`;
  await locator.evaluate((el, m) => el.setAttribute('data-audit-ax', m), mark);
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-audit-ax="${mark}"]` });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const node = nodes.find(n => !n.ignored) ?? nodes[0];
    const props = Object.fromEntries((node?.properties ?? []).map(p => [p.name, p.value?.value]));
    return {
      role: node?.role?.value ?? '',
      name: (node?.name?.value ?? '').replace(/\s+/g, ' ').trim(),
      description: (node?.description?.value ?? '').replace(/\s+/g, ' ').trim(),
      value: node?.value?.value,
      props,
    };
  } finally {
    await cdp.detach().catch(() => {});
    await locator.evaluate(el => el.removeAttribute('data-audit-ax')).catch(() => {});
  }
}

/** Every node of Chromium's accessibility tree that is not ignored, with its role and name. */
export async function axNodes(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    return nodes.filter(n => !n.ignored).map(n => ({
      role: n.role?.value ?? '',
      name: (n.name?.value ?? '').replace(/\s+/g, ' ').trim(),
    }));
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** Names that occur more than once in `names`, with their counts: `"How this plan works" ×4`. */
export function repeats(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].filter(([, c]) => c > 1).map(([n, c]) => `"${n}" ×${c}`);
}

/** Headings exposed to assistive technology, in reading order, and whether each comes after the section bar. */
export const headingOutline = page => page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Sections"]');
  return [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
    .filter(h => h.getClientRects().length && !h.closest('[aria-hidden="true"], [hidden]'))
    .map(h => ({
      level: Number(h.getAttribute('aria-level')) || Number(h.tagName.slice(1)) || 2,
      text: h.textContent.replace(/\s+/g, ' ').trim(),
      afterNav: !!nav && !nav.contains(h) && !!(nav.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING),
    }));
});

/**
 * Elements whose ID-reference attribute names an ID that is not in the document, as { attribute, on, missing }:
 * `on` is the element's label or first line of text. 'for' in `attributes` checks label[for].
 */
export const danglingRefs = (page, attributes) => page.evaluate(attrs => {
  const out = [];
  const name = el => {
    const text = (el.getAttribute('aria-label') || el.innerText?.split('\n').find(l => l.trim()) || el.id || el.tagName)
      .replace(/\s+/g, ' ').trim();
    return text.length > 50 ? `${text.slice(0, 49)}…` : text;
  };
  for (const attr of attrs) {
    const selector = attr === 'for' ? 'label[for]' : `[${attr}]`;
    for (const el of document.querySelectorAll(selector)) {
      const missing = el.getAttribute(attr).split(/\s+/).filter(id => id && !document.getElementById(id));
      if (missing.length) out.push({ attribute: attr, on: name(el), missing });
    }
  }
  return out;
}, attributes);

// ---------- Every state ----------

/**
 * Presses Enter on every collapsed disclosure that is on the page now, once each. Loan rows close each other,
 * so only the last one stays open. Returns how many it pressed.
 */
export async function openEveryDisclosure(page) {
  const closed = page.locator('#main button[aria-expanded="false"]');
  const count = await closed.count();
  const handles = await closed.elementHandles();
  for (const handle of handles) {
    if (await handle.evaluate(el => el.isConnected && el.getAttribute('aria-expanded') === 'false')) await handle.press('Enter');
  }
  await Promise.all(handles.map(h => h.dispose()));
  return count;
}

/**
 * Walks every state a borrower meets and calls `visit(name)` in each: first run, the first-run form after an
 * empty save, Your loans (the eight-loan fixture), with the add form, with the edit form, Repayment plans,
 * Payoff and Records. With `openAll`, each state is visited again after opening every disclosure in it.
 */
export async function eachState(page, visit, { openAll = false } = {}) {
  const at = async state => {
    await settleStyles(page);
    await visit(state);
    if (openAll && (await openEveryDisclosure(page))) {
      await settleStyles(page);
      await visit(`${state}, every disclosure open`);
    }
  };
  await openApp(page, { seeded: false });
  await at('first run');
  await page.getByRole('button', { name: 'Add my first loan' }).click();
  await page.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(page.getByLabel('Date it was paid out')).toHaveAttribute('aria-invalid', 'true');
  await at('the first-run form after an empty save');

  await openApp(page);
  await at('Your loans');
  await page.getByRole('button', { name: 'Add a loan' }).click();
  await at('Your loans with the add form');
  await page.getByRole('button', { name: 'Cancel' }).click();
  const first = LOANS[0].nickname;
  const row = loanRow(page, first);
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await loanItem(page, first).getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit this loan' })).toBeVisible();
  await at('Your loans with the edit form');
  await page.getByRole('button', { name: 'Cancel' }).click();
  for (const [tab, state] of [['plans', 'Repayment plans'], ['payoff', 'Payoff'], ['records', 'Records']]) {
    await goTo(page, tab);
    await at(state);
  }
}

// ---------- The toast ----------

/**
 * While the Undo toast is up: whether focus is on body, inside the toast, or elsewhere, and how much of the focused
 * control's box lies under the toast's pill (the opaque box around Undo). `gone` once Undo is no longer offered.
 */
export const focusUnderToast = page => page.evaluate(() => {
  const undo = [...document.querySelectorAll('button')]
    .find(b => /^undo\b/i.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
  if (!undo) return { gone: true };
  const opaque = n => {
    const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    return m.length >= 3 && (m[3] ?? 1) > 0.5;
  };
  let pill = undo.parentElement;
  while (pill && pill !== document.body && !opaque(pill)) pill = pill.parentElement;
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { body: true };
  if (pill.contains(el)) return { inToast: true, onUndo: el === undo };
  const r = el.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left));
  const h = Math.max(0, Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top));
  return {
    name: (el.getAttribute('aria-label') || el.innerText || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40),
    covered: (w * h) / Math.max(1, r.width * r.height),
  };
});

/**
 * Finds a point where a toast showing text that matches `pattern` (in a fixed or sticky layer) sits over a control,
 * and arms a listener that records where the next click lands. Returns the point, the control under it, and
 * whether hit-testing there lands on the toast; null when the toast covers no control.
 */
export const pointOverControlUnderToast = (page, pattern) => page.evaluate(source => {
  const re = new RegExp(source, 'i');
  const layerOf = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (['fixed', 'sticky'].includes(getComputedStyle(n).position)) return n;
    }
    return null;
  };
  const message = [...document.querySelectorAll('body *')].find(e => re.test(e.textContent || '')
    && ![...e.children].some(c => re.test(c.textContent || '')) && e.getClientRects().length && layerOf(e));
  if (!message) return null;
  const layer = layerOf(message);
  const opaque = n => {
    const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    return m.length >= 3 && (m[3] ?? 1) > 0.5;
  };
  let pill = message;
  while (pill !== layer && !opaque(pill)) pill = pill.parentElement;
  const box = pill.getBoundingClientRect();
  const controls = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="radio"], [role="checkbox"], [role="slider"], [tabindex]:not([tabindex="-1"])';
  const found = new Map();
  for (let y = box.top + 3; y < box.bottom - 2; y += 4) {
    for (let x = box.left + 3; x < box.right - 2; x += 4) {
      const stack = document.elementsFromPoint(x, y);
      const control = stack.find(e => !layer.contains(e))?.closest(controls);
      if (!control || layer.contains(control)) continue;
      if (!found.has(control)) found.set(control, []);
      found.get(control).push({ x, y, onToast: !!stack[0] && layer.contains(stack[0]) });
    }
  }
  if (!found.size) return null;
  const [control, points] = [...found].sort((p, q) => q[1].length - p[1].length)[0];
  const point = points[Math.floor(points.length / 2)];
  control.setAttribute('data-audit-under-toast', '');
  window.__auditTap = null;
  document.addEventListener('click', e => {
    window.__auditTap = {
      reached: !!e.target.closest?.('[data-audit-under-toast]'),
      on: (e.target.closest?.('button, a, input, select, label') || e.target).tagName,
      toastStill: message.isConnected,
    };
  }, { capture: true, once: true });
  return {
    x: Math.round(point.x), y: Math.round(point.y), onToast: point.onToast,
    control: (control.getAttribute('aria-label') || control.innerText || control.id || control.tagName).replace(/\s+/g, ' ').trim().slice(0, 40),
    toast: message.textContent.replace(/\s+/g, ' ').trim(),
    pointerEvents: getComputedStyle(pill).pointerEvents,
  };
}, pattern.source);

// ---------- The payoff chart's hover box ----------

/** Marks every element of the chart that shows before any hover, so hoverCover can tell what a hover added. */
export async function markShown(figure) {
  await kit(figure.page());
  await figure.evaluate(root => {
    for (const el of [root, ...root.querySelectorAll('*')]) if (window.__a11yd.shown(el)) el.setAttribute('data-audit-shown', '');
  });
}

/**
 * What the hover added to the chart and what of the chart it hides. A hover box is added content with an opaque
 * fill: an HTML box with a background, or an SVG shape with a fill and at least 20x20px. It hides a label when it
 * covers part of the label's box, and a line where it covers one of 80 points sampled along the line.
 */
export const hoverCover = figure => figure.evaluate(root => {
  const { shown, rgba } = window.__a11yd;
  const added = [...root.querySelectorAll('*')].filter(el => !el.hasAttribute('data-audit-shown') && shown(el));
  const boxes = added.filter(el => {
    const r = el.getBoundingClientRect();
    if (el instanceof SVGElement) {
      const fill = getComputedStyle(el).fill;
      return /^(rect|path|circle|ellipse|polygon|foreignObject)$/.test(el.tagName) && fill !== 'none' && rgba(fill)[3] > 0.5 && r.width * r.height >= 400;
    }
    return rgba(getComputedStyle(el).backgroundColor)[3] > 0.5;
  }).map(el => el.getBoundingClientRect());
  const inside = (x, y) => boxes.some(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
  const covers = [];
  for (const text of root.querySelectorAll('svg text[data-audit-shown]')) {
    const r = text.getBoundingClientRect();
    let hidden = 0;
    for (const b of boxes) {
      const w = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
      const h = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      hidden = Math.max(hidden, (w * h) / Math.max(1, r.width * r.height));
    }
    if (hidden > 0) covers.push(`${Math.round(hidden * 100)}% of the "${text.textContent.trim()}" label`);
  }
  for (const path of root.querySelectorAll('svg path[data-audit-shown]')) {
    const cs = getComputedStyle(path);
    if (cs.stroke === 'none' || cs.fill !== 'none' || parseFloat(cs.strokeWidth) < 2) continue;
    const length = path.getTotalLength();
    const m = path.getScreenCTM();
    let under = 0;
    for (let i = 0; i <= 80; i++) {
      const p = path.getPointAtLength((length * i) / 80).matrixTransform(m);
      if (inside(p.x, p.y)) under++;
    }
    if (under) covers.push(`${under} of 81 points on the ${cs.strokeDasharray === 'none' ? 'solid' : 'dashed'} line`);
  }
  return { added: added.length, boxes: boxes.length, covers };
});
