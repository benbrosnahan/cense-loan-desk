// Helpers for security-privacy.spec.mjs only: stopping and recording off-site traffic, a local page on another
// site, reading the app's repo, and a small ZIP reader for the spreadsheet exports.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The app's repo: the parent of the kit folder, or AUDIT_REPO when the kit runs from somewhere else. */
export const repoDir = process.env.AUDIT_REPO ?? path.resolve(kitDir, '..');
export const hasRepo = () => fs.existsSync(path.join(repoDir, 'package.json')) && fs.existsSync(path.join(repoDir, 'src'));
export const repoHas = rel => fs.existsSync(path.join(repoDir, rel));
export const readRepo = rel => fs.readFileSync(path.join(repoDir, rel), 'utf8');
export const repoJson = rel => JSON.parse(readRepo(rel));
export const NO_REPO = `The app's source is not next to the kit; set AUDIT_REPO to the repo root (looked in ${repoDir})`;

/** { path: text } for the given repo-relative paths that exist. */
export const readAll = paths => Object.fromEntries(paths.filter(repoHas).map(rel => [rel, readRepo(rel)]));
export const CODE_FILE = /\.(tsx?|jsx?|mjs)$/;

/** Repo-relative paths of the files under dir whose names match, skipping node_modules and build output. */
export function repoFiles(dir, match) {
  const out = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(repoDir, rel), { withFileTypes: true })) {
      if (['node_modules', '.next', 'out', '.git'].includes(entry.name)) continue;
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (match.test(entry.name)) out.push(child);
    }
  };
  if (repoHas(dir)) walk(dir);
  return out;
}

/**
 * Name lookups for every host except the app's fail inside Chromium (~NOTFOUND), so a request this file
 * provokes can never reach another host, not even as a DNS query, and neither can a preconnect.
 */
export function resolverRule(baseURL) {
  const host = new URL(baseURL).hostname.replace(/^\[|\]$/g, '');
  return `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ${host}`;
}

/**
 * Stops every request that leaves the app's origin, in every page of the context, and records it, so a test
 * can ask "did anything leave?" while nothing does. stubs maps a host to HTML served in place of that site.
 * WebSockets cannot be routed without replacing the page's WebSocket class (which would hide a refusal by the
 * page's own policy), so they are recorded from the page's websocket event; resolverRule keeps them local.
 */
export async function watchOffsite(context, appOrigin, stubs = {}) {
  const sent = [];
  const sockets = [];
  await context.route(url => url.origin !== appOrigin && !['data:', 'blob:'].includes(url.protocol), async route => {
    const request = route.request();
    const host = new URL(request.url()).host;
    sent.push({
      method: request.method(),
      url: request.url(),
      host,
      type: request.resourceType(),
      referer: (await request.allHeaders()).referer ?? null,
      bytes: request.postDataBuffer()?.length ?? 0,
    });
    const stub = stubs[host] ?? stubs['*'];
    if (stub) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: stub });
    return route.abort('blockedbyclient');
  });
  const watch = page => page.on('websocket', ws => sockets.push(ws.url()));
  context.pages().forEach(watch);
  context.on('page', watch);
  return { sent, sockets };
}

/**
 * Serves one page from this machine on a different site from the app: 127.0.0.1 when the app is on localhost or
 * another host, localhost when the app is on 127.0.0.1. A real local server, not a routed response, because
 * Chromium refuses to let a routed (address-unknown) page frame a loopback app at all.
 */
export async function otherSite(appHost, html) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = appHost === '127.0.0.1' ? 'localhost' : '127.0.0.1';
  return {
    url: `http://${host}:${server.address().port}/`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}

/**
 * Opens a page on another site that frames the app, waits for the frame's load event (it fires whether the
 * frame shows the app or the browser's refusal page) and returns the frame and whether it holds the app.
 */
export async function frameFromOtherSite(page, appUrl) {
  const app = new URL(appUrl);
  const site = await otherSite(app.hostname, `<!doctype html><title>Another site</title>
<iframe id="framed" title="Framed app" width="900" height="700" src="${app.href}"
  onload="window.frameLoads = (window.frameLoads || 0) + 1"></iframe>`);
  // The newest route runs first, so this lets the local page through watchOffsite.
  const siteOrigin = new URL(site.url).origin;
  await page.context().route(url => url.origin === siteOrigin, route => route.continue());
  await page.goto(site.url);
  await page.waitForFunction(() => window.frameLoads >= 1);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const showsApp = !!frame && frame.url().startsWith(app.origin);
  return { site, frame, showsApp, frameUrl: frame?.url() ?? '(no frame)' };
}

