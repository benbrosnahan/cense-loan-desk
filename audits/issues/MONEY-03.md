# MONEY-03: $50 minimum payment missing

**P1** · effort S · Money figures and eligibility

Standard and Tiered Standard ignore the $50 minimum payment, so borrowers who owe under about $4,400 see a payment the servicer cannot bill, a debt-free date years late and totals up to $671 too high.

| | |
|---|---|
| Who it hurts | A borrower who owes under about $4,400, such as a freshman with one $3,500 loan, is quoted a payment the servicer cannot bill ($11 on $1,000; '$0 a month' on $37, which could lead them to skip a payment they owe), a debt-free date years late (November 2036 instead of September 2028 on $1,000) and totals up to $671 too high, and with no income entered is recommended a plan that costs up to $475 more than Standard. |
| Standard | 34 CFR 685.208(b)(1)(ii) (Standard: at least $50 a month, only the final payment may be less); 685.208(b)(8)(ii) and (c)(1)(ii) (Tiered Standard: at least $50, or the amount due on a balance under $50); 685.208(b)(6)(iii) exempts Graduated. |
| Where | Plans tab cards and hero, the summary line ('$X a month on Standard') and the Payoff tab, whenever the total balance is under about $4,400 (rate-dependent: $3,934 at 9.08% to $5,240 at 2.75%) on Standard or Tiered Standard. Same at 375x812, 412x823 and 1280x1000, through the real loan form, and on the live site. |
| Code | [`src/lib/calc.ts:75`](../../src/lib/calc.ts#L75), [`src/lib/calc.ts:340`](../../src/lib/calc.ts#L340), [`src/lib/calc.ts:344`](../../src/lib/calc.ts#L344), [`src/lib/calc.ts:379`](../../src/lib/calc.ts#L379), [`src/lib/calc.ts:390`](../../src/lib/calc.ts#L390), [`src/lib/calc.ts:407`](../../src/lib/calc.ts#L407), [`src/lib/calc.ts:410`](../../src/lib/calc.ts#L410), [`src/lib/calc.ts:233`](../../src/lib/calc.ts#L233) |
| Test | `money-core.spec.mjs`: "MONEY-03 Standard and Tiered Standard bill at least $50 a month and total what that payment really costs" |

## Measured

Standard ignores the floor. $3,500 at 5.5%: card 'Per month $38', 'In total, over 10 yr $4,558'; Payoff 'On Standard · $38 a month required', 'Debt free in November 2036'. At the floor it is 85 payments (last $30.30), $4,230.30, December 2033. $1,000 at 6.39%: '$11 a month on Standard', 'In total, over 10 yr $1,356', November 2036; at the floor 22 payments, $1,060.20, September 2028. $37 at 6.53%: '$0 a month required', November 2036; at the floor one payment of $37.20. Tiered Standard floors the payment but not the total: a 2026–27 freshman's $3,500 at 6.52% shows '$50', 'In total, over 10 yr $4,773', interest $1,273, 'How long 10 yr', while Payoff on the same plan says 'Debt free in April 2034', 7 yr 5 mo, interest $916 (89 payments, $4,416.03), so the card is $357.26 high; a $37 Tiered balance shows '$50 a month'. The worst overstatement is $475 at 6.39% ($2,452 owed), $485 at 6.52% ($2,445) and $671 at 9.08% ($2,275). The floor binds below $5,240 at 2.75%, $4,425 at 6.39%, $4,399 at 6.52% and $3,934 at 9.08%. It also flips the pick: with no income and the default goal, $1,000 at 6.39% gets 'Graduated $25 a month, to start ... This plan hands over the least money overall' (In total $1,128) and Standard 'costs $228 more overall', though Standard at the floor costs $1,060.20, $67.34 less; this holds up to about $2,210 at 6.39%, and following the pick costs up to $475 more at 6.53%. With income $52,000 and 'Lowest monthly payment', $1,000 picks 'Standard $11 a month'. IBR inherits the unfloored cap: 'IBR Per month $11, In total, over 10 yr $1,356' at income $60,000. verify.mjs reconciles fixed plans only from $18,000 up (verify.mjs:353-358), and its random loop reaches these balances but asserts no floor.

## Required

Standard and Tiered Standard are at least $50 a month, less only on the final payment or when the balance is under $50 (34 CFR 685.208(b)(1)(ii), (b)(8)(ii), (c)(1)(ii)); only Graduated may start under $50 ((b)(6)(iii)). A card's total and term match its own payment and the Payoff tab: Standard $3,500 at 5.5% is 85 payments and $4,230.30; Tiered $3,500 at 6.52% is 89 payments and $4,416.03; a $37 balance is one payment of $37.20.

## Reproduce

1. With no saved data, click 'Add my first loan', tap school year '2023–24' (fills September 1, 2023 and 5.5%), type 3500 in 'What you owe on it today', and click 'Save loan'.
2. Open Plans. Standard card: 'Per month $38', 'In total, over 10 yr $4,558'. Click 'Use Standard as my plan', then open Payoff: 'On Standard · $38 a month required', 'Debt free in November 2036'.
3. Edit the loan to a balance of 37 at 6.53%: Payoff reads '$0 a month required', still November 2036.
4. Replace it with a loan for school year '2026–27' (September 1, 2026, 6.52%) of 3500. Plans: Tiered Standard 'Per month $50', 'In total, over 10 yr $4,773'; its 'How this plan works' shows interest $1,273 and 'How long 10 yr'. Use it as your plan; Payoff: 'Debt free in April 2034', 7 yr 5 mo, interest $916.
5. Replace it with a '2025–26' loan (6.39%) of 1000, leave income blank and the goal on 'I do not know yet'. Hero: 'Graduated $25 a month, to start ... This plan hands over the least money overall' (In total $1,128); Standard: '$11', $1,356, 'costs $228 more overall'.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-03"`.

## Fix

Apply the $50 floor inside fixedTotals, replaying the schedule when it binds, and use the floored 10-year figure everywhere the code means 'the 10-year Standard payment'. Graduated keeps its own function and stays exempt under (b)(6)(iii).

1. src/data/plans.ts:40:
```ts
/** 34 CFR 685.208(b)(1)(ii), (b)(8)(ii), (c)(1)(ii). Graduated is exempt, (b)(6)(iii). */
export const FIXED_PLAN_MIN_PAYMENT = 50;
export const TIERED_STANDARD_MIN_PAYMENT = FIXED_PLAN_MIN_PAYMENT; // verify.mjs:180 reads this name
```
2. src/lib/calc.ts:74-82 (import FIXED_PLAN_MIN_PAYMENT in place of TIERED_STANDARD_MIN_PAYMENT):
```ts
function fixedTotals(balance: number, ratePct: number, years: number) {
  const level = amortizedPayment(balance, ratePct, years);
  if (balance <= 0 || level >= FIXED_PLAN_MIN_PAYMENT) {
    const totalPaid = level * years * 12;
    return { monthlyPayment: level, totalPaid, totalInterest: Math.max(0, totalPaid - balance), years };
  }
  // Below the floor: $50 a month, less only on the last payment, until the balance clears.
  const r = ratePct / 100 / 12;
  let bal = balance, totalPaid = 0, months = 0;
  while (bal > 0.005 && months < years * 12) {
    const due = Math.min(FIXED_PLAN_MIN_PAYMENT, bal * (1 + r));
    bal = bal * (1 + r) - due;
    totalPaid += due;
    months++;
  }
  return {
    monthlyPayment: Math.min(FIXED_PLAN_MIN_PAYMENT, balance * (1 + r)),
    totalPaid,
    totalInterest: Math.max(0, totalPaid - balance),
    years: months / 12,
  };
}
```
3. Delete `years: 10,` at :344 and `years: 25,` at :379. `...t` now supplies years, and leaving them fails `next build` with TS2783.
4. Tiered Standard: delete :390, set :407 to `years: t.years,` and :409 to `monthlyPayment: t.monthlyPayment,`.
5. :233 `pslfBenchmark: fixedTotals(balance, rate, 10).monthlyPayment,` (685.219(b)(28)(iii) benchmarks against the 685.208(b) plan, which carries the floor).
6. :436 `const cap = fixedTotals(balance, rate, 10).monthlyPayment;` (685.209(f)(2)(ii) caps IBR at what the borrower would have paid on the 10-year standard plan). Without 5 and 6, IBR stays at $11 beside a $50 Standard and takes the pick.
7. Copy that is true at every balance: src/data/plans.ts:89 'Fixed payment, done within 10 years'; at :91 'for 10 years' becomes 'for up to 10 years, at least $50 a month'.

The replay runs at most 120 times. No dependency, no network, no storage change.

## Severity

Affects borrowers whose total federal balance is under about $4,400 ($3,934 at 9.08% to $5,240 at 2.75%), such as a freshman with one loan or someone close to payoff, every time they view Plans or Payoff: a wrong payment, date and total that could change a decision, and with no income entered a wrong recommendation. That is a recognizable group rather than the typical borrower in the main flow, so P1 rather than P0; the generic 'Your servicer sets your actual payment' line does not state this limitation, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), on the local build, through the real loan form and on the live site.

