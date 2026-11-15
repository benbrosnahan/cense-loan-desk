# Audit summary

- Target: http://localhost:3100/ (local)
- Started: 2026-11-04T20:45:37.959Z
- Command: `node run.mjs --target local --runs 3`
- Budgets: PASS: 29 passed, 0 failed

| Step | Result | Time |
|---|---|---|
| lighthouse | ok | 69.9 s |
| flow | ok | 147.1 s |
| security | ok | under 0.1 s |
| geo | ok | 10.5 s |
| design | ok | 100.1 s |
| ux | ok | under 0.1 s |
| tools | ok | under 0.1 s |
| responsive | ok | 70.3 s |
| inp | ok | 113.8 s |
| readable | ok | 25.6 s |

## Scoreboard

| Page | Perf | A11y | BP | SEO | LCP | FCP | CLS |
|---|---|---|---|---|---|---|---|
| Empty, mobile | 100 | 100 | 100 | 100 | 752 ms | 752 ms | 0 |
| Empty, desktop | 100 | 100 | 100 | 100 | 202 ms | 202 ms | 0 |
| Seeded, mobile | 100 | 100 | 100 | 100 | 752 ms | 752 ms | 0 |
| Seeded, desktop | 100 | 100 | 100 | 100 | 202 ms | 202 ms | 0 |

Median of 3 Lighthouse runs per page, chosen by performance score. Empty is a first visit; seeded has the eight-loan fixture in localStorage before load. TBT: empty, mobile 0 ms, empty, desktop 0 ms, seeded, mobile 0 ms, seeded, desktop 0 ms.

## Budgets

| Budget | Measured | Limit | Result |
|---|---|---|---|
| Performance, empty, mobile | 100 | ≥ 90 | pass |
| Accessibility, empty, mobile | 100 | ≥ 100 | pass |
| Best practices, empty, mobile | 100 | ≥ 95 | pass |
| SEO, empty, mobile | 100 | ≥ 100 | pass |
| LCP, empty, mobile | 752 ms | ≤ 2500 ms | pass |
| FCP, empty, mobile | 752 ms | ≤ 1800 ms | pass |
| CLS, empty, mobile | 0 | ≤ 0.1 | pass |
| TBT, empty, mobile | 0 ms | ≤ 200 ms | pass |
| Performance, empty, desktop | 100 | ≥ 90 | pass |
| Accessibility, empty, desktop | 100 | ≥ 100 | pass |
| Best practices, empty, desktop | 100 | ≥ 95 | pass |
| SEO, empty, desktop | 100 | ≥ 100 | pass |
| Performance, seeded, mobile | 100 | ≥ 90 | pass |
| Accessibility, seeded, mobile | 100 | ≥ 100 | pass |
| Best practices, seeded, mobile | 100 | ≥ 95 | pass |
| SEO, seeded, mobile | 100 | ≥ 100 | pass |
| LCP, seeded, mobile | 752 ms | ≤ 2500 ms | pass |
| FCP, seeded, mobile | 752 ms | ≤ 1800 ms | pass |
| CLS, seeded, mobile | 0 | ≤ 0.1 | pass |
| TBT, seeded, mobile | 0 ms | ≤ 200 ms | pass |
| Performance, seeded, desktop | 100 | ≥ 90 | pass |
| Accessibility, seeded, desktop | 100 | ≥ 100 | pass |
| Best practices, seeded, desktop | 100 | ≥ 95 | pass |
| SEO, seeded, desktop | 100 | ≥ 100 | pass |
| Flow INP (worst timespan), mobile | 79 ms (Load example loans) | ≤ 200 ms | pass |
| Flow INP (worst timespan), desktop | 50 ms (Load example loans) | ≤ 200 ms | pass |
| First-load JS, route / | 124.6 kB (6 files, gzip) | ≤ 130 kB | pass |
| GEO score (floor) | 44 | ≥ 44 | pass |
| Readable, first visit (floor) | 2854 ms (median of 3 cold loads) | ≤ 3500 ms | pass |

Floors are not goals: they are the scores measured on 2026-11-02, so falling below one means something regressed.
The readable floor is a time, so going over it fails. It sits well above the times measured on 2026-11-02, because throttled loads on a shared machine are noisy: a regression guard, not a goal.

Targets, which never fail a run:

| Measure | Now | Target | Status |
|---|---|---|---|
| GEO score | 44 | 80 | 36 to go |
| Readable, first visit | 2854 ms | 1600 ms | 1254 ms to go |

## User flow

Lighthouse user flow: first load, example loans, plans with income typed, a plan chosen, the extra-payment slider dragged, and a snapshot saved in Records. Timespans measure INP, CLS and TBT; snapshots audit the state for accessibility, best practices and SEO.

### Mobile

