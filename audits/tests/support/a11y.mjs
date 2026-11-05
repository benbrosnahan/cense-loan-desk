// Helpers used only by a11y.spec.mjs.
import { inflateSync } from 'node:zlib';

/** Section buttons by name. Below 640px they read Loans and Plans; Records carries its count ("Records2"). */
export const SECTION_NAMES = {
  loans: /^(Your loans|Loans)\b/,
  plans: /^(Repayment plans|Plans)\b/,
  payoff: /^Payoff\b/,
  records: /^Records/,
};

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A loan row in the list: its button's name starts with the loan's name. */
export const loanRow = (page, nickname) => page.getByRole('button', { name: new RegExp(`^${escapeRe(nickname)}(?![\\w–-])`) });

/** The list item holding a loan row, with its Edit and Remove buttons once open. */
export const loanItem = (page, nickname) => page.getByRole('listitem').filter({ has: loanRow(page, nickname) });

/** Polls `read` until it returns something truthy, for at most `ms`. Returns the last value. Never throws. */
export async function within(ms, read, every = 50) {
  const end = Date.now() + ms;
  let value = await read();
  while (!value && Date.now() < end) {
    await new Promise(r => setTimeout(r, every));
    value = await read();
  }
  return value;
}

/** Where keyboard focus is, described for a failure message: `<button> "Save changes"` or `<body>`. */
export const focusedElement = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { body: true, text: '<body>' };
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.id || '').replace(/\s+/g, ' ').trim();
  const nav = document.querySelector('nav[aria-label="Sections"]');
  const footer = document.querySelector('footer');
  const afterNav = !!nav && !nav.contains(el) && !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const beforeFooter = !footer || !!(footer.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
  return {
    body: false,
    text: `<${el.tagName.toLowerCase()}> "${name.length > 60 ? `${name.slice(0, 59)}…` : name}"`,
    inNav: !!nav?.contains(el),
    inContent: afterNav && beforeFooter,
  };
});

/** Waits up to `ms` for focus to settle somewhere other than <body>, then says where it is. */
export const focusAfterAction = (page, ms = 500) =>
  within(ms, async () => {
    const f = await focusedElement(page);
    return f.body ? null : f;
  }).then(f => f ?? focusedElement(page));

/** Presses Tab until `target` has focus. Returns how many presses it took, or -1 after `max`. */
export async function tabTo(page, target, max = 60) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return i;
  }
  return -1;
}

/**
 * Starts recording what a screen reader would be told: text that appears in a live region that was already on the
 * page, as a role and live setting, before the text arrived. A region inserted together with its message is logged
 * separately, because desktop screen readers mostly skip those.
 */
export const listen = page => page.evaluate(() => {
  const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"]), output';
  const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  const log = { before: 0, heard: [], insertedWithText: [] };
  const scan = () => {
    for (const el of [...seen.keys()]) if (!el.isConnected || !el.matches(LIVE)) seen.delete(el);
    for (const el of document.querySelectorAll(LIVE)) {
      const t = text(el);
      if (seen.has(el)) {
        if (t && t !== seen.get(el)) log.heard.push(t);
      } else if (t) log.insertedWithText.push(t);
      seen.set(el, t);
    }
  };
  scan();
  log.before = seen.size;
  log.insertedWithText.length = 0;
  window.__auditLive = log;
  new MutationObserver(scan).observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['role', 'aria-live'],
  });
});

/** What `listen` has recorded so far. */
export const liveLog = page => page.evaluate(() => window.__auditLive ?? { before: 0, heard: [], insertedWithText: [] });

/** Waits up to `ms` for an announcement, recorded after position `from`, that passes `match`. */
export const announcement = (page, match, { from = 0, ms = 1000 } = {}) =>
  within(ms, async () => (await liveLog(page)).heard.slice(from).find(match) ?? null);

// ---------- Colour ----------

const channel = v => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio of two sRGB colours given as [r, g, b] in 0 to 255. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const hex = rgb => `#${rgb.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const ratio = n => `${(Math.floor(n * 100) / 100).toFixed(2)}:1`;

/**
 * Everything that could show where a form field is, as opaque colours: each border side, an outline, a ring drawn
 * with box-shadow, and the field's own fill against what surrounds it. Colours are read from computed style and
 * converted through a canvas, so any CSS colour syntax works, and translucent colours are composited.
 */
export const fieldEdges = locator => locator.evaluate(el => {
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
  for (const a of el.getAnimations({ subtree: false })) a.finish();
  const layers = [];
  for (let n = el.parentElement; n; n = n.parentElement) layers.push(rgba(getComputedStyle(n).backgroundColor));
  const outside = layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255, 1]);
  const cs = getComputedStyle(el);
  const inside = over(rgba(cs.backgroundColor), outside);
  const edges = [];
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const style = cs[`border${side}Style`];
    if (parseFloat(cs[`border${side}Width`]) >= 1 && style !== 'none' && style !== 'hidden') {
      edges.push({ what: `border-${side.toLowerCase()}`, color: over(rgba(cs[`border${side}Color`]), inside) });
    }
  }
  if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) {
    edges.push({ what: 'outline', color: over(rgba(cs.outlineColor), outside) });
  }
  if (cs.boxShadow && cs.boxShadow !== 'none') {
    for (const shadow of cs.boxShadow.split(/,(?![^(]*\))/)) {
      const color = shadow.match(/(?:rgba?|hsla?|color|oklch|oklab|lab|lch)\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0];
      const lengths = (shadow.replace(color ?? '', '').match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
      const inset = /\binset\b/.test(shadow);
      if (!color || blur > 0 || (spread < 1 && Math.max(Math.abs(x), Math.abs(y)) < 1)) continue;
      edges.push({ what: inset ? 'inset ring' : 'ring', color: over(rgba(color), inset ? inside : outside) });
    }
  }
  return { outside, inside, edges };
});

/** The best contrast any edge of a field reaches against the colour on either side of it, or its fill against its surroundings. */
export function bestEdge({ outside, inside, edges }) {
  let best = { ratio: contrast(inside, outside), what: 'fill', color: inside, against: outside };
  for (const e of edges) {
    for (const against of [outside, inside]) {
      const r = contrast(e.color, against);
      if (r > best.ratio) best = { ratio: r, what: e.what, color: e.color, against };
    }
  }
  return best;
}

// ---------- PNG ----------

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG such as a Playwright screenshot. */
export function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') [width, height, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[line + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, pixel: (x, y) => [...out.subarray(y * stride + x * bpp, y * stride + x * bpp + 3)] };
}
