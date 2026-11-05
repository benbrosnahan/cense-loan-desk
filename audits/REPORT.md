# Cense Loan Desk audit, 2026-11-02

Loan Desk does well on the standard performance and accessibility scores. Lighthouse gives it 99 to 100 on every page load and measures a layout shift of 0 in every run, axe finds no WCAG violations, and a full journey on the live site makes no request to any other site. Where the money engine was checked against the regulations, most of it is right. RAP matches a line-by-line trace of the rule on 20,000 portfolios, and the fixed plans match the textbook amortization formula on all 552 cases tested, apart from those where the $50 minimum payment should apply.

The problems are in what those scores cannot see. This audit filed **109 issues: 6 P0, 24 P1, 39 P2 and 40 P3**. Each one was confirmed by at least one independent reviewer, and 84 are estimated at under an hour's work.

- **Typical borrowers see some wrong figures and dates (6 P0).**
  - Plan comparisons count a forgiven balance as money paid, so the recommendation can be the more expensive plan ([MONEY-01](issues/MONEY-01.md)).
  - Graduated's first payment is up to 56% too low ([MONEY-04](issues/MONEY-04.md)).
  - Payoff runs every plan as one flat payment, so Graduated's 10-year plan never ends ([MONEY-06](issues/MONEY-06.md)).
  - A blank income leaves IBR and RAP, which could cost $0 or $10, out of the recommendation ([MONEY-08](issues/MONEY-08.md)).
  - The income field asks for gross pay where the rules use adjusted gross income ([SCOPE-03](issues/SCOPE-03.md)).
  - Every repayment term restarts this month, so a borrower four years into Standard sees $372 instead of their $555 bill ([SCOPE-06](issues/SCOPE-06.md)).
- **Some groups of borrowers get answers that do not apply to them (12 P1).** These include:
  - married joint filers, borrowers in default, and part-time public-service workers
  - FFEL, Perkins and consolidation loans
  - households larger than 8, and loans from before July 2014
  - balances under about $4,400, and anyone with qualifying payments already made
  - public-service borrowers comparing totals that never price the 120-payment path
  - IBR borrowers whose payment is below their interest, loans at mixed rates, and older loans still eligible for PAYE or ICR
- **Inputs are misread (3 P1).** A typed $0 income counts as blank. A pasted decimal multiplies income by 100. A short date such as 09/15/26 becomes the year 26.
- **Data can be lost or left behind, and screens can go stale, without a word (6 P1).**
  - Typing over the example loans and then adding one deletes what was typed.
  - A second tab overwrites the first.
  - Blocked storage still says "Saved".
  - "Clear my data" leaves data behind for the next person on that browser.
  - There is no backup to restore from.
  - With browser translation on, the app shows stale figures or crashes.
- **AI assistants and other crawlers that read raw HTML see an empty page (1 P1).** The HTML has no body text until JavaScript runs, which accounts for 18 of the 56 points missing from a GEO score of 44 of 100. The server sends 0 of the 236 words a borrower reads, and there is no structured data.
- **Two WCAG failures sit in the core flow (2 P1).** The page scrolls sideways below 361 px wide. Desktop screen readers likely never announce the save and Undo messages.

**What to do first.** Work through [ROADMAP.md](ROADMAP.md) in order. Priority 1 is four small changes to the income answer and one to Payoff, which stop the lowest-income borrowers being steered to a bill they do not have to pay. Each issue's file names the code to change, and its test tells you when the fix works. For 29 of the 30 P0 and P1 issues, [`fixes/`](fixes/) also has a patch that was proven on a copy of the repo and checked by an independent reviewer: 26 pass the issue's test, and 3 are first steps. Read the issue's "Before applying" row first, because some patches make a product call, such as MONEY-01's assumed 22% tax on a forgiven balance.

**How to keep it fixed.** The [audit kit](README.md) in this folder re-runs the scans and tests behind this report:
- `npm test` runs 183 Playwright tests, 108 of them for open issues. Each open issue that has a test is marked as expected to fail, so the suite passes today, and that test reports when a fix lands.
- `npm run audit` re-runs every scan and checks the budgets.
- CI runs the tests on every pull request, and a failing test fails the check. It also runs most scans once and reports their budgets without failing the check.

## Scoreboard