| Step | Mode | Perf | A11y | BP | SEO | INP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| First load (empty) | navigation | 100 | 100 | 100 | 100 | – | 0 | 0 ms |
| Load example loans | timespan | 100 | – | 100 | – | 79 ms | 0 | 0 ms |
| Loans tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Open plans and answer questions | timespan | 100 | – | 100 | – | 34 ms | 0 | 0 ms |
| Plans tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Choose a plan and open payoff | timespan | 100 | – | 100 | – | 40 ms | 0 | 0 ms |
| Drag extra payment slider | timespan | 100 | – | 100 | – | 18 ms | 0 | 0 ms |
| Payoff tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Records and snapshot | timespan | 100 | – | 100 | – | 21 ms | 0 | 0 ms |
| Records tab | snapshot | – | 100 | 100 | 100 | – | – | – |

Failing audits: Network dependency tree (First load (empty)); Render-blocking requests (First load (empty)).

### Desktop

| Step | Mode | Perf | A11y | BP | SEO | INP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| First load (empty) | navigation | 100 | 100 | 100 | 100 | – | 0 | 0 ms |
| Load example loans | timespan | 100 | – | 100 | – | 50 ms | 0 | 0 ms |
| Loans tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Open plans and answer questions | timespan | 100 | – | 100 | – | 21 ms | 0 | 0 ms |
| Plans tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Choose a plan and open payoff | timespan | 100 | – | 100 | – | 27 ms | 0 | 0 ms |
| Drag extra payment slider | timespan | 100 | – | 100 | – | 32 ms | 0 | 0 ms |
| Payoff tab | snapshot | – | 100 | 100 | 100 | – | – | – |
| Records and snapshot | timespan | 100 | – | 100 | – | 25 ms | 0 | 0 ms |
| Records tab | snapshot | – | 100 | 100 | 100 | – | – | – |

Failing audits: Network dependency tree (First load (empty)).


## Security

**35** of 100. HTTPS 0, headers 0, cookies 100, content 100, dependencies not measured.

Lighthouse-based checks: included, from the median mobile Lighthouse run of the empty page.

This target is plain HTTP, so TLS and every header read as missing whatever the server sends. Judge security with --target live.

- critical: Page not served over HTTPS
- critical: Missing Content-Security-Policy (0/10 points)
- critical: Missing Strict-Transport-Security (0/8 points)
- warning: Missing X-Content-Type-Options (0/4 points)
- warning: Missing X-Frame-Options (0/4 points)

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

| State | Desktop | Mobile | Score | Grade | Accessibility | Consistency | Motion | Performance |
|---|---|---|---|---|---|---|---|---|
| empty | 62 D | 62 D | 62 | D | 76 | 76 | 42 | 54 |
| form-errors | 62 D | 62 D | 62 | D | 76 | 76 | 42 | 54 |
| loans | 65.6 D | 65.6 D | 66 | D | 88 | 76 | 42 | 54 |
| plans | 63.2 D | 63.2 D | 63 | D | 88 | 64 | 42 | 54 |
| payoff | 63.2 D | 63.2 D | 63 | D | 88 | 64 | 42 | 54 |
| records | 65.6 D | 65.6 D | 66 | D | 88 | 76 | 42 | 54 |

Design engine 1.3.0. Score is the mean of the rounded desktop (1440x900) and mobile (375x812) scores; buckets are 0 to 100. The engine scores against Material 3 conventions and this app does not use Material, so a radius or target-size rule is advisory unless it is also a WCAG failure.

## UX deterministic

| Screen | Rule findings | P1 | P2 | P3 | Probe findings | Design |
|---|---|---|---|---|---|---|
| empty-desktop | 7 | 1 | 6 | 0 | 0 | 62 |
| empty-mobile | 7 | 1 | 6 | 0 | 0 | 62 |
| form-errors-desktop | 7 | 1 | 6 | 0 | 0 | 62 |
| form-errors-mobile | 7 | 1 | 6 | 0 | 0 | 62 |
| loans-desktop | 6 | 1 | 5 | 0 | 0 | 65.6 |
| loans-mobile | 6 | 1 | 5 | 0 | 0 | 65.6 |
| plans-desktop | 7 | 1 | 6 | 0 | 0 | 63.2 |
| plans-mobile | 7 | 1 | 6 | 0 | 0 | 63.2 |
| payoff-desktop | 7 | 1 | 6 | 0 | 0 | 63.2 |
| payoff-mobile | 7 | 1 | 6 | 0 | 0 | 63.2 |
| records-desktop | 6 | 1 | 5 | 0 | 0 | 65.6 |
| records-mobile | 6 | 1 | 5 | 0 | 0 | 65.6 |

Distinct findings, with how many screens show each:

