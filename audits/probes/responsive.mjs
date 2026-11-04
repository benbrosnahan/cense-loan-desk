// Responsive probe: every audited state at five widths, with page width, horizontal overflow and page height, plus a
// full-page screenshot of each.
// Usage: node probes/responsive.mjs <url> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep } from '../lib/browser.mjs';
import { STATES, seedScript } from '../lib/fixtures.mjs';

// Phone, large phone, tablet portrait, tablet landscape and laptop. The three narrow ones emulate touch.
export const WIDTHS = [
  { w: 320, h: 640, mobile: true },
  { w: 375, h: 812, mobile: true },
  { w: 768, h: 1024, mobile: true },
  { w: 1024, h: 768, mobile: false },
  { w: 1440, h: 900, mobile: false },
];

/**
 * One row per state and width: { state, width, viewportHeight, scrollWidth, clientWidth, pageHeight, overflow, jpg },
 * or { state, width, error } when that page failed. overflow means the document is wider than the viewport. jpg is
 * the full-page screenshot as a JPEG Buffer; the caller decides where it goes. Each page gets a fresh browser context, so
 * storage never carries over from the one before.
 */
export async function runResponsiveProbe(url, { log = () => {} } = {}) {
  const rows = [];
  const browser = await launchBrowser();
  try {
    for (const [name, state] of Object.entries(STATES)) {
      for (const v of WIDTHS) {
        const context = await browser.createBrowserContext();
        try {
          const page = await context.newPage();
          await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile });
          if (state.seeded) await page.evaluateOnNewDocument(seedScript());
          await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
          await sleep(500);
          await state.enter(page);
          await sleep(500);
          const m = await page.evaluate(() => {
            const de = document.documentElement;
            return { sw: de.scrollWidth, cw: de.clientWidth, h: de.scrollHeight };
          });
          const jpg = Buffer.from(await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 }));
          const overflow = m.sw > m.cw;
          rows.push({ state: name, width: v.w, viewportHeight: v.h, scrollWidth: m.sw, clientWidth: m.cw, pageHeight: m.h, overflow, jpg });
          log(`${name}@${v.w}: scrollWidth=${m.sw} clientWidth=${m.cw} height=${m.h}${overflow ? ' OVERFLOW' : ''}`);
        } catch (e) {
          rows.push({ state: name, width: v.w, error: String(e?.message ?? e).slice(0, 300) });
          log(`${name}@${v.w}: FAILED ${String(e?.message ?? e).slice(0, 300)}`);
        } finally {
          await context.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [url, out] = process.argv.slice(2);
  if (!url || !out) {
    console.error('Usage: node probes/responsive.mjs <url> <outDir>');
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const rows = await runResponsiveProbe(url, { log: console.log });
  for (const r of rows) if (r.jpg) writeFileSync(path.join(out, `${r.state}-${r.width}.jpg`), r.jpg);
  writeFileSync(path.join(out, 'responsive.json'), JSON.stringify(rows.map(({ jpg, ...r }) => r), null, 1));
}