Measured with this kit on a local production build of `0fa60b6` on 2026-11-04 ([`results/2026-11-04`](results/2026-11-04/SUMMARY.md), median of 3 runs per Lighthouse page), and on the live site on 2026-11-02 ([`results/2026-11-02-live`](results/2026-11-02-live/SUMMARY.md)). Run `npm run audit` to measure them again.

| Page | Perf | A11y | BP | SEO | LCP | FCP | CLS |
|---|---|---|---|---|---|---|---|
| First visit, phone | 100 | 100 | 100 | 100 | 0.75 s | 0.75 s | 0 |
| First visit, desktop | 100 | 100 | 100 | 100 | 0.20 s | 0.20 s | 0 |
| Returning with 8 loans, phone | 100 | 100 | 100 | 100 | 0.75 s | 0.75 s | 0 |
| Returning with 8 loans, desktop | 100 | 100 | 100 | 100 | 0.20 s | 0.20 s | 0 |

Lighthouse cannot see the loading gate, the crawler's view or the layout at 320 px on this app, so these are the numbers to watch:

| Measure | Now | Budget or target |
|---|---|---|
| Real content readable, first visit, slow 4G and 4x CPU | 2.85 s | ceiling 3.5 s, target 1.6 s |
| Real content readable, returning | 2.89 s | – |
| Slowest interaction in the user flow (INP), phone and desktop | 79 ms and 50 ms | 200 ms |
| Slowest interaction at 8, 25, 60 loans, 1x CPU | 48 ms | 200 ms |
| Slowest interaction at 8, 25, 60 loans, 4x CPU | 72 ms | 200 ms |
| First-load JavaScript, route / | 124.6 kB | 130 kB |
| Screens that scroll sideways | 4 of 30 screen and width pairs, at 320 px, by 42 px | 0 |
| Security, live | 71 of 100 (headers 27) | floor 71, target 90 |
| GEO (AI-search readiness), live | 44 of 100 | floor 44, target 80 |
| Words in the server HTML, live | 0 of the 236 a borrower reads | all of them |
| Design heuristics (Material 3 conventions) | 62 to 66 of 100 across 6 screens | watch for change |

Measured by the audit's own probes on 2026-11-02:

| Measure | Result |
|---|---|
| WCAG rules axe can check | 0 violations in 164 runs |
| Actions that keep keyboard focus | 18 of 37 (the other 19 drop focus to the page) |
| Text field outlines against white | 1.48:1, where 3:1 is needed |
| RAP against a line-by-line trace of the rule | 0 mismatches on 20,000 portfolios |
| Fixed plans against the amortization formula | 0 mismatches on 552 cases, outside the $50 minimum payment |
| IBR forgiven balance when the payment is below the interest | overstated by 32% to 59% on 9 worked cases |
| "Least overall" reason shown when it is false | 4,530 of 15,066 profiles (30%) |
| `verify.mjs` mutation score | 48.1% (273 of 568 mutants caught) |
| Requests to other sites in a full live journey | 0 of 14 |

## Issues

109 issues, merged from 192 verified findings: 6 P0, 24 P1, 39 P2, 40 P3. Each ID links to its full record: what was measured, how to reproduce it, the fix, its test and the verification behind it.

| Severity | Means |
|---|---|
| P0 | A typical borrower in the main flow sees a wrong figure, date or eligibility answer, or loses data without being told. |
| P1 | The same harm for a recognizable group or an uncommon setup; a WCAG 2.2 A/AA failure in a core flow; content invisible to crawlers; or a key journey that dead-ends. |
| P2 | A real but bounded defect, a misleading statement with no wrong number, or a meaningful missed opportunity. |
| P3 | Polish, hardening or maintainability. |

Effort: S under an hour, M up to a day, L more. "Test" means a ratchet test in `tests/` that fails today and starts passing when the issue is fixed. "Patch" refers to [`fixes/`](fixes/). "validated" means the patch was applied to a copy of the repo, built, and passed the issue's test with the rest of the suite unchanged. "partial" means a first step that passes the same checks but leaves part of the test failing. An independent reviewer then checked each patch. "failed review" means the reviewer still found a defect after a rework, so no patch is included.