/** Compares dotted versions numerically: -1, 0 or 1. Pre-release tags are ignored. */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/**
 * Next.js support policy (nextjs.org/support-policy, read 2026-11-02): 16.x is Active LTS, 15.x is Maintenance
 * LTS with security releases until 2027-01-31, and 14.x and older are Unsupported. Update this when the policy
 * page changes.
 */
export const NEXT_POLICY = { lastUnsupportedMajor: 14, securityReleasesUntil: { 15: '2027-01-31' } };

export function nextLineStatus(version, today = new Date().toISOString().slice(0, 10)) {
  const major = parseInt(String(version), 10);
  if (!Number.isFinite(major)) return { supported: false, why: `unreadable version "${version}"` };
  if (major <= NEXT_POLICY.lastUnsupportedMajor) return { supported: false, why: `${major}.x is listed as Unsupported` };
  const until = NEXT_POLICY.securityReleasesUntil[major];
  if (until && today > until) return { supported: false, why: `${major}.x security releases ended ${until}` };
  return { supported: true, why: until ? `${major}.x gets security releases until ${until}` : `${major}.x is supported` };
}

/** Code that can send data off the page, or a tracker's usual shapes. */
export const NETWORK_CODE = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b|googletagmanager|gtag\(|<script[^>]*\ssrc=|next\/script|next\/third-parties|new Image\b|document\.cookie|serviceWorker/i;
/** An address on any site other than the two the app links to. */
export const OFF_SITE_URL = /https?:\/\/(?!(?:studentaid\.gov|cense\.beehiiv\.com)\b)/;
/** Package names of analytics, telemetry and error-reporting services. */
export const ANALYTICS_PACKAGE = /analytics|telemetry|tracking|tag-?manager|gtag|react-ga|segment|mixpanel|amplitude|posthog|sentry|datadog|logrocket|hotjar|fullstory|plausible|umami|fathom|matomo|newrelic|bugsnag|rollbar|speed-insights|clarity/i;
/** A way to read a spreadsheet or any file the borrower picks. */
export const FILE_READING = /\bXLSX\.(read|readFile)\b|\bFileReader\b|type=["'{]*file\b|showOpenFilePicker|import\s*\{[^}]*\bread(File)?\b[^}]*\}\s*from\s*["']xlsx["']/;

/** "file:line "match"" for every line of { file: text } that matches one of the patterns. */
export function linesMatching(texts, ...patterns) {
  return Object.entries(texts).flatMap(([file, text]) => text.split('\n').flatMap((line, i) => {
    const hit = patterns.map(p => p.exec(line)).find(Boolean);
    return hit ? [`${file}:${i + 1} "${hit[0]}"`] : [];
  }));
}

/** Files of { file: text } with a paragraph that names xlsx or SheetJS together with its advisories. */
export function xlsxReasonIn(texts) {
  return Object.entries(texts).filter(([, text]) => text.split(/\n\s*\n/).some(paragraph =>
    /\b(xlsx|sheetjs)\b/i.test(paragraph)
    && /GHSA-4r6h-8v6p-xvw6|GHSA-5pgg-2g8v-p4x9|advisor(y|ies)|vulnerab|npm audit/i.test(paragraph))).map(([file]) => file);
}

/** The production (non-dev) copies of a package in package-lock.json, as { key, version }. */
export function productionCopies(lock, name) {
  return Object.entries(lock.packages ?? {})
    .filter(([key, entry]) => key.split('node_modules/').pop() === name && !entry.dev && !entry.link)
    .map(([key, entry]) => ({ key, version: entry.version, resolved: entry.resolved ?? '' }));
}

/** Reads a ZIP archive, such as an .xlsx file, into { entryName: Buffer }. Stored and deflated entries only. */
export function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a ZIP archive: no end-of-directory record');
  const files = {};
  let at = buf.readUInt32LE(end + 16);
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`not a ZIP archive: bad directory entry at ${at}`);
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const skip = nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    at += 46 + skip;
  }
  return files;
}

/** Text of an XML part with the five standard entities and numeric references decoded. */
export function xmlText(buffer) {
  return buffer.toString('utf8')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** The bytes of a Playwright download, read from the temporary file Playwright keeps for it. */
export async function downloadBytes(download) {
  return fs.promises.readFile(await download.path());
}
