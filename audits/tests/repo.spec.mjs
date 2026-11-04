// Repo-level checks for the developer-tooling issues (DX-01 to DX-11) and guards for what the audit found sound in
// the repository itself. Most tests read the app's files; the rest run the app's own tools (its money harness, its
// lint script, its TypeScript) on a temporary copy, so nothing is ever written inside the repo.
// The repo root is the parent of audits/, or AUDIT_REPO when the kit sits elsewhere. Without an app there, these
// tests skip rather than fail.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, knownIssue, openApp } from './helpers.mjs';
import {
  requireRepo, exists, read, readJson, installed, repoPath, filesUnder, rootCodeFiles, stripComments, lineAt,
  findInFiles, lineOf, copyRepo, tempDir, removeTemp, plant, runScript, runHarness, harnessOnCopy, cleanHarnessRun,
  typeCheckProbe, outcome, gitIgnores, branchExists, STOCK_TAILWIND, STOCK_RAMP_NAMES, hexToRgb,
  rgbToHex, contrast,
} from './support/repo.mjs';

const at = hit => `${hit.file}:${hit.line}`;
const list = (items, max = 6) => items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`;

// ------------------------------------------------------------------------------------------------- DX-01

test('DX-01 a change that fails the money checks cannot get through the build that deploys', async () => {
  knownIssue('DX-01');
  requireRepo('typescript', 'next');
  test.skip(!exists('verify.mjs'), 'No verify.mjs at the repo root: point this test at the money checks');

  // What Vercel runs unless the dashboard overrides it: vercel.json's buildCommand, else `npm run build`.
  const vercel = exists('vercel.json') ? readJson('vercel.json') : {};
  const buildCommand = vercel.buildCommand ?? 'npm run build';
  // A money bug verify.mjs does catch: amortizedPayment loses the "- 1" of its denominator.
  const bug = ['src/lib/calc.ts', /\(\s*pow\s*-\s*1\s*\)\s*;/, 'pow;'];
  const bugLine = lineOf(bug[0], bug[1]);
  // `next build` is stubbed so the build stops short of compiling (and of fetching Google Fonts); `playwright` too,
  // in case a later test script starts the browser suite.
  const stub = ['next', 'playwright'];
  const copies = [copyRepo({ stub }), copyRepo({ stub }), copyRepo()];
  try {
    const [clean, broken, harnessCopy] = copies;
    const planted = plant(broken, ...bug) && plant(harnessCopy, ...bug);
    test.skip(!planted, `amortizedPayment's denominator is no longer in ${bug[0]}: plant another bug verify.mjs catches`);
    const [cleanBuild, brokenBuild, harness] = await Promise.all([
      runScript(clean, buildCommand), runScript(broken, buildCommand), runHarness(harnessCopy)]);
    test.skip(cleanBuild.timedOut || brokenBuild.timedOut || harness.timedOut, 'A build or harness run timed out');
    test.skip(cleanBuild.code !== 0, `"${buildCommand}" fails on an untouched copy too (${outcome(cleanBuild)}), so a gate cannot be told from a broken build`);
    test.skip(harness.code === 0, `verify.mjs does not catch the planted bug (${harness.summary}), so it cannot show the gate`);

    const output = `${brokenBuild.stdout}\n${brokenBuild.stderr}`;
    const steps = [...output.matchAll(/^> (?!.*@\d)(.+)$/gm)].map(m => m[1].trim());
    const reachedNext = output.includes('[audit stub] next build');
    expect(brokenBuild.code,
      `With amortizedPayment's denominator broken (${bug[0]}:${bugLine}), node verify.mjs stops (${harness.summary}), ` +
      `yet the deploy build "${buildCommand}" exits ${brokenBuild.code}${reachedNext ? ' and reaches next build' : ''}: ` +
      `it runs ${steps.length ? steps.join(' then ') : 'no npm script'} and never the money checks`).not.toBe(0);
  } finally {
    copies.forEach(removeTemp);
  }
});

// ------------------------------------------------------------------------------------------------- DX-02

// Defects that move a figure a borrower reads, or stop the harness from testing current code. Each must make
// `node verify.mjs` exit non-zero. Anchors are matched loosely so harmless reformatting does not drop a case.
const MONEY_BUGS = [
  { label: "RAP's interest waiver credits a short payment to principal (the bug the README says this harness caught)",
    file: 'src/lib/calc.ts', find: /\?\s*Math\.min\(\s*interest\s*,\s*pay\s*\)/, replace: '? (pay >= interest ? interest : 0)' },
  { label: "RAP's $50 matching principal switched off", file: 'src/lib/calc.ts', find: /matchPrincipal:\s*true/, replace: 'matchPrincipal: false' },
  { label: "the snowball cost's sign flipped", file: 'src/lib/ranking.ts',
    find: /snowball\.totalInterest\s*-\s*avalanche\.totalInterest/, replace: 'snowball.totalInterest + avalanche.totalInterest' },
  { label: 'the payoff chart total negated', file: 'src/lib/ranking.ts', find: /total\s*\+=\s*Math\.max\(\s*0\s*,\s*bal\s*\)/, replace: 'total -= Math.max(0, bal)' },
  { label: 'a type error in calc.ts', file: 'src/lib/calc.ts', find: null, replace: '\nexport const auditTypeError: number = "not a number";\n' },
];
const STALE_BUG = { label: 'the $10 RAP floor set to $5 after one clean run, then verify.mjs run by absolute path from another folder (stale .verify)',
  file: 'src/data/plans.ts', find: /RAP_MIN_MONTHLY\s*=\s*10\b/, replace: 'RAP_MIN_MONTHLY = 5' };