### Money figures and eligibility

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [MONEY-01](issues/MONEY-01.md) | P0 | M | Least-total pick compares unlike totals | yes | validated |
| [MONEY-04](issues/MONEY-04.md) | P0 | M | Graduated breaks the 3x cap and hides its peak | yes | validated |
| [MONEY-06](issues/MONEY-06.md) | P0 | M | Payoff ignores the chosen plan's schedule and forgiveness | yes | validated |
| [MONEY-08](issues/MONEY-08.md) | P0 | S | Unpriced plans lose to priced ones when income is blank | yes | validated |
| [MONEY-02](issues/MONEY-02.md) | P1 | M | PSLF path not priced | yes | validated |
| [MONEY-03](issues/MONEY-03.md) | P1 | S | $50 minimum payment missing | yes | validated |
| [MONEY-05](issues/MONEY-05.md) | P1 | S | IBR compounds unpaid interest | yes | validated |
| [MONEY-07](issues/MONEY-07.md) | P1 | M | Plans and Payoff price multi-rate portfolios differently | yes | validated |
| [MONEY-09](issues/MONEY-09.md) | P1 | S | $0 income cannot be entered | yes | validated |
| [MONEY-11](issues/MONEY-11.md) | P1 | S | Dollar fields drop the decimal point | yes | validated |
| [MONEY-12](issues/MONEY-12.md) | P1 | S | Two-digit year saves as year 0026 and flips eligibility | yes | validated |
| [MONEY-13](issues/MONEY-13.md) | P1 | M | Pre-2014 IBR borrowers priced as new borrowers | yes | validated |
| [MONEY-21](issues/MONEY-21.md) | P1 | S | Households over 8 priced as 8 | yes | validated |
| [MONEY-23](issues/MONEY-23.md) | P1 | S | Plan count omits PAYE and ICR | yes | validated |
| [MONEY-10](issues/MONEY-10.md) | P2 | S | $0 IBR payment sends Payoff into a pick-a-plan loop | yes | – |
| [MONEY-14](issues/MONEY-14.md) | P2 | S | IBR $5 and $10 rounding rule missing | yes | – |
| [MONEY-15](issues/MONEY-15.md) | P2 | S | Extended opens at exactly $30,000 | yes | – |
| [MONEY-16](issues/MONEY-16.md) | P2 | M | Card and reason copy contradicts the numbers | yes | – |
| [MONEY-17](issues/MONEY-17.md) | P2 | S | Rate table goes stale in July 2027 | yes | – |
| [MONEY-18](issues/MONEY-18.md) | P2 | M | Two different "interest added so far" figures | yes | – |
| [MONEY-24](issues/MONEY-24.md) | P2 | S | SAVE, PAYE and ICR 2028 transition not mentioned | yes | – |
| [MONEY-19](issues/MONEY-19.md) | P3 | S | Records diff rounds changes away | yes | – |
| [MONEY-20](issues/MONEY-20.md) | P3 | S | Payoff start month off by one | yes | – |
| [MONEY-22](issues/MONEY-22.md) | P3 | S | 0% rate rejected | yes | – |

### Borrowers the model does not fit yet

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [SCOPE-03](issues/SCOPE-03.md) | P0 | S | Income asked as gross pay, plans priced on AGI | yes | validated |
| [SCOPE-06](issues/SCOPE-06.md) | P0 | M | Repayment clock assumed to start this month | yes | validated |
| [SCOPE-01](issues/SCOPE-01.md) | P1 | S | PSLF promised without the full-time rule | yes | validated |
| [SCOPE-02](issues/SCOPE-02.md) | P1 | M | Married borrowers cannot be priced correctly | yes | validated |
| [SCOPE-04](issues/SCOPE-04.md) | P1 | S | FFEL, Perkins, private and consolidation loans entered as Direct types | yes | partial |
| [SCOPE-05](issues/SCOPE-05.md) | P1 | M | Defaulted loans shown plans and dates that do not apply | yes | validated |
| [SCOPE-07](issues/SCOPE-07.md) | P1 | M | Payments already credited toward forgiveness ignored | yes | partial |

