# MONEY-15: Extended opens at exactly $30,000

**P2** · effort S · Money figures and eligibility

Extended shows as open when the loans total exactly $30,000, though the rule and the app's own card text require more than $30,000, so those borrowers are offered a plan they cannot get.

| | |
|---|---|
| Who it hurts | A borrower whose Direct Loans total exactly $30,000 is shown Extended as open, with a monthly figure and a 'Use Extended as my plan' button, for a plan the regulation says they cannot get, and if they pick it the summary and Payoff date are built on it. |
| Standard | 34 CFR 685.208(b)(4)(i) |
| Where | Repayment plans tab: the 'All 5 plans open to you' heading, the Extended card and its 'Use Extended as my plan' button; then the summary line and the Payoff tab if the borrower picks Extended. Any viewport, local build and live site. Pre-July-2026 portfolios whose balances total exactly $30,000.00, as one loan, whole-dollar splits, or multi-loan totals with cents whose floating-point sum lands just above 30000. |
| Code | [`src/lib/calc.ts:323`](../../src/lib/calc.ts#L323), [`src/lib/calc.ts:334`](../../src/lib/calc.ts#L334), [`src/lib/calc.ts:29`](../../src/lib/calc.ts#L29), [`src/data/plans.ts:69`](../../src/data/plans.ts#L69), [`src/data/plans.ts:129`](../../src/data/plans.ts#L129), [`src/data/plans.ts:140`](../../src/data/plans.ts#L140), [`verify.mjs:520`](../../verify.mjs#L520) |
| Test | `money-edges.spec.mjs`: "MONEY-15 Extended is closed at exactly $30,000 however the cents are split across loans, and open from $30,000.01" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

One loan of $30,000.00 at 6.53%: heading 'All 5 plans open to you', '5 of 6 federal plans', Extended card $203 a month and $60,937 over 25 yr with 'Use Extended as my plan', while the same card's detail says 'Requires more than $30,000 in Direct Loans' and 'Only available above $30,000 in Direct Loans'. $29,999.99: 'All 4 plans open to you', Extended closed with that reason. $30,000.01: open, which is correct. $15,000 + $15,000 and three $10,000 loans behave like $30,000. Through the real form with the 2022-23 shortcut (rate filled at 4.99%), typing 30000 shows Extended open at $175. If picked, the summary reads '$203 a month on Extended' and Payoff 'Debt free in November 2051'. The live bundle has the same gate, "extended"===o&&t<3e4. Floating point: totalBalance (calc.ts:28-30) is an unrounded sum, so portfolios that total exactly $30,000.00 on paper can land either side: [10000.10, 9999.95, 9999.95] sums to 30000.000000000004 and shows Extended open, while [18565.28, 5344.28, 6090.44] sums to 29999.999999999996 and shows it closed, though both headers read 'You owe $30,000'. In a fuzz of 36,032 one-to-eight-loan portfolios totalling exactly $30,000.00, shipped code leaves 31,083 open, a plain <= leaves 4,889 open, and a whole-cents comparison leaves 0. Reach: across 66,528 inputs at exactly $30,000 (rate, goal, employment, income, household, loan kind), Extended was the top pick 0 times and carried a lowest-payment or least-interest badge 0 times. verify.mjs:519-523 tests $29,999 and $30,001 only.

## Required

34 CFR 685.208(b)(4)(i): Extended is for 'a new borrower with more than $30,000 in outstanding Direct Loans'. Closed at $30,000.00, open from $30,000.01, with the same answer however the same cents are split across loans.

## Reproduce

1. Open http://localhost:3100 with no saved data.
2. Your loans > Add a loan: tap 2022-23, put 30000 in 'What you owe on it today', type 6.53 over the suggested 4.99 in 'Interest rate', then Save loan.
3. Open Repayment plans. The heading reads 'All 5 plans open to you' and the Extended card shows $203 a month and $60,937 over 25 yr ($175 a month if you kept 4.99%). Click 'How this plan works' on Extended: it says 'Requires more than $30,000 in Direct Loans'.
4. Edit the balance to 29999.99: the heading reads 'All 4 plans open to you' and Extended moves under 'plans not open to you'. Edit it to 30000.01: open, which is correct.
5. Floating-point case: replace the loan with three loans of 10000.10, 9999.95 and 9999.95; the header reads 'You owe $30,000' and Extended is open.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-15"`.

## Fix

src/lib/calc.ts:323, compare whole cents so a floating-point sum cannot land on the wrong side of the line:

// 34 CFR 685.208(b)(4)(i): more than $30,000. totalBalance is an unrounded float sum.
if (id === "extended" && Math.round(balance * 100) <= EXTENDED_MIN_BALANCE * 100) {

At src/data/plans.ts:69 change the comment's source from 685.208(e), which no longer exists, to 34 CFR 685.208(b)(4)(i). Add the exact-point tests after verify.mjs:523 (lines 520-521 are two separate run() calls, not a list). Tested on scratch builds: one loan and every split of $30,000.00 close, $30,000.01 stays open (including as a split), and verify.mjs passes 180 of 180.

## Severity

Only borrowers whose pre-July-2026 Direct Loans total exactly $30,000.00 are affected, every time they open Repayment plans. Extended is never the top pick or badged at that total (0 of 66,528 inputs), so the wrong eligibility answer is real but bounded to an extra card, a plan count off by one and a 'Use Extended as my plan' button.

## Verification

Confirmed by 5 of 5 skeptics across the three filings (standards and reproduce on two, a P3 review on the third); all five replaced the filed fix with a whole-cents comparison.

<details><summary>Dissent and notes</summary>

Severity: ux-extended-boundary was filed and confirmed at P3 (one decimal total, never the pick or badged, the borrower has to choose it); the money and resilience filings and their four skeptics held P2. Every skeptic noted that the audit brief's P0 line literally covers any wrong eligibility answer and called the downgrade a judgement. Fix: all five skeptics replaced the filed plain <= because it leaves multi-loan totals with cents open; one wrote the comparison as Math.round(balance * 100) / 100 <= EXTENDED_MIN_BALANCE, which behaves the same.

Fix choice: four of five skeptics wrote the integer-cents form used here; it compares integers, so it needs no reasoning about float rounding. How often a plain <= misses: 6.1% to 25.4% of random cent splits of exactly $30,000.00 across the skeptics' samples, rising with the number of loans, and never for two-loan splits. The filed figures assume 6.53%, which the filings did not state; at the form's suggested 4.99% the same balance shows $175. The resilience filing's impact quoted 'Rough answers are fine' (page.tsx:675) as inviting round balances, but that line heads the four profile questions and the balance field (LoanForm.tsx:329-332) asks for the current balance, so the quote is dropped. The test gap is only the exact point: verify.mjs:519-523 already checks $29,999 closed and $30,001 open, and verify.mjs:181 checks the constant. Ship with or before MONEY-04: on a scratch bed with the Graduated 3x-cap fix applied, Extended becomes the top pick at exactly $30,000 in 2,688 of 66,528 inputs (goal lowest payment, rates 0.5% to 5.5%), which would put this wrong answer in the headline. After the fix, $30,000.01 still shows 'You owe $30,000' with Extended open because the header rounds to whole dollars; that answer is correct. Out of scope: 685.208(b)(3) gives borrowers who entered repayment before July 1, 2006 an Extended plan with no $30,000 floor, and the app collects nothing that would identify them.

</details>

Merged from audit findings: `money-extended-30000-boundary`, `resilience-extended-exact-30000`, `ux-extended-boundary`.
