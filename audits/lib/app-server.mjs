// The app under audit, served locally. Reuses whatever already answers on the port; otherwise builds the app when
// there is no production build, starts `next start` from the repository root, and stops it when the audit ends.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The folder that holds audits/.
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PORT = 3100;
export const LOCAL_URL = `http://localhost:${PORT}/`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** True when anything answers HTTP at url, whatever the status. */
export async function answers(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

/** A production build exists: `next dev` also makes .next, but only `next build` writes BUILD_ID. */
export const hasBuild = (root = REPO_ROOT) => existsSync(path.join(root, '.next', 'BUILD_ID'));

// Next's own CLI entry, run with this Node: no shell and no npx, so it works the same on every platform.
function nextBin(root) {
  try {
    return createRequire(path.join(root, 'package.json')).resolve('next/dist/bin/next');
  } catch {
    throw new Error(`Next.js is not installed in ${root}. Run npm ci there first.`);
  }
}

/**
 * Makes sure the app answers. With `url` it does nothing: that is the override for a deployment or another port.
 * Otherwise it reuses a server already answering on `port`, or runs `next build` (only when there is no production
 * build) and `next start -p <port>` in `root`. Returns { url, started, stop }. stop() ends the server only when this
 * call started it, and Ctrl-C or an early exit ends it too.
 */
export async function ensureServer({ url = null, root = REPO_ROOT, port = PORT, timeoutMs = 60_000, log = () => {} } = {}) {
  if (url) return { url, started: false, stop: async () => {} };
  const local = `http://localhost:${port}/`;
  if (await answers(local)) {
    log(`Using the server already answering on port ${port}.`);
    return { url: local, started: false, stop: async () => {} };
  }

  const bin = nextBin(root);
  if (!hasBuild(root)) {
    log(`No production build in ${path.join(root, '.next')}, so running next build first.`);
    // Build output goes to stderr, so stdout keeps only the scoreboard.
    const build = spawnSync(process.execPath, [bin, 'build'], { cwd: root, stdio: ['ignore', 2, 2] });
    if (build.status !== 0) throw new Error(`next build failed (${build.error?.message ?? `exit ${build.status ?? build.signal}`})`);
  }

  log(`Starting next start -p ${port} in ${root}.`);
  const group = process.platform !== 'win32';
  const child = spawn(process.execPath, [bin, 'start', '-p', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so stopping it also stops anything it started.
    detached: group,
  });
  let output = '';
  const keep = chunk => { output = (output + chunk).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.once('error', err => keep(`\n${err.message}`));

  const running = () => child.exitCode === null && child.signalCode === null;
  const kill = signal => {
    if (!running()) return;
    try {
      if (group) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      /* already gone */
    }
  };
  const onExit = () => kill('SIGTERM');
  const onSignal = signal => {
    kill('SIGTERM');
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('exit', onExit);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  let stopping = null;
  const stop = () => (stopping ??= (async () => {
    process.off('exit', onExit);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    const wasRunning = running();
    kill('SIGTERM');
    const ended = await Promise.race([exited, sleep(5000).then(() => null)]);
    if (!ended) {
      kill('SIGKILL');
      await exited;
    }
    if (wasRunning) log(`Stopped the server on port ${port}.`);
  })());

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const gone = await Promise.race([exited, sleep(500).then(() => null)]);
    if (gone) {
      await stop();
      throw new Error(`next start exited (${gone.code ?? gone.signal}) before answering:\n${output.trim()}`);
    }
    if (await answers(local)) {
      log(`Server ready on ${local}`);
      return { url: local, started: true, stop };
    }
  }
  await stop();
  throw new Error(`next start did not answer on port ${port} within ${timeoutMs / 1000}s:\n${output.trim()}`);
}

/**
 * First-load JavaScript of an app route, counted as `next build` prints it: the gzip size (level 9) of the route's JS
 * files in .next/app-build-manifest.json, read from .next/static. Null when there is no build to read.
 */
export function firstLoadJs(route = '/', root = REPO_ROOT) {
  const dist = path.join(root, '.next');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(dist, 'app-build-manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  const key = route === '/' ? '/page' : `${route.replace(/\/+$/, '')}/page`;
  const files = (manifest.pages?.[key] ?? []).filter(f => f.endsWith('.js'));
  if (!files.length) return null;
  let bytes = 0;
  for (const file of files) {
    try {
      bytes += gzipSync(readFileSync(path.join(dist, file)), { level: 9 }).length;
    } catch {
      return null;
    }
  }
  return { route, files: files.length, bytes, kb: Math.round(bytes / 100) / 10 };
}