### Data safety and resilience

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [RES-01](issues/RES-01.md) | P1 | S | Editing example loans then adding one deletes the edits | yes | validated |
| [RES-02](issues/RES-02.md) | P1 | S | A second open tab silently overwrites the first | yes | failed review |
| [RES-03](issues/RES-03.md) | P1 | S | Failed save still says Saved | yes | validated |
| [RES-04](issues/RES-04.md) | P1 | S | "Clear my data" leaves income and records behind | yes | validated |
| [RES-05](issues/RES-05.md) | P1 | M | No backup or restore: the browser holds the only copy | yes | validated |
| [RES-12](issues/RES-12.md) | P1 | M | Machine-translated pages show stale figures and crash | yes | validated |
| [RES-06](issues/RES-06.md) | P2 | S | "On your device" is really "in this browser" | yes | – |
| [RES-07](issues/RES-07.md) | P2 | M | Malformed storage locks the borrower out | yes | – |
| [RES-08](issues/RES-08.md) | P2 | S | Spreadsheet download fails silently | yes | – |
| [RES-09](issues/RES-09.md) | P2 | S | Export file name uses the UTC date | yes | – |
| [RES-10](issues/RES-10.md) | P2 | S | Undo holds only one action | yes | – |
| [RES-11](issues/RES-11.md) | P2 | M | Half-typed loan form lost without warning | yes | – |
| [RES-13](issues/RES-13.md) | P3 | S | Blank pulsing skeleton when JavaScript fails | yes | – |
| [RES-14](issues/RES-14.md) | P3 | S | Implausible values accepted silently | yes | – |
| [RES-15](issues/RES-15.md) | P3 | S | Long unbroken nickname breaks layout and hides Undo | yes | – |

### UX and UI

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [UX-01](issues/UX-01.md) | P2 | S | Choosing a plan reads as enrolling | yes | – |
| [UX-02](issues/UX-02.md) | P2 | S | Records says "Nothing changed" when nobody checked | yes | – |
| [UX-03](issues/UX-03.md) | P2 | S | Next-step cards land mid-section | yes | – |
| [UX-04](issues/UX-04.md) | P2 | S | Answering a question changes the pick off screen | yes | – |
| [UX-05](issues/UX-05.md) | P2 | M | Plans cannot be compared on one screen | yes | – |
| [UX-06](issues/UX-06.md) | P2 | S | One-way consolidation warning is buried | yes | – |
| [UX-07](issues/UX-07.md) | P2 | S | Hide amounts leaves figures readable | yes | – |
| [UX-08](issues/UX-08.md) | P2 | S | Example data can pass for real | yes | – |
| [UX-10](issues/UX-10.md) | P2 | S | Sections are not URLs: Back exits, reload resets | yes | – |
| [UX-11](issues/UX-11.md) | P2 | M | Saved records cannot be opened or deleted | yes | – |
| [UX-12](issues/UX-12.md) | P2 | S | Servicer instruction for extra payments is buried | yes | – |
| [UX-13](issues/UX-13.md) | P2 | S | Late-fee notice reads as reassurance | yes | – |
| [UX-20](issues/UX-20.md) | P2 | S | No sources or "rules checked" date on screen | yes | – |
| [UX-09](issues/UX-09.md) | P3 | S | "Print one page" prints two | yes | – |
| [UX-16](issues/UX-16.md) | P3 | S | Form messages point the wrong way | yes | – |
| [UX-17](issues/UX-17.md) | P3 | M | One thing has several names across tabs | yes | – |
| [UX-18](issues/UX-18.md) | P3 | S | Payoff order rows repeat stock sentences | yes | – |
| [UX-19](issues/UX-19.md) | P3 | S | Adding several loans costs avoidable taps | yes | – |
| [UX-21](issues/UX-21.md) | P3 | S | Loan rows repeat the type and hide the servicer on phones | yes | – |

### Accessibility

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [A11Y-01](issues/A11Y-01.md) | P1 | S | Header forces sideways scrolling at 320px | yes | validated |
| [A11Y-02](issues/A11Y-02.md) | P1 | S | Toast status region is not announced | yes | validated |
| [A11Y-03](issues/A11Y-03.md) | P2 | M | Focus is lost to the page after common actions | yes | – |
| [A11Y-04](issues/A11Y-04.md) | P2 | S | Undo expires at 7 seconds and never pauses | yes | – |
| [A11Y-06](issues/A11Y-06.md) | P2 | S | Radio choices ignore arrow keys | yes | – |
| [A11Y-07](issues/A11Y-07.md) | P2 | S | Input borders below 3:1 | yes | – |
| [A11Y-08](issues/A11Y-08.md) | P2 | S | Slider track below 3:1 | yes | – |
| [A11Y-10](issues/A11Y-10.md) | P2 | S | Two text colours below 4.5:1 | yes | – |
| [A11Y-12](issues/A11Y-12.md) | P2 | S | Forced colors hides the selected state | yes | – |
| [A11Y-14](issues/A11Y-14.md) | P2 | S | Field names, units and required state | yes | – |
| [A11Y-05](issues/A11Y-05.md) | P3 | S | Section change is not announced | yes | – |
| [A11Y-13](issues/A11Y-13.md) | P3 | S | Toast covers focus and swallows taps | yes | – |
| [A11Y-15](issues/A11Y-15.md) | P3 | S | Repeated controls share one name | yes | – |
| [A11Y-16](issues/A11Y-16.md) | P3 | S | aria-controls points at a missing id | yes | – |
| [A11Y-17](issues/A11Y-17.md) | P3 | S | Heading outline and H1 | yes | – |
| [A11Y-18](issues/A11Y-18.md) | P3 | S | Chart tooltip ignores Escape | yes | – |

