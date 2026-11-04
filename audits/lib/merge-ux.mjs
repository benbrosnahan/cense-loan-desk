// UX merge: runs AI findings through post-processing and scoring, then merges them with the deterministic findings. Adapted from PerfMaster's UX engine.
// AI findings arrive from the project's own Claude Code command, so this is the only place they meet the deterministic path.
// Usage: node lib/merge-ux.mjs <uxDir>   reads <uxDir>/<tag>.json and <uxDir>/ai/<tag>.json, writes <uxDir>/merged/
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { postProcessFindings, coerceAiThemeId } from '../engines/finding-postprocess.mjs';
import { calculateScores, parseAIEvidence } from '../engines/ux-heuristics.mjs';
import { engineCoverageFrom } from '../engines/design.mjs';

const uxDir = process.argv[2];
if (!uxDir) {
  console.error('Usage: node lib/merge-ux.mjs <uxDir>');
  process.exit(1);
}
const out = path.join(uxDir, 'merged');
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, dpr: 1, isMobile: false },
  mobile: { width: 375, height: 812, dpr: 1, isMobile: true },
};

// <tag>.dom.json files sit next to each <tag>.json: they are the DOM context for the review, not tags.
const tags = readdirSync(uxDir).filter(f => f.endsWith('.json') && !f.endsWith('.dom.json')).map(f => f.slice(0, -5));
const summary = [];
for (const tag of tags) {
  const j = JSON.parse(readFileSync(path.join(uxDir, `${tag}.json`), 'utf8'));
  const aiPath = path.join(uxDir, 'ai', `${tag}.json`);
  if (!existsSync(aiPath)) { summary.push({ tag, missingAi: true }); continue; }
  const ff = j.formFactor;
  const raw = JSON.parse(readFileSync(aiPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.findings;
  let dropped = 0;
  const mapped = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !['P1', 'P2', 'P3'].includes(item.severity)) { dropped++; continue; }
    const title = typeof item.title === 'string' ? item.title : 'Untitled issue';
    const evidence = parseAIEvidence(item.evidence);
    mapped.push({
      id: randomUUID(),
      severity: item.severity,
      category: typeof item.category === 'string' ? item.category : 'Layout',
      device: ff,
      title,
      description: typeof item.description === 'string' ? item.description : '',
      recommendation: typeof item.recommendation === 'string' ? item.recommendation : '',
      ...(item.boundingBox ? { boundingBox: item.boundingBox } : {}),
      source: 'ai',
      themeId: coerceAiThemeId(item.themeId, title),
      ...(evidence ? { evidence } : {}),
      ...(item.hypothesis === true ? { hypothesis: true } : {}),
      ...(item.scope === 'page' || item.scope === 'element' ? { scope: item.scope } : {}),
    });
  }
  const ctx = {
    device: ff,
    viewport: VIEWPORTS[ff],
    pageContext: j.pageContext,
    coverage: engineCoverageFrom(j.design?.report),
    observedOn: 1,
    sampleSize: 1,
  };
  const ai = postProcessFindings(mapped, ctx);
  const scores = calculateScores(ai);
  const engine = (j.report.findings || []).filter(f => f.source !== 'ai');
  const d = j.design?.report;
  const merged = {
    tag,
    state: j.state,
    formFactor: ff,
    ...scores,
    droppedAi: dropped,
    designScore: d?.score ?? null,
    designGrade: d?.grade ?? null,
    designBuckets: d?.buckets ? Object.fromEntries(Object.entries(d.buckets).map(([k, v]) => [k, `${v.score}/${v.max}`])) : null,
    ai,
    engine,
  };
  writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(merged, null, 1));
  summary.push({
    tag,
    uxScore: scores.uxScore,
    typography: scores.typographyScore,
    contrast: scores.contrastScore,
    layout: scores.layoutScore,
    responsive: scores.responsiveScore,
    navigation: scores.navigationScore,
    content: scores.contentScore,
    aiFindings: ai.length,
    P1: ai.filter(f => f.severity === 'P1').length,
    P2: ai.filter(f => f.severity === 'P2').length,
    P3: ai.filter(f => f.severity === 'P3').length,
    droppedAi: dropped,
    designScore: merged.designScore,
    designGrade: merged.designGrade,
  });
}
writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.table(summary);
