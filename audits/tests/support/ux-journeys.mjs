// Helpers only ux-journeys.spec.mjs needs: in-page probes for what a person can see, read or not read on screen,
// a small reader for the app's .xlsx downloads, and a PDF page counter. No dependencies beyond Node.
import { inflateRawSync } from 'node:zlib';

/** Installs window.__ux in every document the page opens. Call it before the page's first navigation. */
export async function installProbes(page) {
  await page.addInitScript(probes);
}

/** Waits for the entrance animations (opacity 0 at their first frame) to end, then two frames. */
export async function quiet(page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming?.().endTime));
    await Promise.race([
      Promise.all(finite.map(a => a.finished.catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1000)),
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** Polls fn until ok(value) or the timeout, and returns the last value. Never throws on timeout. */
export async function pollUntil(fn, ok, { timeout = 2000, interval = 50 } = {}) {
  const end = Date.now() + timeout;
  let value = await fn();
  while (!ok(value) && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, interval));
    value = await fn();
  }
  return value;
}

export const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
/** Dollars as a person writes them: cents only when there are some ($145, $26.50, $0.30). */
export const dollars = n => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
}).format(n);
export const total = loans => loans.reduce((sum, l) => sum + l.balance, 0);
export const short = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const TABS = {
  loans: /^(Your loans|Loans)\b/,
  plans: /^(Repayment plans|Plans)\b/,
  payoff: /^Payoff\b/,
  records: /^Records/,
};

/** A section control as a button, a link or a tab, so a fix that turns the tabs into links still finds it. */
export function sectionControl(page, tab) {
  const nav = page.getByRole('navigation', { name: 'Sections' });
  const name = TABS[tab];
  return nav.getByRole('button', { name }).or(nav.getByRole('link', { name })).or(nav.getByRole('tab', { name })).first();
}

/** A control by its visible name, whether it is a button or a link. */
export const control = (scope, name) => scope.getByRole('button', { name }).or(scope.getByRole('link', { name })).first();

/** A pre-cutoff undergraduate list of any length, for layouts that depend on the number of loans. */
export const manyLoans = n => Array.from({ length: n }, (_, i) => {
  const year = 2018 + (i % 8);
  const sub = i % 2 === 0;
  return {
    id: `many-${i}`,
    nickname: `${year}–${String((year + 1) % 100).padStart(2, '0')} ${sub ? 'subsidized' : 'unsubsidized'} ${Math.floor(i / 16) + 1}`,
    servicer: i % 3 ? 'Nelnet' : 'MOHELA',
    kind: sub ? 'direct_sub' : 'direct_unsub',
    subsidy: sub ? 'subsidized' : 'unsubsidized',
    principal: 2000 + 250 * i,
    balance: 2100 + 260 * i,
    rate: 5.5,
    disbursementDate: `${year}-09-01`,
    minPayment: 0,
  };
});

/** Number of pages in a PDF that Chromium wrote. */
export function pdfPageCount(buffer) {
  const s = buffer.toString('latin1');
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g)].map(m => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  return (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

/** Reads an .xlsx into { sheetName: { A1: value, ... } }. Enough for the app's two downloads. */
export function readXlsx(buffer) {
  const files = unzip(buffer);
  const text = name => files[name]?.toString('utf8') ?? '';
  const strings = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => runs(m[1]));
  const rels = {};
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    rels[/Id="([^"]+)"/.exec(m[0])[1]] = /Target="([^"]+)"/.exec(m[0])[1];
  }
  const sheets = {};
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])[1]);
    let target = rels[/r:id="([^"]+)"/.exec(m[0])[1]].replace(/^\//, '');
    if (!target.startsWith('xl/')) target = `xl/${target}`;
    const cells = {};
    for (const c of text(target).matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const body = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value;
      if (type === 's') value = strings[Number(v)];
      else if (type === 'inlineStr') value = runs(body);
      else if (type === 'str' || type === 'e') value = v === undefined ? '' : decode(v);
      else if (type === 'b') value = v === '1';
      else value = v === undefined ? '' : Number(v);
      if (ref) cells[ref] = value;
    }
    sheets[name] = cells;
  }
  return sheets;
}