### SEO and findability

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [SEO-01](issues/SEO-01.md) | P1 | M | Server HTML is empty: prerender the first-run screen | yes | partial |
| [SEO-02](issues/SEO-02.md) | P2 | S | Share card has no image or URL | yes | – |
| [SEO-04](issues/SEO-04.md) | P2 | S | Cense site nav links the superseded tools | – | – |
| [SEO-05](issues/SEO-05.md) | P3 | S | No canonical, structured data or crawler policy | yes | – |
| [SEO-06](issues/SEO-06.md) | P3 | S | SVG-only favicon, no touch icon | yes | – |
| [SEO-07](issues/SEO-07.md) | P3 | S | Default 404 is a dead end | yes | – |
| [SEO-08](issues/SEO-08.md) | P3 | S | vercel.app host: decide the domain now | yes | – |
| [SEO-09](issues/SEO-09.md) | P3 | S | Federal tool link is stale | yes | – |

### Agentic friendliness

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [AGENT-01](issues/AGENT-01.md) | P3 | M | Read-only WebMCP calculator tools (optional) | yes | – |

### Performance

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [PERF-01](issues/PERF-01.md) | P3 | S | Display font ships unused weights | yes | – |
| [PERF-02](issues/PERF-02.md) | P3 | S | Slider rebuilds Intl formatters and doubles simulations | yes | – |
| [PERF-03](issues/PERF-03.md) | P3 | S | Snapshot fade-in delay grows with the list | yes | – |

### Security, privacy and best practices

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [SEC-01](issues/SEC-01.md) | P2 | S | Privacy promise is not enforced by a CSP | yes | – |
| [SEC-02](issues/SEC-02.md) | P3 | M | Next 14 is end of life: plan the exit, static export first | yes | – |
| [SEC-03](issues/SEC-03.md) | P3 | S | Baseline security headers missing | yes | – |
| [SEC-04](issues/SEC-04.md) | P3 | S | xlsx frozen on npm | yes | – |
| [SEC-05](issues/SEC-05.md) | P3 | S | Two lockfile updates clear production advisories | yes | – |

### Testing and maintainability

| ID | Sev | Effort | Issue | Test | Patch |
|---|---|---|---|---|---|
| [DX-01](issues/DX-01.md) | P2 | M | No CI, no npm test, no browser regression suite | yes | – |
| [DX-02](issues/DX-02.md) | P2 | M | verify.mjs misses bugs and can pass on stale output | yes | – |
| [DX-03](issues/DX-03.md) | P3 | S | README drift | yes | – |
| [DX-04](issues/DX-04.md) | P3 | S | slate-* means green; colour literals outside the config | yes | – |
| [DX-05](issues/DX-05.md) | P3 | S | Dead code and needless exports | yes | – |
| [DX-06](issues/DX-06.md) | P3 | S | framer-motion installed but unused | yes | – |
| [DX-07](issues/DX-07.md) | P3 | S | Formatters and sums written more than once | yes | – |
| [DX-08](issues/DX-08.md) | P3 | S | ESLint 8 end of life and weak rules | yes | – |
| [DX-09](issues/DX-09.md) | P3 | S | noUncheckedIndexedAccess off | yes | – |
| [DX-10](issues/DX-10.md) | P3 | S | No Node version declared | yes | – |
| [DX-11](issues/DX-11.md) | P3 | S | No license field in package.json | yes | – |

Not filed after re-checks: UX-14 (Key figures do not say what they cover); UX-15 (Next step after choosing a plan is far away); A11Y-09 (Loan names and rates truncated); A11Y-11 (Landmarks nested in main; skip link inside main); SEO-03 (Title and description miss search intent). Independent tie-breakers could not confirm them.

