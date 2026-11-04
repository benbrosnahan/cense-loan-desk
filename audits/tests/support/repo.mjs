// Helpers only repo.spec.mjs needs. They read the app's own files, copy the repo to a temporary folder, and run
// the app's own tools there (its money harness verify.mjs, its lint script, its TypeScript). Nothing here writes
// inside the repo: copies live under os.tmpdir() (never inside the repo, where tsconfig's **/*.ts would pick them
// up), node_modules is linked rather than installed, and child processes run with telemetry and npm's network
// access switched off.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from '../helpers.mjs';

/** The audits/ folder. Its parent is the app's repo root; AUDIT_REPO points somewhere else (a scratch layout). */
export const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRoot = path.resolve(process.env.AUDIT_REPO ?? path.resolve(kitDir, '..'));

export const repoPath = (...parts) => path.join(repoRoot, ...parts);
export const exists = rel => fs.existsSync(repoPath(rel));
export const read = rel => fs.readFileSync(repoPath(rel), 'utf8');
export const readJson = rel => JSON.parse(read(rel));
export const installed = pkg => exists(path.join('node_modules', pkg, 'package.json'));

/**
 * Skips the test, rather than failing it, when there is no app to check: no package.json and src/ at the repo
 * root, or a package the check runs is not installed there. A missing app is setup, never the issue under test.
 */
export function requireRepo(...packages) {
  const haveApp = exists('package.json') && exists('src');
  test.skip(!haveApp, `No app at ${repoRoot}: run from the app's audits/ folder, or set AUDIT_REPO to the repo root`);
  const missing = packages.filter(pkg => !installed(pkg));
  test.skip(missing.length > 0, `Not installed in ${repoRoot}/node_modules: ${missing.join(', ')} (run npm ci there)`);
}

// ------------------------------------------------------------------------------------------------ source files

const NOT_SOURCE = new Set(['node_modules', '.next', '.git', '.verify', 'out', 'build', 'coverage', '.vercel',
  'test-results', 'playwright-report']);

/**
 * Repo-relative paths of the files under `dir` with one of `exts` (null: every file), skipping build output, git
 * data and the audits kit.
 */