/** Every text cell in a workbook, as "Sheet!A1: text". */
export const textCells = workbook => Object.entries(workbook).flatMap(([sheet, cells]) =>
  Object.entries(cells).filter(([, v]) => typeof v === 'string' && v.trim()).map(([ref, v]) => ({ sheet, ref, text: v })));

const runs = xml => decode([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
});

function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('The download is not a zip file, so not an .xlsx');
  const files = {};
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0, n = buf.readUInt16LE(end + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? inflateRawSync(raw) : raw;
    p += 46 + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}

// Runs in the page. Everything it uses must be defined inside it.
function probes() {
  if (window.__ux) return;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const rgba = c => {
    const m = /rgba?\(([^)]*)\)/.exec(c || '');
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const mix = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const luminance = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // Screen-reader-only text: positioned and clipped to a pixel or less.
  const srOnly = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      if (position === 'absolute' || position === 'fixed') {
        const r = n.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) return true;
      }
    }
    return false;
  };
  const present = el => !!el && el.isConnected && el.checkVisibility({ checkVisibilityCSS: true }) && !srOnly(el);
  const shown = el => present(el) && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

  const bar = () => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    if (!nav) return null;
    for (let n = nav; n && n !== document.body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      if (position === 'sticky' || position === 'fixed') return n;
    }
    return nav;
  };

  const textNodes = (root = document.body, skip = '') => {
    const out = [];
    if (!root) return out;
    const seen = new Map();
    const ok = el => { if (!seen.has(el)) seen.set(el, shown(el)); return seen.get(el); };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = norm(n.nodeValue);
      const el = n.parentElement;
      if (!text || !el || el.closest('script, style, noscript, template, title')) continue;
      if (skip && el.closest(skip)) continue;
      if (!ok(el)) continue;
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter(r => r.width >= 1 && r.height >= 1);
      if (!rects.length) continue;
      out.push({ el, text, raw: n.nodeValue, top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) });
    }
    return out;
  };

  // Text as it reads on screen: text nodes joined within their block (p, div, td...), one line per block.
  // React splits '{n} loan{s}' into several nodes, so a node alone is not a phrase.
  const lines = (root = document.body, skip = '') => {
    const out = [];
    let block = null;
    let line = null;
    for (const t of textNodes(root, skip)) {
      let b = t.el;
      while (b !== root && b.parentElement && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
      if (b !== block) {
        block = b;
        line = { el: b, raw: '', top: t.top, bottom: t.bottom };
        out.push(line);
      }
      line.raw += t.raw;
      line.top = Math.min(line.top, t.top);
      line.bottom = Math.max(line.bottom, t.bottom);
    }
    return out.map(l => ({ el: l.el, text: norm(l.raw), top: l.top, bottom: l.bottom })).filter(l => l.text);
  };
  const prose = (root = document.body, skip = '') => lines(root, skip).map(l => l.text).join('\n');

  // On screen: inside the viewport and not under the sticky section bar (text in the bar itself counts).
  const onScreen = (t, { whole = true } = {}) => {
    const b = bar();
    const br = b?.getBoundingClientRect();
    const inside = whole ? t.top >= -1 && t.bottom <= innerHeight + 1 : t.bottom > 0 && t.top < innerHeight;
    if (!inside) return false;
    if (b && !b.contains(t.el) && br.bottom > 0 && t.top < br.bottom - 2 && t.bottom > br.top + 2) return false;
    return true;
  };
  const onScreenTexts = (skip = '') => textNodes(document.body, skip).filter(t => onScreen(t));

  // The largest element around el whose own text stays short: a sentence, row, card line or toast.
  const blockOf = (el, max, sizes) => {
    const size = n => { if (!sizes.has(n)) sizes.set(n, norm(n.innerText).length); return sizes.get(n); };
    let b = el;
    while (b.parentElement && b.parentElement !== document.body && b.parentElement.id !== 'main' && size(b.parentElement) <= max) b = b.parentElement;
    return b;
  };
  /** Text a person can read right now, grouped by block. Each block's text is only its on-screen part. */
  const onScreenBlocks = (max = 400, skip = '') => {
    const sizes = new Map();
    const groups = new Map();
    for (const t of onScreenTexts(skip)) {
      const b = blockOf(t.el, max, sizes);
      groups.set(b, [...(groups.get(b) || []), t.text]);
    }
    return [...groups.values()].map(parts => parts.join(' '));
  };

  /** True when a sighted onlooker cannot read el: blurred, transparent, masked, hidden or emptied of digits. */
  const concealed = el => {
    if (!el) return true;
    if (el instanceof HTMLInputElement && (el.type === 'password' || !/\d/.test(el.value))) return true;
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      opacity *= parseFloat(cs.opacity || '1');
      const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(cs.filter || '');
      if (blur && parseFloat(blur[1]) >= 2) return true;
    }
    if (opacity < 0.1) return true;
    const cs = getComputedStyle(el);
    const security = cs.getPropertyValue('-webkit-text-security');
    if (security && security !== 'none') return true;
    if (rgba(cs.getPropertyValue('-webkit-text-fill-color') || cs.color)[3] < 0.1) {
      // Transparent text is unreadable unless a sharp shadow redraws it.
      const sharp = (cs.textShadow || 'none').split(/,(?![^(]*\))/).some(s => {
        if (s.trim() === 'none') return false;
        const lengths = (s.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
        const color = rgba(/rgba?\([^)]*\)/.exec(s)?.[0] || cs.color);
        return color[3] >= 0.1 && (lengths[2] ?? 0) < 2;
      });
      return !sharp;
    }
    return false;
  };

  const labelOf = el => norm(el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.id);
  const blockText = el => norm((el.closest('p, li, td, th, h1, h2, h3, h4, dd, label, button, option') || el).innerText).slice(0, 160);

  /** Every borrower figure on the current section that someone beside them could read. */
  const readableFigures = (allowed = []) => {
    const main = document.getElementById('main') || document.body;
    const rules = allowed.map(s => new RegExp(s));
    const out = [];
    for (const t of textNodes(main, 'footer, nav, [role="group"][aria-label="Common amounts"]')) {
      if (!/\$\s?\d/.test(t.text) || rules.some(r => r.test(blockText(t.el)))) continue;
      if (!concealed(t.el)) out.push(`text "${blockText(t.el)}"`);
    }
    for (const input of main.querySelectorAll('input')) {
      if (!present(input) || ['range', 'hidden', 'checkbox', 'radio'].includes(input.type)) continue;
      const dollars = [...(input.parentElement?.children || [])].some(c => c !== input && norm(c.textContent) === '$');
      if (dollars && /\d/.test(input.value) && !concealed(input)) out.push(`field "${labelOf(input)}" shows ${input.value}`);
    }
    for (const select of main.querySelectorAll('select')) {
      if (!present(select)) continue;
      const options = [...select.options].map(o => norm(o.text)).filter(t => /\$\s?\d/.test(t));
      if (options.length) out.push(`list "${labelOf(select)}" offers ${options.join('; ')}`);
    }
    return out;
  };

  /** The recommendation box ('Where we would start') and the plan and payment it names. */
  const pickBox = () => {
    const eyebrow = [...document.querySelectorAll('#main *')].find(e => !e.children.length && /^where we would start$/i.test(norm(e.textContent)));
    let box = eyebrow;
    while (box && box !== document.body && !box.querySelector('h2')) box = box.parentElement;
    return box && box !== document.body ? box : null;
  };
  const pick = () => {
    const box = pickBox();
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return {
      name: norm(box.querySelector('h2').innerText),
      amount: (/\$[\d,]+(?:\.\d{2})?/.exec(box.innerText) || [])[0] || null,
      top: Math.round(r.top + scrollY),
      bottom: Math.round(r.bottom + scrollY),
    };
  };

  const liveTexts = () => [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], output')]
    .map(e => norm(e.textContent)).filter(Boolean);

  /** Where the open section's first heading sits relative to the sticky section bar. */
  const headingVsBar = () => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    const h = [...document.querySelectorAll('#main h2')].find(x => nav && !nav.contains(x)
      && (nav.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) && present(x));
    const hr = h?.getBoundingClientRect();
    const br = bar()?.getBoundingClientRect();
    return {
      heading: h ? norm(h.innerText) : null,
      headingTop: hr ? Math.round(hr.top) : null,
      barBottom: br ? Math.round(br.bottom) : 0,
      vh: innerHeight,
    };
  };

  const section = () => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    const current = nav?.querySelector('[aria-current="page"], [aria-current="true"], [aria-current="location"], [aria-selected="true"]');
    if (!current) return null;
    const label = norm(current.innerText);
    return [['loans', /^(your )?loans/i], ['plans', /^(repayment )?plans/i], ['payoff', /^payoff/i], ['records', /^records/i]]
      .find(([, re]) => re.test(label))?.[0] ?? label;
  };

  const adjustOf = cs => cs.getPropertyValue('print-color-adjust') || cs.getPropertyValue('-webkit-print-color-adjust');
  // Chromium printing with backgrounds off drops every background not marked print-color-adjust: exact, and
  // darkens text that is close to white (Blink's TextColorForWhiteBackground and Color::Dark).
  const printedText = c => {
    if ((255 - c[0]) ** 2 + (255 - c[1]) ** 2 + (255 - c[2]) ** 2 > 65025) return c;
    const v = Math.max(c[0], c[1], c[2]) / 255.99997;
    const m = Math.max(0, (v - 0.33) / v);
    return [Math.trunc(m * c[0]), Math.trunc(m * c[1]), Math.trunc(m * c[2]), c[3]];
  };
  const css = c => `rgb(${c.slice(0, 3).map(Math.round).join(', ')})`;

  /** The worst text contrast in the recommendation box as Chromium prints it with backgrounds off (the default). */
  const printedPickContrast = () => {
    const box = pickBox();
    if (!box) return null;
    // Left off the printout altogether: nothing to read badly.
    if (!present(box)) return { hidden: true, ratio: 99 };
    let worst = { hidden: true, ratio: 99 };
    for (const t of textNodes(box)) {
      const layers = [];
      for (let n = t.el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0 && adjustOf(cs) === 'exact') { layers.push(c); if (c[3] >= 1) break; }
      }
      let paper = [255, 255, 255, 1];
      for (const c of layers.reverse()) paper = mix(c, paper);
      const cs = getComputedStyle(t.el);
      const screen = rgba(cs.color);
      const printed = adjustOf(cs) === 'exact' ? screen : printedText(screen);
      const ink = mix(printed, paper);
      const r = ratio(ink, paper);
      if (worst.hidden || r < worst.ratio) {
        worst = { ratio: Math.round(r * 100) / 100, text: t.text, screen: cs.color, ink: css(ink), paper: css(paper) };
      }
    }
    return worst;
  };

  /** Everything the current media would put on paper: rendered text plus CSS-generated content. */
  const pageText = () => {
    const generated = [];
    for (const el of document.body.querySelectorAll('*')) {
      for (const p of ['::before', '::after']) {
        const content = getComputedStyle(el, p).content;
        if (content && content !== 'none' && content !== 'normal' && /^["']/.test(content) && present(el)) {
          generated.push(content.slice(1, -1));
        }
      }
    }
    return `${document.body.innerText}\n${generated.join('\n')}`;
  };

  const contrastOf = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let bg = [255, 255, 255, 1];
    for (const c of layers.reverse()) bg = mix(c, bg);
    return ratio(mix(rgba(getComputedStyle(el).color), bg), bg);
  };
  const opacityOf = el => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
    return o;
  };

  window.__ux = {
    norm, shown, present, bar, textNodes, lines, prose, onScreen, onScreenTexts, onScreenBlocks, concealed,
    readableFigures, pickBox, pick, liveTexts, headingVsBar, section, printedPickContrast, pageText, contrastOf,
    opacityOf,
  };
}