## What is already good

Each point below was measured, and most are now guarded by a test or a budget so they stay true.

- **Fast where it counts.** Lighthouse scores 99 to 100 on every load, local and live, mobile and desktop. Lighthouse measures no layout shift, and long tasks during load are rare (one of 53 ms in one run at 4x CPU slowdown). First-load JavaScript is 125 kB. The 413 KB spreadsheet library is genuinely lazy: it is absent until Download is clicked, and a first export still finishes in about 1.4 s on slow 4G. Warm-cache LCP is 680 to 730 ms on slow 4G with a 4x slower CPU. 400 section switches add no DOM nodes or listeners (347 nodes before and after), and heap growth levels off at about 1.6 KB per switch.
- **Private in fact, not just in copy.** A full journey on the live site makes 0 requests to anyone but its own origin. There are no trackers in the bundle, the outbound links leak nothing, the production console is silent in all 12 state and viewport combinations, and the repo and its history contain no secrets. Stored script in a loan nickname does not run, and spreadsheet formula injection does not work.
- **The money engine is mostly right, and checkably so.** The RAP engine matches a line-by-line trace of the regulation on 20,000 random portfolios. Fixed plans match the closed-form amortization in all 552 cases tested, apart from those where the $50 minimum payment should apply (see MONEY-03). The payoff engine matches an independent pro-rata model on 12,000 runs. The top pick was a real, open, priced plan in all 60,000 portfolios tried. The July 1, 2026 cutoff is exact and holds in six time zones, and date math holds over 5,768 cases. The spreadsheet is exact to the cent, and `verify.mjs` passes all 180 assertions in about a second.
- **Accessible beyond the score.** axe found 0 WCAG violations in 164 runs, across every state and width with every disclosure open. All 214 Tab stops show a visible focus ring, with no traps and a logical order. The whole journey completes by keyboard alone in 67 key presses, 200% zoom is clean, reduced motion is fully honoured, and the payoff chart has a real text alternative.
- **Built for a phone.** Every input computes to 16 px at 375 px wide, so iOS will not zoom on focus. Targets are generous, eight loans in a row stay quick to enter, and 200 loans stay usable.
- **Robust storage.** Blocked storage does not crash the app, and invalid JSON falls back to defaults. An idle background tab never writes. Undo restores exactly what was removed and never overwrites newer edits within a tab. 500 saved records use 16% of the browser's storage quota.
- **Agent-ready markup.** A scripted agent that may only use the accessibility tree (roles and names, no CSS selectors) completed the whole task. All 504 controls have a name, and results are written in text, not only shown in charts.
- **Clean code.** TypeScript is strict and nearly clean. Lint passes, and strict accessibility lint (jsx-a11y) finds nothing. A fresh clone installs, lints, verifies and builds as the README says.

## What this audit did not cover

These gaps are real, so treat the matching areas as unverified rather than fine.

- **No real screen reader.** No NVDA, JAWS, VoiceOver or TalkBack was run. Exposure was read from Chromium's accessibility tree, and announcements were inferred from DOM changes.
- **One browser engine.** Everything ran in headless Chromium, with phone emulation for mobile. Safari, iOS, Firefox and real Android devices were not run, apart from one WebKit check of the proposed CSP. So the native date picker, Safari's 7-day storage eviction, in-app browsers (Gmail, Instagram), real downloads on a phone, and printing from a phone are documented from sources, not observed.
- **No real borrowers.** There was no usability test. Comprehension claims rest on the text, the numbers and the heuristics.
- **No real printers or spreadsheet apps.** Page counts come from Chrome's PDF output. Exports were parsed with SheetJS, openpyxl and Quick Look, not opened in Excel or Google Sheets.
- **Machine translation was simulated.** Chrome, Safari and Edge translators cannot run headless, so the DOM changes they make were reproduced in script (RES-12).
- **Regulation, not servicers.** Money findings cite 34 CFR and show a concrete wrong output. No servicer's billing was checked, and none of this is legal advice. Populations the app does not model (FFEL and Perkins rules, consolidation schedules, Alaska and Hawaii poverty lines, ICR) were checked only where the app shows them a figure.
- **Search engines and AI answer engines.** No Search Console, Bing or real LLM citation data. The GEO score is a checklist, not proof of citation.
- **Hosting.** The proposed headers, `vercel.json` and static export were proven under `next start` and a local static server, not on a Vercel deploy. The live site received ordinary GET and HEAD requests and Lighthouse loads only.
- **Timing noise.** Probes shared one machine with other audit work, so millisecond figures from probes are marked noisy. Performance claims rest on the Lighthouse lab runs and repeated medians.