export function filesUnder(dir, exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']) {
  const out = [];
  const walk = rel => {
    const abs = repoPath(rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (!NOT_SOURCE.has(entry.name) && repoPath(child) !== kitDir) walk(child);
      } else if (entry.isFile() && (!exts || exts.some(ext => entry.name.endsWith(ext)))) {
        out.push(child.split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** The app's code outside src/ that can import packages: the harness and the config files at the root. */
export function rootCodeFiles() {
  return fs.readdirSync(repoRoot)
    .filter(name => /^(verify\.mjs|(next|tailwind|postcss|eslint)\.config\.(m?js|cjs|ts))$/.test(name))
    .sort();
}

/** Blanks out comments, keeping every line break so line numbers stay true. Fine for this codebase's sources. */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\"'`])\/\/[^\n]*/g, '$1');
}

export const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Every match of a global regex in the given repo files, comments ignored: [{ file, line, match, groups }]. */
export function findInFiles(files, re) {
  const hits = [];
  for (const file of files) {
    const text = stripComments(read(file));
    for (const m of text.matchAll(re)) hits.push({ file, line: lineAt(text, m.index), match: m[0], groups: m.slice(1) });
  }
  return hits;
}

/** The 1-based line of the first match of `re` in a repo file, or null. */
export function lineOf(rel, re) {
  if (!exists(rel)) return null;
  const text = read(rel);
  const m = re.exec(text);
  return m ? lineAt(text, m.index) : null;
}

// ------------------------------------------------------------------------------------------ temporary copies

const TMP_PREFIX = 'cense-audit-';

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
}

/** Removes a folder this module made. Refuses anything else, so a bug here can never reach the repo. */
export function removeTemp(dir) {
  const rel = path.relative(os.tmpdir(), dir);
  if (!dir || rel.startsWith('..') || path.isAbsolute(rel) || !path.basename(dir).startsWith(TMP_PREFIX)) {
    throw new Error(`removeTemp refuses ${dir}: not a folder made by tempDir()`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

const NOT_COPIED = new Set([...NOT_SOURCE, 'audits']);

/**
 * Copies the repo (sources, configs, verify.mjs; not build output, .git or this kit) to a temp folder and links
 * the repo's node_modules into it. `stub` lists node_modules/.bin commands to replace with a script that only
 * prints its arguments, so a build script can run without starting `next build` (which would fetch Google Fonts).
 */
export function copyRepo({ stub = [] } = {}) {
  const dir = tempDir();
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    const from = repoPath(entry.name);
    if (NOT_COPIED.has(entry.name) || from === kitDir || entry.name.endsWith('.tsbuildinfo')) continue;
    if (entry.isDirectory()) {
      fs.cpSync(from, path.join(dir, entry.name), { recursive: true, filter: f => !NOT_COPIED.has(path.basename(f)) });
    } else if (entry.isFile()) {
      fs.copyFileSync(from, path.join(dir, entry.name));
    }
  }
  const modules = repoPath('node_modules');
  if (!fs.existsSync(modules)) return dir;
  if (!stub.length) {
    fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
    return dir;
  }
  const bin = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const name of fs.readdirSync(modules)) {
    if (name !== '.bin') fs.symlinkSync(path.join(modules, name), path.join(dir, 'node_modules', name));
  }
  const realBin = path.join(modules, '.bin');
  for (const name of fs.existsSync(realBin) ? fs.readdirSync(realBin) : []) {
    if (!stub.includes(name)) fs.symlinkSync(path.join(realBin, name), path.join(bin, name));
  }
  for (const name of stub) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "[audit stub] ${name} $*"\n`, { mode: 0o755 });
  }
  return dir;
}

/** Applies one edit to a file in a temp copy. Returns false when the anchor text is not there. */
export function plant(copy, rel, find, replace) {
  if (path.relative(os.tmpdir(), copy).startsWith('..')) throw new Error(`plant refuses ${copy}: not a temp copy`);
  const file = path.join(copy, rel);
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, 'utf8');
  const after = find === null ? before + replace : before.replace(find, replace);
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

// ---------------------------------------------------------------------------------------------- processes

// No telemetry from next, no registry access from npm/npx (a missing package fails instead of downloading), no colour.
// The dead local proxy is a second lock: anything that still tries the network fails at once instead of leaving.
const DEAD_PROXY = 'http://127.0.0.1:9';
const QUIET_ENV = {
  NEXT_TELEMETRY_DISABLED: '1',
  npm_config_offline: 'true',
  npm_config_yes: 'false',
  npm_config_update_notifier: 'false',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_proxy: DEAD_PROXY,
  npm_config_https_proxy: DEAD_PROXY,
  HTTP_PROXY: DEAD_PROXY,
  HTTPS_PROXY: DEAD_PROXY,
  http_proxy: DEAD_PROXY,
  https_proxy: DEAD_PROXY,
  NO_PROXY: '',
  no_proxy: '',
  NODE_USE_ENV_PROXY: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
};

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Runs a command to completion: { code, stdout, stderr, timedOut }. Never throws. */
export function run(command, args, { cwd, env = {}, timeout = 25_000 } = {}) {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(command, args, { cwd, env: { ...process.env, ...QUIET_ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      resolve({ code: null, stdout, stderr: String(error), timedOut });
      return;
    }
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, timeout);
    child.on('error', error => { stderr += String(error); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.replace(ANSI, ''), stderr: stderr.replace(ANSI, ''), timedOut });
    });
  });
}

/** Runs a package.json script body the way npm does, with the copy's node_modules/.bin first on PATH. */
export function runScript(copy, body, options = {}) {
  const PATH = `${path.join(copy, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH}`;
  return run('sh', ['-c', body], { cwd: copy, ...options, env: { PATH, ...options.env } });
}

/** Short, readable outcome of a run: "exit 0, PASS 180 FAIL 0" or "exit 1, ERR_REQUIRE_CYCLE_MODULE". */
export function outcome(result) {
  if (result.timedOut) return 'timed out';
  const tally = result.stdout.match(/PASS\s+(\d+)\s+FAIL\s+(\d+)/);
  if (tally) return `exit ${result.code}, PASS ${tally[1]} FAIL ${tally[2]}`;
  const error = (result.stderr + result.stdout).match(/\b(ERR_[A-Z_]+|TS\d{4}|[A-Za-z]*Error: [^\n]{0,80})/);
  return `exit ${result.code}${error ? `, ${error[1]}` : ''}`;
}

/** Runs the money harness, verify.mjs, of a temp copy. `cwd` defaults to the copy's root, as the README runs it. */
export async function runHarness(copy, { cwd = copy, nodeArgs = [] } = {}) {
  const result = await run(process.execPath, [...nodeArgs, path.join(copy, 'verify.mjs')], { cwd });
  const tally = result.stdout.match(/PASS\s+(\d+)\s+FAIL\s+(\d+)/);
  return { ...result, pass: tally ? Number(tally[1]) : null, fail: tally ? Number(tally[2]) : null, summary: outcome(result) };
}

/** Copies the repo, optionally applies edits, runs the harness and removes the copy. */
export async function harnessOnCopy({ edits = [], nodeArgs = [] } = {}) {
  const copy = copyRepo();
  try {
    for (const [rel, find, replace] of edits) {
      if (!plant(copy, rel, find, replace)) return { applied: false };
    }
    return { applied: true, ...(await runHarness(copy, { nodeArgs })) };
  } finally {
    removeTemp(copy);
  }
}

let cleanRun;
/** The harness on an untouched copy, run once per worker and shared by every test that needs it. */
export function cleanHarnessRun() {
  cleanRun ??= harnessOnCopy();
  return cleanRun;
}

/**
 * Type-checks one probe file with the app's own tsconfig.json (extended, not copied), using the app's TypeScript.
 * Returns the errors tsc reports in the probe, by line.
 */
export async function typeCheckProbe(source) {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'probe.ts'), source);
    fs.writeFileSync(path.join(dir, 'tsconfig.json'),
      JSON.stringify({ extends: repoPath('tsconfig.json'), files: ['probe.ts'], include: [] }));
    const tsc = repoPath('node_modules', 'typescript', 'bin', 'tsc');
    const result = await run(process.execPath, [tsc, '-p', dir, '--noEmit', '--incremental', 'false', '--pretty', 'false'], { cwd: dir });
    const errors = [...result.stdout.matchAll(/probe\.ts\((\d+),\d+\): error (TS\d+): ([^\n]*)/g)]
      .map(m => ({ line: Number(m[1]), code: m[2], text: m[3] }));
    return { ...result, errors };
  } finally {
    removeTemp(dir);
  }
}

// ------------------------------------------------------------------------------------------------------- git

/** The repo's git directory, following a worktree's .git file. Null when the repo has no git data. */
function gitDir() {
  const dotGit = repoPath('.git');
  if (!fs.existsSync(dotGit)) return null;
  if (fs.statSync(dotGit).isDirectory()) return dotGit;
  const pointer = fs.readFileSync(dotGit, 'utf8').match(/gitdir:\s*(.+)/)?.[1]?.trim();
  if (!pointer) return null;
  const worktree = path.resolve(repoRoot, pointer);
  const common = path.join(worktree, 'commondir');
  return fs.existsSync(common) ? path.resolve(worktree, fs.readFileSync(common, 'utf8').trim()) : worktree;
}

/** Whether a local or remote-tracking branch has this name, read from the ref files (git is not run). Null: unknown. */
export function branchExists(name) {
  const dir = gitDir();
  if (!dir) return null;
  if (fs.existsSync(path.join(dir, 'refs', 'heads', name))) return true;
  const remotes = path.join(dir, 'refs', 'remotes');
  if (fs.existsSync(remotes) && fs.readdirSync(remotes).some(remote => fs.existsSync(path.join(remotes, remote, name)))) return true;
  const packed = path.join(dir, 'packed-refs');
  if (!fs.existsSync(packed)) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\srefs/(?:heads|remotes/[^/\\s]+)/${escaped}$`, 'm').test(fs.readFileSync(packed, 'utf8'));
}

// ------------------------------------------------------------------------------------------------- .gitignore

/** True when the repo's .gitignore patterns ignore `file` (a repo-relative path with forward slashes). */
export function gitIgnores(patterns, file) {
  let ignored = false;
  for (let line of patterns) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    line = line.replace(/\/+$/, '');
    const anchored = line.startsWith('/') || line.includes('/');
    line = line.replace(/^\//, '');
    const body = line.split('/').map(seg => seg === '**' ? '.*'
      : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('/');
    const re = new RegExp(`${anchored ? '^' : '(?:^|/)'}${body}${dirOnly ? '/' : '(?:/|$)'}`);
    if (re.test(file)) ignored = !negate;
  }
  return ignored;
}

// ------------------------------------------------------------------------------------------------- colours

/** Tailwind CSS 3.4's stock palette (tailwindcss/colors), shades 50 to 950. Generated from tailwindcss 3.4.19. */
const STOCK_RAMPS = {
  slate: 'f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617',
  gray: 'f9fafb f3f4f6 e5e7eb d1d5db 9ca3af 6b7280 4b5563 374151 1f2937 111827 030712',
  zinc: 'fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b',
  neutral: 'fafafa f5f5f5 e5e5e5 d4d4d4 a3a3a3 737373 525252 404040 262626 171717 0a0a0a',
  stone: 'fafaf9 f5f5f4 e7e5e4 d6d3d1 a8a29e 78716c 57534e 44403c 292524 1c1917 0c0a09',
  red: 'fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a',
  orange: 'fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407',
  amber: 'fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03',
  yellow: 'fefce8 fef9c3 fef08a fde047 facc15 eab308 ca8a04 a16207 854d0e 713f12 422006',
  lime: 'f7fee7 ecfccb d9f99d bef264 a3e635 84cc16 65a30d 4d7c0f 3f6212 365314 1a2e05',
  green: 'f0fdf4 dcfce7 bbf7d0 86efac 4ade80 22c55e 16a34a 15803d 166534 14532d 052e16',
  emerald: 'ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22',
  teal: 'f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e',
  cyan: 'ecfeff cffafe a5f3fc 67e8f9 22d3ee 06b6d4 0891b2 0e7490 155e75 164e63 083344',
  sky: 'f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49',
  blue: 'eff6ff dbeafe bfdbfe 93c5fd 60a5fa 3b82f6 2563eb 1d4ed8 1e40af 1e3a8a 172554',
  indigo: 'eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b',
  violet: 'f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065',
  purple: 'faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764',
  fuchsia: 'fdf4ff fae8ff f5d0fe f0abfc e879f9 d946ef c026d3 a21caf 86198f 701a75 4a044e',
  pink: 'fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724',
  rose: 'fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519',
};
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

/** { 'slate-700': '#334155', ... } */
export const STOCK_TAILWIND = Object.fromEntries(Object.entries(STOCK_RAMPS)
  .flatMap(([ramp, hexes]) => hexes.split(' ').map((hex, i) => [`${ramp}-${SHADES[i]}`, `#${hex}`])));
export const STOCK_RAMP_NAMES = Object.keys(STOCK_RAMPS);

export const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export const rgbToHex = rgb => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** WCAG 2.2 contrast ratio of two sRGB colours given as [r, g, b]. */
export function contrast(a, b) {
  const lum = rgb => {
    const [r, g, bl] = rgb.map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
