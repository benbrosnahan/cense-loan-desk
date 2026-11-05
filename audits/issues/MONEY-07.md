# MONEY-07: Plans and Payoff price multi-rate portfolios differently

**P1** · effort M · Money figures and eligibility

Plans prices Standard, Extended and Tiered Standard at one blended rate while Payoff splits the payment by balance, so a borrower with loans at different rates sees two end dates and two interest totals for the same plan, with Payoff running past the legal term.

| | |
|---|---|
| Who it hurts | Graduate borrowers on Extended or Tiered Standard are shown a Payoff date months to years past the plan's legal term and thousands of dollars more interest than the Plans card, and every borrower with mixed rates sees the two tabs disagree, along with an overstated extra-payment saving and an understated snowball cost. |
| Standard | 34 CFR 685.208(b)(1)(i) and (b)(4)(i)-(ii): Standard repays in 10 years and Extended in 25, with payments 'more if necessary to repay the loan within the required time period'; 685.208(b)(8)(iii) and (c)(1)(iii) set the Tiered Standard terms; 685.209(f)(2)(ii) caps IBR at the 10-year Standard payment. |
| Where | Plans tab plan card ('How this plan works': Interest you would pay, How long) against the Payoff tab (Debt free in, 'That is N yr N mo', Interest) after choosing Standard, Extended or Tiered Standard with $0 extra, for any portfolio holding two or more different rates. Same at 1280x1000 and 375x812, on localhost:3100 and on the live site. Code: calc.ts:37 blends the rates by balance; fixedTotals (calc.ts:74, called at calc.ts:340, 374 and 389) and the 10-year yardstick (calc.ts:233 and the IBR cap at calc.ts:436) price on that blend; ranking.ts:116-120 splits the required payment by live balance; RankingPanel.tsx:102, 107 and 113 feed that split. |
| Code | [`src/lib/calc.ts:37`](../../src/lib/calc.ts#L37), [`src/lib/calc.ts:74`](../../src/lib/calc.ts#L74), [`src/lib/calc.ts:233`](../../src/lib/calc.ts#L233), [`src/lib/calc.ts:340`](../../src/lib/calc.ts#L340), [`src/lib/calc.ts:374`](../../src/lib/calc.ts#L374), [`src/lib/calc.ts:389`](../../src/lib/calc.ts#L389), [`src/lib/calc.ts:436`](../../src/lib/calc.ts#L436), [`src/lib/ranking.ts:77`](../../src/lib/ranking.ts#L77) |
| Test | `money-core.spec.mjs`: "MONEY-07 a fixed plan shows one payment, one end date and one interest total on Plans and on Payoff" |
| Fix proof | Validated: [`fixes/MONEY-07.patch`](../fixes/MONEY-07.patch). Standard, Extended and Tiered Standard are now priced loan by loan: each loan is amortized over the term at its own rate, and the payments are added up. The same sum is now the 10-year yardstick for Public Service Loan Forgiveness and IBR's cap, and IBR at its cap gets Standard's schedule. On those plans, Payoff splits the required payment by each loan's own installment instead of by balance, so every loan clears within the term and both tabs show one payment, one end date and one interest total. An independent review found it sound, with the notes below. |
| Before applying | The ranking is now lopsided. Standard, Extended and Tiered are priced loan by loan while RAP, and IBR below its cap, stay on the blended rate, so close calls tip to RAP even when the app's own Payoff shows RAP costing more. Land the issue's residual follow-up (price RAP and IBR loan by loan, or rank on Payoff runs) with this patch or soon after. If SCOPE-06 also lands, keep IBR's cap and RankingPanel's at-cap test on levelPayment(loans, 10), because SCOPE-06 turns pslfBenchmark into the bill. |
| Overlaps | Changes the same lines as [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch), [`fixes/MONEY-03.patch`](../fixes/MONEY-03.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-11.patch`](../fixes/MONEY-11.patch), [`fixes/MONEY-13.patch`](../fixes/MONEY-13.patch), [`fixes/SCOPE-02.patch`](../fixes/SCOPE-02.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Example loans (8 loans, $28,101), Standard: Plans card 10 yr, interest $9,199; Payoff 'Debt free in December 2036', 10 yr 1 mo, interest $9,227. Each loan amortized on its own gives $310.91 a month (the card uses $310.83), 120 months and $9,208, and $27.59 is still owed when the card says the term is over. Graduate mix of $102,000 ($12k at 3.73%, $15k at 4.99%, $40k at 6.54%, $35k at 9.08%), Extended: Plans $711, 25 yr, $111,414; Payoff July 2053, 26 yr 8 mo, $125,025; loan by loan $715.89, 300 months, $112,766, so Payoff is $12,258 high and Plans $1,352 low; Tiered Standard shows the same figures. $40k at 2.75% plus $60k at 9.08%, Extended: Plans $103,463, Payoff $145,978 over 363 months, loan by loan $107,400. A single loan at the blended rate gives one answer on both tabs, so the defect needs differing rates. Realistic borrowing histories (3,000 per persona under the annual limits and published rates): every multi-rate portfolio overruns. Standard is +1 month for every persona, with median interest gaps of $2 (some college), $38 (bachelor), $189 (bachelor + master) and $722 (bachelor + professional). Extended medians: +3 months and $1,915 (grad only), +6 months and $2,096 (bachelor + master; p95 +19 months, $7,900), +8 months and $8,935 (bachelor + professional; p95 +15 months, $18,848). Tiered: +1 to +8 months. Synthetic fuzz drawing each rate at random from every federal year (median spread about 4.3 points): Standard runs past month 120 in 3,984 of 4,000 portfolios (max 123); Extended median 311 months, p95 326, max 352; interest gap median $6,342, p95 $18,485, max $42,683. Knock-ons: the snowball cost is understated by a median 8% to 27% (bachelor + professional, Extended, +$100: $9,703 shown against $12,326); on the graduate mix, +$100 reads '8 years 1 month sooner', about $46,670 less, against 7 years 4 months and about $42,100 when priced loan by loan. verify.mjs never compares Payoff with a Plans card (section [11] at verify.mjs:345 uses one loan) and passes 180 of 180 on shipped code.

## Required

One plan shows one monthly payment, one end date and one interest total on both tabs. At $0 extra, Standard, Extended and Tiered Standard clear every loan within their term (34 CFR 685.208(b)(1)(i), (b)(4)(i)-(ii), (b)(8)(iii), (c)(1)(iii)), so Payoff matches the card: example loans 10 yr and $9,208, graduate mix on Extended 25 yr and $112,766. IBR at its cap matches Standard's payment and schedule (685.209(f)(2)(ii)).

## Reproduce

1. Open http://localhost:3100 in a fresh profile and click 'Look around with example loans'.
2. Open Plans; on the Standard card click 'How this plan works': Interest you would pay $9,199, How long 10 yr.
3. Click 'Use Standard as my plan' and open Payoff: 'Debt free in December 2036' (measured 2 November 2026), 'That is 10 yr 1 mo', Interest $9,227.
4. For the large gap, clear the loans and add four Direct Unsubsidized loans paid out before July 2026: $12,000 at 3.73%, $15,000 at 4.99%, $40,000 at 6.54% and $35,000 at 9.08%. Choose Extended: the card shows $711, 25 yr, interest $111,414; Payoff shows July 2053, 26 yr 8 mo, Interest $125,025.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-07"`.

## Fix

Price fixed plans loan by loan, use that same figure as the 10-year yardstick, and split Payoff's required payment by each loan's own installment.
calc.ts:74:
```ts
const levelPayment = (loans: Loan[], years: number) =>
  loans.reduce((s, l) => s + amortizedPayment(l.balance, l.rate, years), 0);
function fixedTotals(loans: Loan[], years: number) {
  const monthly = levelPayment(loans, years);
  const totalPaid = monthly * years * 12;
  return { monthlyPayment: monthly, totalPaid, totalInterest: Math.max(0, totalPaid - totalBalance(loans)) };
}
```
Call fixedTotals(ctx.loans, 10), fixedTotals(ctx.loans, 25) and fixedTotals(ctx.loans, years) at calc.ts:340, 374 and 389, and set `pslfBenchmark: levelPayment(loans, 10)` at calc.ts:233. At calc.ts:436, IBR at its cap is the 10-year Standard payment, so give it Standard's schedule:
```ts
if (ibrMonthly(profile) >= pslfBenchmark) {
  return { ...base, eligible: true, ...fixedTotals(ctx.loans, 10), years: 10, forgivenAmount: 0,
    pslf: "counts", pslfNote: "IBR always counts toward Public Service Loan Forgiveness, even a $0 payment." };
}
const pay = ibrMonthly(profile);
```
ranking.ts: add an optional `termYears?: number` to simulate (line 77, before maxMonths), projectPayoff (line 164) and compareStrategies (line 194), import amortizedPayment from @/lib/calc, and at line 120:
```ts
const share = termYears
  ? (installment.get(id)! / activeInstallments) * required
  : (balances.get(id)! / activeTotal) * required;
```
where `installment` maps each loan id to amortizedPayment(l.balance, l.rate, termYears) at today's balance and `activeInstallments` sums it over `active`. RankingPanel.tsx:102, 107 and 113: pass `termYears` and add it to each useMemo's deps:
```ts
const termYears = selected && (["standard", "extended", "tiered_standard"].includes(selected.id) ||
  (selected.id === "ibr" && (selected.monthlyPayment ?? 0) >= ctx.pslfBenchmark)) ? selected.years : undefined;
```
Graduated, RAP and IBR below the cap keep the balance split. Correct the comment at ranking.ts:110-114 and README.md:114-117, which say servicers split by balance, and change README.md:180 to '3 years sooner'.

## Severity

Most borrowers hold loans at several rates, but a typical undergraduate on Standard sees only one extra month and about $70 of interest at most; the decision-sized errors fall on graduate borrowers who choose Extended or Tiered Standard, where realistic borrowing histories run about 3 to 8 months past the term and $1,300 to $8,900 over the card's interest at the median (p95 up to 19 months and $18,848). Nothing on either tab discloses the blended rate, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 3 of 3 skeptics (reproduce, standards, impact)

<details><summary>Dissent and notes</summary>

Severity: all three skeptics kept P0 under the audit-lead rubric (a wrong dollar figure); the impact skeptic placed it at the low end of P0 and said Standard alone would be P2. This report sets P1 because the large errors are confined to graduate borrowers on Extended or Tiered Standard. Impact: all three rejected the filed 'median of $6,342 on Extended' as a property of the synthetic generator rather than of borrowers, and the impact skeptic notes that the $102,000 mix and the $40,000-at-2.75% case exceed annual loan limits (the mix's 20-month overshoot sits just above the realistic p95). Fix: all three found that the filed fix flips the top pick from Standard to IBR on cent-level differences (standards: 7,866 of 67,536 scenarios; impact: 16,485 of 144,000 profiles, median $0.03 a month) because calc.ts:233 and calc.ts:436 stayed on the blend, while verify.mjs still passed 180 of 180; the fix above adds those lines. The impact skeptic's variant instead clamps IBR's total paid at no less than Standard's and keeps IBR on the balance split; the reproduce and standards skeptics return Standard's schedule at the cap and split IBR at the cap by installment, which this report uses. The standards skeptic adds that 685.208(a) alone does not fix a formula and that the strongest text is (b)(4)(ii). Smaller corrections: verify.mjs does not test this 'with one loan', it never compares the two tabs at all; the example loans need one click on 'Use Standard as my plan' before Payoff shows a date; README.md:180 says '3 years 1 month sooner', not '121 to 84'.

Why this fix: the reproduce and standards skeptics converged on it, it also closes the two-answer bug for IBR at its cap, and it was measured in scratch builds with tsc clean and verify.mjs 180 of 180: example loans show $311, 10 yr and $9,208 on both tabs, the graduate mix on Extended $716, 25 yr and $112,766 on both, and example loans at income $61,500 keep Standard as the pick while IBR reads $9,208 on card and Payoff. Both halves are needed: the new payment alone still overruns (314 months on the graduate mix) and so does the new split alone (306). Residual, not fixed by any variant: IBR and RAP below the cap still price on the blended rate (calc.ts:438, 457), for example the graduate mix on IBR at $120,000 shows 229 months and $80,853 on the card against 236 months and $86,434 on Payoff, and a few near-tie picks move from Standard to RAP or IBR (9 of 4,000 in one run; 36 of 144,000 Standard-to-RAP within cents in another). The standards skeptic's follow-up, running simulateIdr at the rate whose 10-year payment equals pslfBenchmark (60-step bisection), narrows that further. Land with money-fifty-dollar-floor, which edits the same fixedTotals: apply the loan-by-loan sum first, then the $50 floor; that combination was not tested, and the fuzz must skip Tiered portfolios under the floor until then (all 17 test failures on the fix were floor cases). Servicer practice: MOHELA prorates a payment by each loan's current amount due and Edfinancial splits a partial payment by each loan's regular payment; no skeptic found a federal servicer splitting by balance, which is why the ranking.ts:110-114 comment and README.md:114-117 need correcting. No network, storage or dependency change.

</details>

Merged from audit findings: `money-multi-loan-two-answers`.
