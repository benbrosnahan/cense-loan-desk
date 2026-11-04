# Audit kit

The scans and tests used to audit Cense Loan Desk on 2 November 2026, kept here so they can be re-run after every change. The findings are in [REPORT.md](REPORT.md) and the plan in [ROADMAP.md](ROADMAP.md).

The kit has its own dependencies in this folder. Nothing here is installed with the app or imported by it, and nothing changes what Vercel builds.

## Set up once

Node 22.19 or newer is required (Lighthouse 13 needs it).

```bash
cd audits
npm ci
npm run setup
```

`npm run setup` downloads the one browser everything uses: Playwright's Chromium.

## Run the tests

```bash
npm run build --prefix ..
npm test
```

This runs the Playwright suite: 183 tests in about 40 seconds. It starts the app's production build on port 3100 unless something is already serving there.

Most tests assert how the app *should* behave, and are marked with the issue they cover, for example `knownIssue('MONEY-03')`. They fail today, and Playwright counts that as expected, so the suite passes. When you fix an issue that has a test, that test reports **"expected to fail, but passed"**. Delete that `knownIssue()` line and tick the item off in [ROADMAP.md](ROADMAP.md). From then on the test guards the fix like any other. The remaining tests guard what already works.

- `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-03"` runs a known issue as an ordinary test, so you can read the real failure.
- `AUDIT_URL=http://localhost:4000 npm test` points the suite at another server, such as a preview deployment or another port.

## Run the scans

```bash
npm run audit
```

This runs these scans one after another and writes `results/latest/SUMMARY.md`:

- Lighthouse page loads and a full user flow
- the security scan
- GEO (AI-search readiness)
- UX and design
- the site tools
- when real content becomes readable
- sideways overflow at five widths
- interaction latency

It then checks [budgets.json](budgets.json). Exit code 0 means every budget holds, 1 means a budget failed, and 2 means a step could not run.

- `node run.mjs --compare results/2026-11-04` adds what changed since this audit's baseline.
- `node run.mjs --target live --only security,geo,tools --compare results/2026-11-02-live` checks the deployment against its baseline, with read-only requests only.
- `node run.mjs --only lighthouse --runs 5` runs one step with more repeats.
- `node run.mjs --help` lists every option.

Lighthouse scores this app 99 to 100, so its numbers will rarely move. The steps that will move are `readable` (when a borrower sees real content, which Lighthouse cannot see here), `geo`, `responsive`, and on the live site `security` and `tools`. The design score (62 to 66, grade D) judges against Material 3 conventions this app does not follow, so watch it for change rather than chasing it.

## With Claude Code

The repo's `.claude/commands/` folder has three commands:

- `/audit` runs the scans and tests, then reports what got better or worse.
- `/ux-review` looks at the real screens as a stressed borrower would and merges what it finds into the UX scores.
- `/fix-next MONEY-03` takes a roadmap item, fixes it, and proves the fix with its test. Leave out the ID to take the next open item.

## What is where

| Path | What it holds |
|---|---|
| [REPORT.md](REPORT.md) | The audit: scoreboard, every issue by area, what is already good, what was not covered, and the method |
| [ROADMAP.md](ROADMAP.md) | Top priorities in order, then the rest of the backlog |
| [issues/](issues/) | One file per issue: measurements, steps to reproduce, the fix, its test and how it was verified |
| [issues.json](issues.json) | The same index, machine-readable |
| [fixes/](fixes/) | Draft material for six fixes: new files, images, `verify.mjs` additions, a Tailwind token patch and an export edit script. None is applied to this repo or proven with its test yet; some fixes were tried on a scratch copy during verification, as their records say. Each issue's Fix section says what to change |
| [tests/](tests/) | The Playwright suite; `helpers.mjs` holds the fixtures and `knownIssue()` |
| `run.mjs`, [probes/](probes/), [engines/](engines/) | The scans. The engines are adapted from PerfMaster (see [engines/NOTICE.md](engines/NOTICE.md)) |
| [budgets.json](budgets.json) | Limits the scans must meet. Floors are today's scores, so a drop below one is a regression. `readableFirstMs` is a ceiling instead, set well above the 2.86 s measured on 2026-11-02 because timings are noisy. Targets are where scores should get to, and never fail a run |
| [results/](results/) | The baselines this audit measured, for `--compare`: `2026-11-04` for a local production build of the audited commit, `2026-11-02-live` for the deployment |
| [lib/](lib/) | Test data, the browser launcher, the app server and the UX merge |

## In CI

[`.github/workflows/audit.yml`](../.github/workflows/audit.yml) runs on every pull request and on pushes to `main`. It runs `verify.mjs`, lint, the type check, the build and this suite, and any failure fails the check. It then runs every scan except security, GEO and the site tools, once each, and writes their summary to the job page. A budget miss there marks the step but does not fail the job, because timings on shared runners are noisy, so run `npm run audit` locally to enforce the budgets. A weekly job, which can also be started by hand, checks the live site's headers, GEO score and links. It does fail when a floor drops.

The workflow only checks. Vercel still deploys whatever reaches `main`. To keep a red check out of production, add a branch protection rule for `main` that requires this check to pass before merging.

## Notes

- The fixes in the issue files and `fixes/` were written against `main` at `0fa60b6`. None has been applied to this repo or proven with its test yet; some were tried on a scratch copy during verification, as their records say. Several touch the same files, so make one change at a time and re-run the tests after each.
- Raise a floor in `budgets.json` when its score improves, so the gain is locked in.
- The baselines in `results/` are trimmed: no raw Lighthouse reports (`--keep-raw` keeps them for a run), and `.gitignore` leaves out their screenshots. Every run writes fresh screenshots to its own folder, `results/latest/` by default.