- P1 1 transition(s) animate layout props (width/height/top/left/margin) (12 screens)
- P2 1 animation/transition(s) under 50ms (non-instant but too fast to read). (12 screens)
- P2 1 border-radius value(s) off the 7-step scale (0/4/8/12/16/28/full). (12 screens)
- P2 10 to 11 distinct text colors (4 screens)
- P2 1 infinite decorative loop(s) (12 screens)
- P2 Missing landmark(s): nav. (4 screens)
- P2 3 to 17 pointer target(s) smaller than M3's comfortable 48×48px at 1440px wide (6 screens)
- P2 5 to 22 reading-copy text node(s) below 16px (or any text below 11px). (12 screens)
- P2 3 to 16 tap target(s) smaller than M3's comfortable 48×48px at 375px wide (6 screens)

These are rule findings only. UX scores come from the AI review, which reads ux/<screen>.jpg and ux/<screen>.dom.json and writes ux/ai/<screen>.json; then `node lib/merge-ux.mjs <results>/ux` scores and merges them.

## Responsive overflow

| State | 320 | 375 | 768 | 1024 | 1440 |
|---|---|---|---|---|---|
| empty | ok, 1678 px | ok, 1489 px | ok, 1060 px | ok, 1060 px | ok, 1060 px |
| form-errors | ok, 2423 px | ok, 2192 px | ok, 1710 px | ok, 1710 px | ok, 1710 px |
| loans | **+42 px wide**, 2433 px | ok, 2252 px | ok, 1925 px | ok, 1925 px | ok, 1925 px |
| plans | **+42 px wide**, 5624 px | ok, 5113 px | ok, 3910 px | ok, 3910 px | ok, 3910 px |
| payoff | **+42 px wide**, 4683 px | ok, 4189 px | ok, 3284 px | ok, 3284 px | ok, 3284 px |
| records | **+42 px wide**, 2054 px | ok, 1817 px | ok, 1441 px | ok, 1441 px | ok, 1441 px |

4 of 30 pages scroll sideways. Each cell: horizontal overflow (document scrollWidth beyond the viewport), then page height. Full-page screenshots are in responsive/.

## INP probe

| CPU | Loans | Runs | tabToPlans | typeIncome5 | tabToPayoff | dragSlider30 | typeExtra3 | tabToRecords | tabToLoans |
|---|---|---|---|---|---|---|---|---|---|
| 1x | 8 | 2 | 48 (61) | 16 (45) | 16 (28) | 24 (261) | 24 (38) | 24 (16) | 16 (16) |
| 1x | 25 | 2 | 48 (61) | 16 (60) | 24 (34) | 16 (299) | 24 (44) | 24 (15) | 16 (17) |
| 1x | 60 | 2 | 48 (59) | 16 (64) | 32 (39) | 32 (391) | 24 (54) | 16 (16) | 16 (23) |
| 4x | 8 | 2 | 72 (97) | 24 (83) | 32 (51) | 16 (341) | 16 (43) | 16 (21) | 16 (15) |
| 4x | 25 | 2 | 72 (95) | 24 (90) | 48 (63) | 24 (530) | 24 (54) | 16 (20) | 16 (22) |
| 4x | 60 | 2 | 72 (93) | 24 (90) | 64 (85) | 40 (938) | 32 (76) | 16 (22) | 32 (35) |

Each cell: the worst Event Timing interaction in ms that started inside the step, then main-thread task ms in parentheses, the higher of the runs. 0 means no interaction reached 16 ms. The page stops scrolling before every step and each field is centred before typing, so no click lands mid-scroll or on the edge of the viewport.

## What a borrower sees and when

| Scenario | First paint | Real content | Readable | LCP (in page) |
|---|---|---|---|---|
| First visit | 1468 ms | 2604 ms | 2854 ms | 2640 ms |
| Returning, eight loans | 1472 ms | 2630 ms | 2885 ms | 2672 ms |

Median of 3 cold loads per scenario, each in a fresh browser, on slow 4G and 4x CPU applied for real with devtools throttling, at 412x823 and DPR 1.75; ms from navigation start. First paint is Paint Timing's first-paint, the skeleton here. Real content is the first frame with `main h1` and no skeleton, readable the first frame with the first `.rise` block fully faded in. FCP and the other marks are in readable.json.

Lighthouse's simulated LCP sees only the skeleton for this app (752 ms on the empty mobile page in this run), so the Scoreboard's LCP is not when a borrower can read anything: the Readable column is.

## Site tools

| Tool | Result |
|---|---|
| header-check | score 30: 3 good, 1 warnings, 6 missing |
| meta-validate | score 60: 9 good, 4 warnings, 2 missing |
| structured-data | 0 schemas, 0 errors, 0 warnings |
| sitemap-validate | not found (Sitemap not found at http://localhost:3100/sitemap.xml. HTTP 404) |
| redirect-check | 0 redirects, final status 200: No redirects detected. URL resolves directly. |
| broken-links | 11 links, 0 broken, 0 redirects, 0 errors, 0 timeouts |
| webmcp-check | AI readiness 0 |
