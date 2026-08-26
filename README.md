# Cense Loan Desk

Created with Claude Code.

Every federal student loan a person has, on one screen: balances, rates, which repayment
plans they actually qualify for, payoff order, and a dated record of what changed.

Combines and supersedes two earlier prototypes:
- **Loan Lab** (`../loan-lab`) — the repayment-plan quiz. Its `src/data/plans.ts` is the ancestor of this project's plan data.
- **Debt Dashboard** (`../loan-paydown`) — the avalanche/snowball engine. `src/lib/paydown.ts` is the ancestor of `src/lib/ranking.ts`.

## What it does

1. **Manual loan entry.** Servicer, type, principal, balance, rate, disbursement date, minimum payment. No aid-file import.
2. **July 1, 2026 eligibility flag.** One loan disbursed on or after that date limits the whole portfolio to RAP and Tiered Standard (34 CFR 685.210).
3. **Plan comparison.** Monthly, term, total paid, interest, forgiven amount, and PSLF status for all six plans.
4. **Payoff order.** Avalanche/snowball toggle with the honest dollar cost of choosing snowball. Kept off the main view.
5. **Snapshot history.** Dated balance/rate records with a diff, exportable as a spreadsheet.

## Sources

Every number is traced in-code. Load-bearing citations:
- 34 CFR 685.210 — choice of repayment plan, the same-plan rule, the July 2026 cutoff
- 34 CFR 685.209 — RAP base payment brackets, $10 floor, $50/dependent, matching principal, 360 payments
- 34 CFR 685.208 — Tiered Standard balance tiers
- ASPE 2026 poverty guidelines
- fsapartners.ed.gov annual Direct Loan interest rate announcements
- GAO-26-108534 — servicer accuracy findings that justify snapshot history

## Run it

```bash
npm install
npm run dev
```

Next 14 App Router + TypeScript + Tailwind + framer-motion. All client-side, localStorage only,
no backend, no accounts, no analytics.

## v2 changes (2026-08-18)

**Correctness**
- **Tiered Standard never earns PSLF credit, in any tier including the 10-year
  one.** It is omitted from the qualifying-plan list in 34 CFR 685.219(b)(28)(ii),
  which pulls only the consolidation plan out of 685.208(c). The catch-all in
  (iii) cannot reach it either: that clause benchmarks against the 10-year
  Standard plan "under § 685.208(b)", and 685.208(b)(1) is limited to borrowers
  "who have not received a Direct Loan on or after July 1, 2026" — precisely the
  opposite of who is on Tiered Standard. The populations are mutually exclusive,
  so the benchmark does not exist for these borrowers.
  The 10-year tier is the trap: its payment equals what the old Standard plan
  would have charged, so it looks equivalent. It is not, and the UI says so.
- Clause (iii) IS applied, correctly, to Graduated and Extended, where the
  borrower is eligible for the 685.208(b) Standard plan so the benchmark is real.
- Payoff timeline is derived from the borrower's selected repayment plan. With
  no plan chosen the projection is withheld rather than guessed, because the
  required payment is what sets it.

**Product**
- First run is the empty state, not seeded demo data.
- Repayment goal restored (lowest payment / least total / forgiveness / not sure).
- Employer categories: Government, Nonprofit, Private sector, Not sure.
- Top pick is listed first; every other eligible plan carries the reason it was
  not chosen so the user can disagree on the merits.
- Lowest-payment and least-interest plans are labelled.
- Secondary rules moved below the recommendation into a disclosure.
- Weighted average rate removed.
- History exports .xlsx with three sheets: what changed, snapshot timeline, full
  detail. Deletions and same-day snapshots are now distinguishable.

**Accessibility**
- Table breaks to cards at `lg`, so iPad portrait gets cards.
- All text meets WCAG 2.2 AA contrast (audited programmatically).
- Ineligible plans stay legible rather than being dimmed into unreadability.
- Skip link, `aria-expanded` disclosures, `aria-current` tabs, reduced-motion
  support, 44px primary targets.

**Privacy** — verified, not just claimed: no fetch/XHR/beacon anywhere in
source, no analytics packages, fonts self-hosted by `next/font`. Every network
request goes to our own origin.


