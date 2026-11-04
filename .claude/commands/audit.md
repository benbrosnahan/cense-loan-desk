---
description: Run the audit kit, compare it with the stored baseline, and say what changed
argument-hint: "[live] [--only lighthouse,flow,security,geo,design,ux,tools,responsive,inp,readable]"
---
Run the audit kit in `audits/` and report what changed. Arguments: `$ARGUMENTS`

1. If `audits/node_modules` is missing, run `npm ci` and `npm run setup` inside `audits/`.
2. Pick the target. If the arguments start with `live`, audit the deployment: use `--target live` and compare with `results/2026-11-02-live`. Otherwise audit a local production build: run `npm run build` at the repo root if anything under `src/` changed since the last build, and compare with `results/2026-11-04`. If a newer dated baseline folder exists for that target, compare with the newest one.
3. From `audits/`, run `node run.mjs --target <local|live> --compare <baseline folder>`, adding any `--only` list from the arguments. Exit code 1 means a budget failed. Exit code 2 means a step could not run, so say which one and why.
4. Read `audits/results/latest/SUMMARY.md`.
5. For a local target, also run `npm test` in `audits/`. A test reported as "expected to fail, but passed" is good news: its known issue is fixed. Remove that test's `knownIssue('<ID>')` line, run the test again to see it pass, and tick the issue off in `audits/ROADMAP.md`.

Reply with what got worse, then what got better, then any budget failures. Give the number and the file for each. If nothing moved beyond noise, say so in one line.

A Lighthouse 100 does not mean the work is done. Lighthouse cannot see the first-paint skeleton, the crawler's view, the keyboard path, the money figures or storage failures. The Playwright suite and the `readable`, `geo` and `responsive` steps cover what it misses.