<details><summary>Dissent and notes</summary>

Severity: all six skeptics and both leads kept P0 under the audit brief, where any wrong dollar figure was P0; this report's stricter rubric puts harm limited to a recognizable group (total balance under about $4,400) at P1. Fix: both filed fixes fail `next build` with TS2783 ('years' is specified more than once at calc.ts:344 and :379), and both leave the IBR cap (calc.ts:436) and the PSLF benchmark (calc.ts:233) unfloored, which in skeptics' sweeps moved 600 of 4,000 picks (1,428 of 10,752 in another) to IBR at a sub-floor payment; every skeptic added both changes. Flooring the IBR cap is the skeptics' reading of 685.209(f)(2)(ii), 'what the borrower would have paid on a 10-year standard repayment plan', not settled text, and none confirmed servicer practice; the Standard and Tiered parts do not depend on it. Flooring the benchmark also moves Graduated from 'partial' to no PSLF credit at small balances, which the skeptics treat as intended. Evidence: the resilience filing's '0 least-total pick flips' held only on its grid, where RAP won all 960 cells; with no income the default goal picks Graduated up to about $2,210 at 6.39%, and 'Lowest monthly payment' picks change in 865 of 2,156 legacy cells. Its 'up to $466' and 'about $4,400' are replaced by the rate-dependent figures above, and its test belongs at verify.mjs:353-358, not :216 (the Tiered PSLF loop). 'Payoff months equal card months' holds only for single-loan portfolios ($500 at 2.75% plus $3,500 at 8.08% gives 111 against 112 months).

Fix choice: the money filing's always-on floor inside fixedTotals, over the resilience filing's `floor = 0` parameter. After the fix every caller of fixedTotals (Standard, Extended, Tiered, the IBR cap and the PSLF benchmark) needs the floor and Graduated has its own function, so a parameter only adds arguments. Skeptics built both versions: tsc and next build clean, verify.mjs 180 of 180, card equals Payoff on single loans, and 41,472 single-loan cases from $6,001 up identical to shipped. The floor cannot bind on Extended ($100 a month at 0% on $30,000.01). Coordinate with MONEY-07, which rewrites fixedTotals to price loan by loan and also edits calc.ts:233 and :436: apply the loan-by-loan sum first, then this floor to the portfolio total, which the skeptics confirmed is how the floor is worded; that combination is untested. Adjacent, not fixed here: Graduated's card keeps '10 yr' when its $25 start clears sooner ($1,000 at 6.53%: 10 yr on the card, 46 months on Payoff; calc.ts:361, see MONEY-04 and MONEY-06); IBR's $5 and $10 rounding is MONEY-14.

</details>

Merged from audit findings: `money-fifty-dollar-floor`, `resilience-small-balance-50-floor`.