## Verification

Two independent harnesses. Neither re-runs the app's own logic and agrees with
itself; every figure is derived a second way and compared.

```bash
node verify.mjs        # 173 assertions over the shipped calc/ranking modules
```

Covers: amortisation against the closed form `B*r / (1 - (1+r)^-n)`; the 2026
ASPE poverty table; all eleven RAP income brackets plus their boundaries;
Tiered Standard tiers; the July 1 2026 cutoff including the exact boundary date;
PSLF status for every plan at six balances; RAP and IBR monthly payments against
hand-derived figures; a month-by-month replication of the RAP interest waiver
and $50 matching principal; fixed-plan totals reconciling to payment x term;
payoff ordering with both tie-breaks; strategy comparison monotonicity; and 400
randomised portfolios checked against a dozen invariants.

The tracker workbook has its own harness in the session scratchpad (72 checks):
published rates per award year, statutory annual borrowing limits, subsidized
balance == principal, dates stored as real dates, and both ranking formulas
replicated in Python.

### Bugs these harnesses caught

- **RAP interest waiver was over-crediting principal.** When the payment fell
  below the monthly interest, the code credited the whole payment to principal.
  34 CFR 685.209(h)(4)(i) says ED simply does not *charge* the shortfall, so the
  charge is capped at the payment and the balance is unchanged before the $50
  match. The old code made RAP look better than it is.
- **Payoff allocation was arbitrary.** It spread 50% of the budget pro rata for
  no defensible reason. Now the plan's required payment is allocated pro rata by
  balance (what a servicer does absent instructions) and only the extra is
  directed at the target loan.
- **Header plan count was hardcoded** to "5 of 6" and disagreed with the Plans
  tab whenever Extended was out on the $30,000 floor. Now computed from the same
  engine.
- **Tracker dates were stored as text**, which would have flagged every loan as
  post-July-2026 (Excel orders text above any number).
- **Tracker snowball ranks tied** on two equal balances, which a normal
  portfolio has.

### Known modelling assumptions, disclosed in the UI

- Poverty guidelines are the 48 contiguous states + DC. Alaska and Hawaii are
  higher, so income-driven estimates run low there.
- Income is held flat for the whole term, matching the federal Loan Simulator.
- IBR figures assume a post-July-2014 borrower (10% / 20 years). Earlier
  borrowers get 15% / 25 years.
- The Graduated step schedule is a model; regulation caps the largest payment at
  three times the smallest but servicers set the exact steps.


## Full sweep, 2026-08-18

**316 assertions across two layers, zero failures.**

- `node verify.mjs` — 173 unit assertions (see above).
- Browser sweep — 143 assertions driven through the live app across six
  portfolio modes: empty, single loan, eight-loan undergrad, mixed-vintage
  (the 685.208(b)(8) case), $100k legacy, and hostile edges (a $37 balance, a
  0% loan, a 24.99% loan, identical twin loans, the exact 2026-07-01 boundary
  date, household of 8 with zero income). Each mode walked all four tabs
  checking displayed figures against the engine, plus persistence across
  reload, form validation, WCAG contrast and target size with every disclosure
  forced open, layout at 375 / 768 / 1024 / desktop, console, network, and both
  .xlsx exports byte-checked for a valid ZIP signature and expected sheets.

### What the sweep caught

- **"Lowest monthly payment" was badging Graduated's *starting* payment.**
  Graduated at $139 was outranking IBR at $234 on the one number a cash-strapped
  borrower acts on, except Graduated's figure climbs every two years. The badge
  now reads "Lowest starting payment", and when the cash-flow goal picks
  Graduated the recommendation says plainly that the payment steps up.
- **Three contrast failures** the earlier single-tab audit missed: the warning
  icon (white on amber-600, 3.19:1), the desktop table header (slate-500 on
  slate-50, 4.04:1), and the accent badge (4.34:1). All now clear 4.5:1.

Two apparent failures were test artifacts, not defects, and are documented here
so nobody "fixes" them later: the goal `<select>` contributes its own option
text to `innerText` (so a naive badge count reads one too many), and the skip
link measures 1px because it is `sr-only` until focused.
