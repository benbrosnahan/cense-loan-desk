# Audit summary

- Target: https://cense-loan-desk.vercel.app/ (live)
- Started: 2026-11-03T06:37:01.067Z
- Command: `node run.mjs --target live --only security,geo,tools`
- Budgets: PASS: 2 passed, 0 failed

| Step | Result | Time |
|---|---|---|
| security | ok | 0.2 s |
| geo | ok | 11.6 s |
| tools | ok | 0.7 s |

## Scoreboard

| Page | Perf | A11y | BP | SEO | LCP | FCP | CLS |
|---|---|---|---|---|---|---|---|
| Lighthouse not run | – | – | – | – | – | – | – |

Lighthouse did not run in this invocation.

## Budgets

| Budget | Measured | Limit | Result |
|---|---|---|---|
| Security score, live (floor) | 71 | ≥ 71 | pass |
| GEO score (floor) | 44 | ≥ 44 | pass |

First-load JS is read from the local build, so it is checked only when the target is served from this machine.
Floors are not goals: they are the scores measured on 2026-11-02, so falling below one means something regressed.

Targets, which never fail a run:

| Score | Now | Target | Status |
|---|---|---|---|
| Security score, live | 71 | 90 | 19 to go |
| GEO score | 44 | 80 | 36 to go |

## User flow

Not run.

## Security

**71** of 100. HTTPS 100, headers 27, cookies 100, content 80, dependencies not measured.

Lighthouse-based checks: skipped: the lighthouse step did not run in this invocation, so mixed content, CSP, external scripts and noopener were not checked.

- critical: Missing Content-Security-Policy (0/10 points)
- warning: Missing X-Content-Type-Options (0/4 points)
- warning: Missing X-Frame-Options (0/4 points)
- warning: CORS allows all origins

## GEO

**44** of 100: crawl access 20/20, server content 12/30, structured data 0/20, social and meta 7/15, LLM discovery 0/10, indexability 5/5.

Words in the raw HTML: 0. Words once rendered: 236. Content parity 0%.

- fail: H1 Tag in SSR (0/5)
- fail: Heading Hierarchy (0/3)
- fail: Body Text Parity (SSR vs CSR) (0/10)
- fail: JSON-LD in SSR (0/12)
- fail: Rich Schema Types (0/8)
- warn: Open Graph Tags (3/7)
- warn: Canonical URL (0/4)

High-priority recommendations: Add JSON-LD structured data; Move JS-injected page body into the server response.

## Design

Not run.

## UX deterministic

Not run.

## Responsive overflow

Not run.

## INP probe

Not run.

## Site tools

| Tool | Result |
|---|---|
| header-check | score 40: 4 good, 1 warnings, 5 missing |
| meta-validate | score 60: 9 good, 4 warnings, 2 missing |
| structured-data | 0 schemas, 0 errors, 0 warnings |
| sitemap-validate | not found (Sitemap not found at https://cense-loan-desk.vercel.app/sitemap.xml. HTTP 404) |
| redirect-check | 0 redirects, final status 200: No redirects detected. URL resolves directly. |
| broken-links | 11 links, 0 broken, 0 redirects, 0 errors, 0 timeouts |
| webmcp-check | AI readiness 0 |