async function staleHarnessRun() {
  const copy = copyRepo();
  const elsewhere = tempDir();
  try {
    const first = await runHarness(copy);
    if (first.code !== 0 || !plant(copy, STALE_BUG.file, STALE_BUG.find, STALE_BUG.replace)) return { applied: false };
    return { applied: true, ...(await runHarness(copy, { cwd: elsewhere })) };
  } finally {
    removeTemp(copy);
    removeTemp(elsewhere);
  }
}

test('DX-02 the money harness fails when a borrower-facing figure breaks or its compiled code is stale', async () => {
  knownIssue('DX-02');
  requireRepo('typescript');
  test.skip(!exists('verify.mjs'), 'No verify.mjs at the repo root: point this test at the money checks');
  const clean = await cleanHarnessRun();
  test.skip(clean.code !== 0, `verify.mjs fails on an untouched copy (${clean.summary}), so planted bugs cannot be told apart`);

  const runs = await Promise.all([
    ...MONEY_BUGS.map(bug => harnessOnCopy({ edits: [[bug.file, bug.find, bug.replace]] }).then(result => ({ bug, result }))),
    staleHarnessRun().then(result => ({ bug: STALE_BUG, result })),
  ]);
  const applied = runs.filter(r => r.result.applied);
  test.skip(applied.length === 0, 'None of the planted bugs fits the current source: update MONEY_BUGS');
  test.skip(applied.some(r => r.result.timedOut), 'A harness run timed out');
  for (const r of runs.filter(r => !r.result.applied)) {
    test.info().annotations.push({ type: 'not planted', description: `${r.bug.label}: anchor not found in ${r.bug.file}` });
  }
  const where = bug => bug.find ? `${bug.file}:${lineOf(bug.file, bug.find)}` : `end of ${bug.file}`;
  const survivors = applied.filter(r => r.result.code === 0).map(r => `${r.bug.label} at ${where(r.bug)}: ${r.result.summary}`);
  expect(survivors,
    `${survivors.length} of ${applied.length} planted defects still pass verify.mjs (untouched copy: ${clean.summary}): ` +
    survivors.join('; ')).toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-03

test('DX-03 every path, harness, branch and count the README names exists in the repository', async () => {
  knownIssue('DX-03');
  requireRepo();
  test.skip(!exists('README.md'), 'No README.md');
  const lines = read('README.md').split('\n');
  const problems = [];
  lines.forEach((text, i) => {
    for (const m of text.matchAll(/`(\.\.\/[^`\s]*)`|\]\((\.\.\/[^)\s]*)\)/g)) {
      problems.push(`line ${i + 1} points outside the repository at ${m[1] ?? m[2]}`);
    }
    if (/\bscratchpad\b/i.test(text)) problems.push(`line ${i + 1} places a harness "in the session scratchpad", which is not in the repository`);
    for (const m of text.matchAll(/\b[Bb]ranch\s+`([^`]+)`/g)) {
      if (branchExists(m[1]) === false) problems.push(`line ${i + 1} names branch ${m[1]}, which no local or remote ref has`);
    }
  });

  // A count beside the command that runs the harness must be the harness's own count. Dated sections are records of
  // their day, so only the commands in code blocks are compared.
  if (installed('typescript') && exists('verify.mjs')) {
    const clean = await cleanHarnessRun();
    let fenced = false;
    lines.forEach((text, i) => {
      if (/^\s*```/.test(text)) { fenced = !fenced; return; }
      if (!fenced || !/verify\.mjs|npm (?:run )?test\b/.test(text) || clean.pass === null) return;
      const count = text.match(/(\d[\d,]*)\s+(?:assertions|checks|tests)\b/);
      if (count && Number(count[1].replace(/,/g, '')) !== clean.pass) {
        problems.push(`line ${i + 1} says ${count[1]} assertions where verify.mjs runs ${clean.pass}`);
      }
    });
  }
  expect(problems, `README.md names ${problems.length} things the repository does not have: ${problems.join('; ')}`).toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-04

/** Runs in the page: every CSS rule for a stock Tailwind colour utility (text-slate-700 and so on), with its colour. */
function stockColourRules({ ramps }) {
  const utility = new RegExp('^(?:text|bg|border(?:-[xytrblse])?|ring-offset|ring|fill|stroke|outline|decoration|divide|' +
    `placeholder|accent|caret|shadow|from|via|to)-(${ramps.join('|')})-(50|[1-9]00|950)$`);
  const probe = document.createElement('i');
  document.body.append(probe);
  const channels = css => (css.match(/[\d.]+/g) ?? []).map(Number);
  const toRgb = value => {
    const token = value.replace(/var\(--[\w-]+(?:,[^()]*)?\)/g, '1').match(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^()]*\)/i);
    if (!token) return null;
    probe.style.color = '';
    probe.style.color = token[0];
    return probe.style.color ? channels(getComputedStyle(probe).color).slice(0, 3) : null;
  };
  const found = [];
  let readable = 0;
  const walk = rules => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        readable++;
        for (const m of rule.selectorText.matchAll(/\.((?:[\w-]|\\.)+)/g)) {
          const cls = m[1].replace(/\\(.)/g, '$1');
          const hit = cls.split(':').pop().replace(/^!/, '').replace(/\/[\d.]+$/, '').match(utility);
          if (!hit) continue;
          let rgb = null;
          for (let i = 0; i < rule.style.length && !rgb; i++) rgb = toRgb(rule.style.getPropertyValue(rule.style[i]));
          if (rgb) found.push({ cls, key: `${hit[1]}-${hit[2]}`, rgb });
        }
      } else if (rule.cssRules) {
        walk(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* a cross-origin sheet cannot be read */ }
  }
  probe.remove();
  const opaque = el => { const c = channels(getComputedStyle(el).backgroundColor); return c.length === 3 || c[3] > 0 ? c.slice(0, 3) : null; };
  return { found, readable, background: opaque(document.body) ?? opaque(document.documentElement) ?? [255, 255, 255] };
}

test('DX-04 every colour class means its stock name, and every colour is defined once in tailwind.config.ts', async ({ page }) => {
  knownIssue('DX-04');
  await openApp(page);
  const { found, readable, background } = await page.evaluate(stockColourRules, { ramps: STOCK_RAMP_NAMES });
  test.skip(readable === 0, 'No stylesheet on the page could be read');

  const rendered = new Map();
  for (const { key, rgb } of found) if (!rendered.has(key)) rendered.set(key, rgb);
  const byShade = ([a], [b]) => a.split('-')[0].localeCompare(b.split('-')[0]) || Number(a.split('-')[1]) - Number(b.split('-')[1]);
  const redefined = [...rendered].sort(byShade)
    .filter(([key, rgb]) => hexToRgb(STOCK_TAILWIND[key]).some((v, i) => Math.abs(v - rgb[i]) > 2))
    .map(([key, rgb]) => `${key} renders ${rgbToHex(rgb)} (stock ${STOCK_TAILWIND[key]})`);
  // What that costs: a shade that passes 4.5:1 on the page as stock Tailwind but not as the redefined colour.
  const traps = [...rendered]
    .map(([key, rgb]) => ({ key, mine: contrast(rgb, background), stock: contrast(hexToRgb(STOCK_TAILWIND[key]), background) }))
    .filter(t => t.mine < 4.5 && t.stock >= 4.5)
    .map(t => `text-${t.key} on the page background ${rgbToHex(background)} is ${t.mine.toFixed(2)}:1, under 4.5:1, where stock ${t.key} gives ${t.stock.toFixed(2)}:1`);

  // Colours written as literals outside the Tailwind config. White and black are not brand colours, and the
  // browser-chrome themeColor in layout.tsx cannot reference a class, so those are allowed. So is a palette module
  // that tailwind.config.ts itself imports, and a CSS custom property the config reads with var(): either way the
  // colour is still defined once, in the place the config takes it from.
  let literals = [];
  if (exists('src')) {
    const config = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'].find(exists);
    const configText = config ? read(config) : '';
    const palettes = new Set([...configText.matchAll(/(?:from|require\()\s*["'](\.{1,2}\/[^"']+)["']/g)]
      .flatMap(m => ['', '.ts', '.js', '.mjs', '/index.ts'].map(ext => path.posix.normalize(m[1] + ext))));
    const readByConfig = (file, text) => {
      const property = file.endsWith('.css') && text.match(/^\s*(--[\w-]+)\s*:/)?.[1];
      return Boolean(property) && configText.includes(`var(${property}`);
    };
    literals = findInFiles(filesUnder('src', ['.ts', '.tsx', '.js', '.jsx', '.css']).filter(f => !palettes.has(f)),
      /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)
      .filter(h => !/^#(?:fff|ffffff|000|000000)$/i.test(h.match))
      .filter(h => {
        const text = read(h.file).split('\n')[h.line - 1];
        return !/\bthemeColor\s*:/.test(text) && !readByConfig(h.file, text);
      })
      .map(h => `${at(h)} ${h.match}`);
  } else {
    test.info().annotations.push({ type: 'partial', description: `No src/ at ${repoPath()}: colour literals not checked` });
  }
  expect([...redefined, ...literals],
    `${redefined.length} stock Tailwind colour names render other colours (${list(redefined, 4)})` +
    `${traps.length ? `; ${traps.join('; ')}` : ''}; ` +
    `${literals.length} colour literals sit outside tailwind.config.ts${literals.length ? ` (${list(literals, 4)})` : ''}`)
    .toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-05

// Next.js reads these exports from route files itself, so they have no caller in the code.
const NEXT_ROUTE_EXPORTS = /^(metadata|viewport|generateMetadata|generateViewport|generateStaticParams|revalidate|dynamic|dynamicParams|fetchCache|runtime|preferredRegion|maxDuration)$/;

test('DX-05 every export in src has a caller outside its own file', () => {
  knownIssue('DX-05');
  requireRepo();
  // verify.mjs counts as a caller: it reads weightedRate, amortizedPayment and orderLoans from the compiled output.
  const consumers = [...filesUnder('src'), ...rootCodeFiles()].map(file => ({ file, text: stripComments(read(file)) }));
  const unused = [];
  for (const file of filesUnder('src', ['.ts', '.tsx'])) {
    const text = stripComments(read(file));
    const names = [];
    for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:async\s+|abstract\s+)?(?:const\s+enum|function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.push({ name: m[1], line: lineAt(text, m.index) });
    }
    for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop();
        if (name && name !== 'default') names.push({ name, line: lineAt(text, m.index) });
      }
    }
    for (const { name, line } of names) {
      if (file.startsWith('src/app/') && NEXT_ROUTE_EXPORTS.test(name)) continue;
      const used = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
      if (!consumers.some(c => c.file !== file && used.test(c.text))) unused.push(`${name} (${file}:${line})`);
    }
  }
  expect(unused, `${unused.length} exports have no caller outside their own file: ${unused.join(', ')}`).toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-06

test('DX-06 every production dependency is imported by the code', () => {
  knownIssue('DX-06');
  requireRepo();
  const deps = Object.keys(readJson('package.json').dependencies ?? {});
  // Next loads these itself when they are installed, and TypeScript reads type packages without an import.
  const loadedByTools = dep => ['next', 'react', 'react-dom', 'sharp', 'critters', 'beasties'].includes(dep) || dep.startsWith('@types/');
  const code = [...filesUnder('src'), ...rootCodeFiles()].map(file => stripComments(read(file))).join('\n');
  const escape = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const imported = dep => new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*|@import\\s+(?:url\\()?)["']${escape(dep)}(?:/[^"']*)?["']`).test(code);
  // PostCSS names its plugins as keys: plugins: { tailwindcss: {}, autoprefixer: {} }.
  const postcss = rootCodeFiles().filter(file => file.startsWith('postcss.')).map(file => stripComments(read(file))).join('\n');
  const postcssPlugin = dep => new RegExp(`(?:^|[\\s{,])["']?${escape(dep)}["']?\\s*:`, 'm').test(postcss);
  const unused = deps.filter(dep => !loadedByTools(dep) && !imported(dep) && !postcssPlugin(dep));
  const readmeLines = exists('README.md') ? read('README.md').split('\n') : [];
  const notes = unused.map(dep => {
    const i = readmeLines.findIndex(text => text.includes(dep));
    return i < 0 ? dep : `${dep} (README.md:${i + 1} mentions it: "${readmeLines[i].trim().slice(0, 70)}")`;
  });
  expect(unused, `package.json lists ${unused.length} production ${unused.length === 1 ? 'dependency' : 'dependencies'} that nothing in src, verify.mjs or the config files imports: ${notes.join('; ')}`)
    .toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-07

test('DX-07 the plan count, dollar format, loan totals and closed-plan record each have one definition', () => {
  knownIssue('DX-07');
  requireRepo();
  const files = filesUnder('src', ['.ts', '.tsx']);
  const problems = [];

  const typedCounts = findInFiles(files, /\bof\s+(?:the\s+)?(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[A-Za-z-]+\s+){0,2}plans\b/gi);
  if (typedCounts.length) problems.push(`plan count typed in rather than read from the plan list: ${typedCounts.map(h => `"${h.match}" at ${at(h)}`).join(', ')}`);

  const formatters = findInFiles(files, /(?:new\s+Intl\.NumberFormat|\.toLocaleString)\s*\([^{)]*\{[^}]*\}/g)
    .filter(h => /currency/.test(h.match) && /maximumFractionDigits\s*:\s*0\b/.test(h.match));
  if (formatters.length > 1) problems.push(`whole-dollar formatter defined ${formatters.length} times: ${formatters.map(at).join(', ')}`);

  const sums = findInFiles(files, /\.reduce\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\1\s*\+\s*\(?\s*\2\.(balance|principal)\s*(?:\|\|\s*0\s*\)?)?\s*,/g);
  for (const field of ['balance', 'principal']) {
    const sites = sums.filter(h => h.groups[2] === field);
    if (sites.length > 1) problems.push(`loan ${field} total summed in ${sites.length} places: ${sites.map(at).join(', ')}`);
  }

  const closed = findInFiles(files, /\beligible\s*:\s*false\b/g);
  if (closed.length > 1) problems.push(`closed-plan record written out ${closed.length} times: ${closed.map(at).join(', ')}`);

  expect(problems, `${problems.length} rules are written out more than once: ${problems.join('; ')}`).toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-08

// eslint.org/version-support: end-of-life dates of the majors that have one.
const ESLINT_END_OF_LIFE = { 8: '2024-10-05', 9: '2026-08-06' };

// Line 8: an async onClick, the shape of the two silent spreadsheet downloads. Line 9: a click-only <div>, which
// jsx-a11y's strict set reports and Next's default set does not.
const LINT_PROBE = `"use client";

async function save(): Promise<void> {}

export function AuditLintProbe() {
  return (
    <div>
      <button type="button" onClick={async () => { await save(); }}>Save</button>
      <div onClick={() => undefined}>Open</div>
    </div>
  );
}
`;

/** Reads next lint's and ESLint's stylish output: [{ file, line, severity, rule }]. */
function lintMessages(output) {
  const messages = [];
  let file = null;
  for (const raw of output.split('\n')) {
    const text = raw.trimEnd();
    if (/^(?:\.?\/)?\S+\.[cm]?[jt]sx?$/.test(text.trim())) { file = text.trim(); continue; }
    const m = text.match(/^\s*(\d+):(\d+)\s+(error|warning)\b:?\s+(.*)$/i);
    if (m && file) messages.push({ file, line: Number(m[1]), severity: m[3].toLowerCase(), rule: m[4].trim().split(/\s{2,}/).pop() });
  }
  return messages;
}

test('DX-08 npm run lint flags a promise-returning onClick and the strict accessibility rules, on a supported ESLint', async () => {
  knownIssue('DX-08');
  requireRepo('eslint');
  const lint = readJson('package.json').scripts?.lint;
  const eslint = JSON.parse(read('node_modules/eslint/package.json')).version;
  const major = Number(eslint.split('.')[0]);
  const endOfLife = ESLINT_END_OF_LIFE[major];
  const unsupported = major < 8 ? `it runs ESLint ${eslint}, out of support for years`
    : endOfLife && Date.now() >= Date.parse(endOfLife) ? `it runs ESLint ${eslint}, end of life since ${endOfLife}` : null;
  const problems = [];
  if (!lint) problems.push('package.json has no lint script');

  const copy = copyRepo();
  try {
    const dir = fs.existsSync(path.join(copy, 'src', 'components')) ? 'src/components' : 'src';
    const probe = `${dir}/AuditLintProbe.tsx`;
    fs.writeFileSync(path.join(copy, probe), LINT_PROBE);
    const result = lint ? await runScript(copy, lint, { timeout: 40_000 }) : null;
    test.skip(result?.timedOut, `"${lint}" timed out`);
    let said = '';
    if (result) {
      const output = `${result.stdout}\n${result.stderr}`;
      const messages = lintMessages(output);
      const inProbe = messages.filter(m => m.file.endsWith('AuditLintProbe.tsx') && m.severity === 'error');
      if (!inProbe.some(m => m.line === 8 && /promise|async/i.test(m.rule))) problems.push(`no error for the promise-returning onClick at ${probe}:8`);
      if (!inProbe.some(m => m.line === 9 && /jsx-a11y/.test(m.rule))) problems.push(`no jsx-a11y error for the click-only <div> at ${probe}:9`);
      const elsewhere = messages.filter(m => !m.file.endsWith('AuditLintProbe.tsx') && m.severity === 'error');
      if (elsewhere.length) problems.push(`${elsewhere.length} errors in the app's own files: ${list(elsewhere.map(m => `${m.file}:${m.line} ${m.rule}`))}`);
      said = output.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('>')) ?? '';
      said = `"${lint}" exits ${result.code}${said ? `, printing "${said.slice(0, 60)}"` : ''}`;
    }
    if (unsupported) problems.push(unsupported);
    expect(problems, `npm run lint with an async onClick and a click-only <div> planted: ${said}; ${problems.join('; ')}`).toEqual([]);
  } finally {
    removeTemp(copy);
  }
});

// ------------------------------------------------------------------------------------------------- DX-09

test('DX-09 a table or array lookup that can miss is a type error, so it cannot reach a dollar figure as NaN', async () => {
  knownIssue('DX-09');
  requireRepo('typescript');
  const result = await typeCheckProbe([
    'const POVERTY: Record<number, number> = { 1: 15960, 2: 21640 };',
    'export const povertyLine = (household: number): number => POVERTY[household] * 1.5;',
    'const steps: number[] = [100, 200, 300];',
    'export const step = (i: number): number => steps[i] + 50;',
    'export const sanity: number = "not a number";',
  ].join('\n'));
  test.skip(!result.errors.some(e => e.line === 5), `tsc did not check the probe with the app's tsconfig.json (${outcome(result)})`);
  const flagged = [2, 4].filter(line => result.errors.some(e => e.line === line));
  expect(flagged,
    `With the app's tsconfig.json, a Record lookup and an array read that can miss compile without error ` +
    `(${result.errors.length - 1} errors besides the control; noUncheckedIndexedAccess is ` +
    `${/"noUncheckedIndexedAccess"\s*:\s*true/.test(read('tsconfig.json')) ? 'on' : 'not set'}), so a missing ` +
    `poverty-table row would reach the IBR payment as NaN`).toEqual([2, 4]);
});

// ------------------------------------------------------------------------------------------------- DX-10

// nvm's LTS codenames, for an .nvmrc that names one.
const LTS_CODENAMES = { argon: 4, boron: 6, carbon: 8, dubnium: 10, erbium: 12, fermium: 14, gallium: 16, hydrogen: 18, iron: 20, jod: 22, krypton: 24 };

/** Whether a package.json engines range admits some release of Node `major`. Covers the forms people write. */
function rangeAllowsMajor(range, major) {
  return String(range).split('||').some(set => {
    const hyphen = set.match(/^\s*v?(\d+)\S*\s+-\s+v?(\d+)/);
    if (hyphen) return major >= Number(hyphen[1]) && major <= Number(hyphen[2]);
    const parts = set.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every(part => {
      const m = part.match(/^(>=|<=|>|<|=|\^|~)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/);
      if (!m) return false;
      const [, op = '', first, minor, patch] = m;
      if (/[xX*]/.test(first)) return true;
      const n = Number(first);
      const past = [minor, patch].some(x => x !== undefined && /^\d+$/.test(x) && Number(x) > 0);
      if (op === '>=') return major >= n;
      if (op === '>') return past ? major >= n : major > n;
      if (op === '<=') return major <= n;
      if (op === '<') return past ? major <= n : major < n;
      return major === n;
    });
  });
}

test('DX-10 one Node LTS major is declared, and the harness gives the same result whether or not Node guesses module type', async () => {
  knownIssue('DX-10');
  requireRepo();
  const problems = [];
  const engines = readJson('package.json').engines?.node;
  const versionFile = ['.nvmrc', '.node-version', '.tool-versions'].find(exists);
  let pinned = null;
  if (versionFile) {
    const text = read(versionFile).trim();
    const named = versionFile === '.tool-versions' ? text.match(/^\s*node(?:js)?\s+(\S+)/m)?.[1] : text.split(/\s+/)[0];
    pinned = /^v?\d/.test(named ?? '') ? Number(named.replace(/^v/, '').split('.')[0]) : LTS_CODENAMES[(named ?? '').replace(/^lts\//i, '').toLowerCase()] ?? null;
    if (pinned === null) problems.push(`${versionFile} names "${named}", not one Node major`);
  }
  if (!engines) problems.push('package.json has no engines.node, so Vercel picks the Node major');
  if (!versionFile) problems.push('there is no .nvmrc, .node-version or .tool-versions for laptops');
  if (engines && pinned !== null && !rangeAllowsMajor(engines, pinned)) problems.push(`engines.node "${engines}" does not admit Node ${pinned} from ${versionFile}`);
  if (pinned !== null && pinned % 2 === 1) problems.push(`Node ${pinned} is not an LTS line`);

  if (installed('typescript') && exists('verify.mjs')) {
    const [plain, undetected] = await Promise.all([cleanHarnessRun(), harnessOnCopy({ nodeArgs: ['--no-experimental-detect-module'] })]);
    test.skip(plain.timedOut || undetected.timedOut, 'A harness run timed out');
    if (/MODULE_TYPELESS_PACKAGE_JSON/.test(plain.stderr)) problems.push('node verify.mjs warns MODULE_TYPELESS_PACKAGE_JSON about its compiled output on every run');
    if (/bad option/i.test(undetected.stderr)) {
      test.info().annotations.push({ type: 'partial', description: `Node ${process.version} cannot turn module detection off; that half was not checked` });
    } else if (undetected.code !== plain.code || undetected.pass !== plain.pass || undetected.fail !== plain.fail) {
      problems.push(`with Node's module syntax detection off it gives ${undetected.summary} instead of ${plain.summary}`);
    }
  } else {
    test.info().annotations.push({ type: 'partial', description: 'TypeScript or verify.mjs missing: the harness half was not checked' });
  }
  expect(problems, `Node ${process.version} here; ${problems.join('; ')}`).toEqual([]);
});

// ------------------------------------------------------------------------------------------------- DX-11

const SPDX_BY_HEADING = [[/MIT License/i, 'MIT'], [/Apache License/i, 'Apache-2.0'], [/ISC License/i, 'ISC'],
  [/BSD 3-Clause/i, 'BSD-3-Clause'], [/BSD 2-Clause/i, 'BSD-2-Clause'], [/Mozilla Public License/i, 'MPL-2.0']];

test('DX-11 package.json declares the license LICENSE grants, and the README credits the Apache-2.0 code that ships', () => {
  knownIssue('DX-11');
  requireRepo();
  const pkg = readJson('package.json');
  const problems = [];
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE'].find(exists);
  const heading = licenseFile ? read(licenseFile).split('\n').slice(0, 3).join(' ') : '';
  const granted = SPDX_BY_HEADING.find(([re]) => re.test(heading))?.[1] ?? null;
  if (!pkg.license) problems.push(`package.json has no "license"${granted ? ` although ${licenseFile} grants ${granted}` : ''}`);
  else if (granted && !String(pkg.license).includes(granted)) problems.push(`package.json says "${pkg.license}" where ${licenseFile} grants ${granted}`);

  // Measured in the audit: SheetJS xlsx ships in the export chunk and @swc/helpers in Next's first-load chunks, both
  // Apache-2.0, with their license headers stripped by the build.
  const lock = exists('package-lock.json') ? readJson('package-lock.json').packages ?? {} : {};
  const licenseOf = name => lock[`node_modules/${name}`]?.license ?? 'license unknown';
  const shipped = [
    pkg.dependencies?.xlsx && { name: 'SheetJS xlsx', license: licenseOf('xlsx'), named: /SheetJS|(?<![.\w-])xlsx\b/ },
    pkg.dependencies?.next && { name: '@swc/helpers', license: licenseOf('@swc/helpers'), named: /@swc\/helpers/ },
  ].filter(Boolean);
  // Where people reading the code look: the README, a NOTICE or third-party notices file at the root, or a local
  // file the README links to.
  const readme = exists('README.md') ? read('README.md').replace(/<!--[\s\S]*?-->/g, '') : '';
  const notices = [...new Set([
    ...fs.readdirSync(repoPath()).filter(name => /^(?:NOTICE|THIRD[-_ ]?PARTY|ThirdParty|CREDITS|ACKNOWLEDG)/i.test(name)),
    ...[...readme.matchAll(/\]\(\s*(?!https?:|mailto:|#)<?([^)\s#>]+)/g)].map(m => path.posix.normalize(m[1])),
  ])].filter(rel => !rel.startsWith('..') && /(?:^|\/)[^./]+$|\.(?:md|markdown|txt)$/i.test(rel) && exists(rel) && fs.statSync(repoPath(rel)).isFile());
  const credits = [readme, ...notices.map(read)].join('\n');
  const where = ['README.md', ...notices].join(' and ');
  const unnamed = shipped.filter(p => !p.named.test(credits));
  if (unnamed.length) problems.push(`${where} never name${notices.length ? '' : 's'} ${unnamed.map(p => `${p.name} (${p.license})`).join(' or ')}, though ${unnamed.length > 1 ? 'both ship' : 'it ships'} in the page's JavaScript`);
  if (shipped.some(p => /Apache/.test(p.license)) && !/Apache(?:-2\.0| License)/.test(credits)) problems.push(`${where} never mention${notices.length ? '' : 's'} the Apache-2.0 license that code carries`);
  expect(problems, problems.join('; ')).toEqual([]);
});

// =========================================================================================== regression guards

test('the app source makes no network calls and loads no analytics or third-party scripts', () => {
  requireRepo();
  // README: "no fetch/XHR/beacon anywhere in source, no analytics packages". Privacy is the product.
  const files = [...filesUnder('src'), ...rootCodeFiles().filter(file => file !== 'verify.mjs')];
  const calls = findInFiles(files, /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bgtag\s*\(|googletagmanager|google-analytics|["']next\/script["']|<script\b[^>]*\bsrc=|\bimport\s*\(\s*["']https?:/g)
    .map(h => `${at(h)} ${h.match}`);
  const trackers = /^(@vercel\/analytics|@vercel\/speed-insights|posthog-js|mixpanel-browser|@segment\/|react-ga4?$|@sentry\/|logrocket|@datadog\/browser-|@amplitude\/|plausible-tracker|@fullstory\/|@hotjar\/|@newrelic\/|@next\/third-parties|@microsoft\/applicationinsights)/;
  const packages = Object.keys(readJson('package.json').dependencies ?? {}).filter(dep => trackers.test(dep)).map(dep => `package.json depends on ${dep}`);
  expect([...calls, ...packages], 'The app reaches the network or a tracker on its own').toEqual([]);
});

test('the app source has no HTML injection or string-to-code sinks', () => {
  requireRepo();
  const sinks = findInFiles(filesUnder('src'),
    /dangerouslySetInnerHTML|\.(?:inner|outer)HTML\s*=|insertAdjacentHTML|\beval\s*\(|\bnew\s+Function\s*\(|document\.write|\bsrcdoc\b|\bset(?:Timeout|Interval)\s*\(\s*["'`]/g)
    .map(h => `${at(h)} ${h.match}`);
  expect(sinks, 'A stored nickname or servicer could now reach the DOM as HTML or run as code').toEqual([]);
});

test('the money harness passes on untouched code and fails loudly when a regulatory figure changes', async () => {
  requireRepo('typescript');
  test.skip(!exists('verify.mjs'), 'No verify.mjs at the repo root');
  const changes = [
    { label: 'the 2026 poverty line for a household of 1 lowered by $1,000', file: 'src/data/plans.ts',
      find: /(POVERTY_2026[^=]*=\s*\{\s*1\s*:\s*)(\d+)/, replace: (_, head, value) => `${head}${Number(value) - 1000}` },
    { label: 'the RAP monthly floor halved', file: 'src/data/plans.ts',
      find: /(RAP_MIN_MONTHLY\s*=\s*)(\d+)/, replace: (_, head, value) => `${head}${Number(value) / 2}` },
  ];
  const [clean, ...runs] = await Promise.all([cleanHarnessRun(),
    ...changes.map(change => harnessOnCopy({ edits: [[change.file, change.find, change.replace]] }).then(result => ({ change, result })))]);
  test.skip(clean.timedOut || runs.some(r => r.result.timedOut), 'A harness run timed out');
  const problems = [];
  if (clean.code !== 0 || clean.fail !== 0 || !clean.pass) problems.push(`untouched copy: ${clean.summary}`);
  const applied = runs.filter(r => r.result.applied);
  test.skip(applied.length === 0 && problems.length === 0, 'The regulatory constants moved: point this guard at them');
  for (const { change, result } of applied) {
    if (result.code === 0 || !(result.fail > 0)) problems.push(`${change.label}: ${result.summary}`);
  }
  expect(problems, 'verify.mjs no longer passes clean code, or no longer names a changed regulatory figure').toEqual([]);
});

test('TypeScript stays strict: an implicit any and a possibly-null read fail the type check', async () => {
  requireRepo('typescript');
  const result = await typeCheckProbe([
    'export function count(values) { return values.length; }',
    'export function size(name: string | null): number { return name.length; }',
    'export const sanity: number = "not a number";',
  ].join('\n'));
  test.skip(!result.errors.some(e => e.line === 3), `tsc did not check the probe with the app's tsconfig.json (${outcome(result)})`);
  const flagged = [1, 2].filter(line => result.errors.some(e => e.line === line));
  expect(flagged, `With the app's tsconfig.json only lines ${flagged.join(', ') || 'none'} of 1 (implicit any) and 2 (null read) fail`).toEqual([1, 2]);
});

const SECRET_PATTERNS = [
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/], ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/], ['OpenAI or Anthropic style key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{20,}/], ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/], ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

test('secrets, local env files and build output stay out of git', () => {
  requireRepo();
  const patterns = exists('.gitignore') ? read('.gitignore').split('\n') : [];
  const mustIgnore = ['node_modules/react/index.js', '.next/BUILD_ID', 'out/index.html', '.env.local', '.env.production.local',
    '.vercel/project.json', 'certs/server.pem', '.verify/lib/calc.js'];
  const unignored = mustIgnore.filter(file => !gitIgnores(patterns, file)).map(file => `.gitignore lets ${file} be committed`);
  const binary = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|otf|eot|pdf|zip|gz|xlsx)$/i;
  const lockfiles = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/;
  const leaks = [];
  for (const file of filesUnder('.', null)) {
    if (binary.test(file) || lockfiles.test(file) || fs.statSync(repoPath(file)).size > 1_000_000) continue;
    const text = read(file);
    for (const [kind, re] of SECRET_PATTERNS) if (re.test(text)) leaks.push(`${file}: looks like a ${kind}`);
  }
  expect([...unignored, ...leaks], 'Something secret or generated could reach the public repository').toEqual([]);
});

const PERMISSIVE = new Set(['MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0', 'CC-BY-3.0',
  'CC-BY-4.0', 'BlueOak-1.0.0', 'Unlicense', 'Python-2.0', 'Zlib']);
const permissive = expr => {
  if (typeof expr !== 'string') return false;
  const flat = expr.replace(/[()]/g, ' ').trim();
  return / OR /.test(flat) ? flat.split(/\s+OR\s+/).some(permissive) : flat.split(/\s+AND\s+/).every(part => PERMISSIVE.has(part.trim()));
};

test('every production dependency is under a permissive license', () => {
  requireRepo();
  test.skip(!exists('package-lock.json'), 'No package-lock.json');
  const problems = [];
  for (const [where, entry] of Object.entries(readJson('package-lock.json').packages ?? {})) {
    if (!where || entry.dev || entry.devOptional || entry.link) continue;
    let license = entry.license;
    if (!license) {
      const manifest = repoPath(where, 'package.json');
      if (!fs.existsSync(manifest)) continue; // not installed here (another platform's optional binary): nothing to read
      const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      license = meta.license ?? meta.licenses?.map(l => l.type ?? l).join(' OR ');
    }
    if (!permissive(license)) problems.push(`${where.replace(/^.*node_modules\//, '')}: ${license ?? 'no license declared'}`);
  }
  expect(problems, 'A production dependency is not under a permissive license').toEqual([]);
});