## How this audit was done

The audit ran PerfMaster's engines locally against a production build of this repo (`next build`, then `next start`, at commit `0fa60b6`). It also checked https://cense-loan-desk.vercel.app read-only, using ordinary GET and HEAD requests and Lighthouse loads, with no form posts and no load tests. The live build matched the checkout, so findings apply to the deployment.

1. **Engines.**
   - Lighthouse with PerfMaster's mobile and desktop lab settings, three runs per page, covering a first visit, a returning borrower with eight loans, and a full user flow.
   - The security scan, the GEO (AI-search readiness) scan, and the UX scanner with the Material 3 design audit, run on six app states at two form factors.
   - PerfMaster's site tools: headers, meta, structured data, sitemap, redirects, links and WebMCP.
   - Screenshots at 320 to 1440 px wide, and an interaction-latency probe with real input at 8, 25 and 60 loans.
2. **Audit leads.** Nine specialists started from that evidence, then measured what the scores miss with their own browser probes and a fuzz harness for the money logic. They covered:
   - performance
   - UX/UI
   - accessibility
   - SEO
   - best practices and security
   - agentic friendliness
   - resilience
   - money logic
   - code quality

   Every finding had to carry a measured value, the required value, a way to reproduce it, the code location, who it hurts and a fix. A completeness critic then asked what nobody had checked, and eight gap audits followed. They covered married borrowers, defaulted loans, loan programs the form cannot represent, the repayment clock, machine translation, the plan universe, PSLF's full-time rule, and per-browser storage.
3. **Adversarial verification.** Each finding went to independent skeptics told to refute it, who re-measured from scratch. Each finding the leads filed as P0 or P1 got three skeptics (reproduce, standards and impact lenses), each filed as P2 got two, and each filed as P3 got one. When skeptics split, a tie-breaker decided, and six of nine split findings were dropped.
4. **Consolidation and calibration.** The 192 verified findings merged into 114 issues, because several defects were filed by up to four leads. Five issues fell away with the dropped findings, leaving 109. Severity was then recalibrated under the stricter rubric above by independent judges, two per proposed P0 and one per P1. This is why several of the leads' P0s are P1 here.
5. **Tests.** Each testable issue got a Playwright test that asserts the correct behaviour and is marked as a known failure. Each test was written to accept any reasonable fix, not only the one proposed. Run as ordinary tests, every one of them fails today at an assertion that states the defect, never on a timeout or a missing element. The whole suite then ran three times with no unexpected or flaky results.
6. **Fixes.** Each issue's record proposes a fix. For the 30 P0 and P1 issues, fix agents then wrote patches, each on a private copy of the repo at `0fa60b6`. A separate harness re-proved every patch from scratch on a clean copy: the type check, lint, `verify.mjs` and a production build, then the full suite, then the issue's own test run as an ordinary test. A patch counts as validated when that test passes and nothing else in the suite changes, and as partial when every check passes but part of the test still fails. Independent reviewers then tried to break each patch, re-measuring it against the regulations, the served page and a machine-translated page. They rejected six patches, two of them more than once, and found gaps in three more. Each of those was reworked, proven again and reviewed again, and the smaller fixes they asked for were applied and re-proven. All but one then passed. RES-02 still lost data in one case after two reworks, so its patch is not included, and its issue page says what the attempts showed. Their remaining notes are in each issue's "Before applying" row. The result is 29 patches in [`fixes/`](fixes/): 26 validated and 3 partial. None is applied to this repo. Each was proven on its own against `0fa60b6`, and 92 of the 406 pairs change the same lines, so each issue's "Overlaps" row names the patches that will need merging by hand. The six folders in `fixes/` hold draft material for other issues, which was not proven.

The kit pins Lighthouse 13.6, while PerfMaster's hosted lab ran 13.1 when this audit started. For this app, 13.6 simulates mobile LCP at about 752 ms, before the real content appears, where 13.1 reported 2,253 ms. Real throttled loads show readable content at about 2.6 to 2.9 s, so the kit measures that directly in its `readable` step instead of trusting either simulation.

