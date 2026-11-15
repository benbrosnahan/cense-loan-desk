# MONEY-01: Least-total pick compares unlike totals

**P0** · effort M · Money figures and eligibility

Plan comparisons count every forgiven dollar as money the borrower paid, so an income-driven plan with a lower total is described as costing tens of thousands more, and the default recommendation can be the more expensive plan.

| | |
|---|---|
| Who it hurts | Borrowers who ask for the cheapest plan, or who never set a goal, are told an income-driven plan costs tens of thousands more than the pick when it takes less of their money before tax, in the very sentence the page offers so they can disagree on the merits. The pick follows the same false figure: on the example loans a $500 raise from $30,000 to $30,500 moves the hero from RAP at $50 a month to Standard at $311, though at a 22% tax on the forgiven balance IBR or RAP is cheaper across $30,500 to $38,500. |
| Standard | Figures on one card must agree with each other. 34 CFR 685.211(a)(1)(ii) applies IBR and RAP payments to accrued interest first, and 685.209(o)(2)(i) makes RAP's matching principal payment ED's own, not the borrower's. |
| Where | Plans tab at every width, once an income is entered and IBR or RAP would leave a balance to forgive. The hero sentence is wrong on goals 'I do not know yet' (the default) and 'Pay the least overall'; the 'costs $X more overall' lines and 'Interest you would pay' (inside 'How this plan works') are wrong under every goal. Seen at 375, 1280 and 1440 wide, on the local production build and on the live site. |
| Code | [`src/lib/calc.ts:447`](../../src/lib/calc.ts#L447), [`src/lib/calc.ts:466`](../../src/lib/calc.ts#L466), [`src/lib/calc.ts:182`](../../src/lib/calc.ts#L182), [`src/lib/calc.ts:519`](../../src/lib/calc.ts#L519), [`src/lib/calc.ts:539`](../../src/lib/calc.ts#L539), [`src/lib/calc.ts:551`](../../src/lib/calc.ts#L551), [`src/lib/calc.ts:554`](../../src/lib/calc.ts#L554), [`src/lib/calc.ts:555`](../../src/lib/calc.ts#L555) |
| Test | `money-core.spec.mjs`: "MONEY-01 every "more overall" figure is the gap between the totals on screen, and no plan shows more interest than it collects" |
| Fix proof | Validated: [`fixes/MONEY-01.patch`](../fixes/MONEY-01.patch). IBR and RAP now report the interest the borrower actually pays (each payment to accrued interest first), and every 'more/less in total' comparison is the gap between the two 'In total' figures on the cards, with any forgiven balance described in words. The 'Pay the least overall' and 'I do not know yet' picks rank on what the borrower pays plus an assumed 22% income tax on a balance forgiven at the end, and the hero and the ASSUMPTIONS note name that rate. Because the pick now moves with income, the hero puts 'a month' in its own span and builds its 'Use X as my plan' label as one string, so a page translator cannot leave a stale payment or plan name on screen. An independent review found it sound, with the notes below. |
| Before applying | Decide the rate: 22% overstates the federal tax for most low-income borrowers who reach forgiveness, and the tax is zero under PSLF. 'Pay the least overall' still ignores PSLF until MONEY-02 lands, and the 'Least interest overall' badge can now land on a $0 IBR, which contradicts Standard's 'Least total interest of any plan' pro until MONEY-16 lands. When merging with MONEY-06, keep its idrMonth loop and add the interest paid there, so the card and Payoff show the same interest. |
| Overlaps | Changes the same lines as [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch), [`fixes/MONEY-03.patch`](../fixes/MONEY-03.patch), [`fixes/MONEY-04.patch`](../fixes/MONEY-04.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-08.patch`](../fixes/MONEY-08.patch), [`fixes/MONEY-13.patch`](../fixes/MONEY-13.patch), [`fixes/RES-12.patch`](../fixes/RES-12.patch), [`fixes/SCOPE-05.patch`](../fixes/SCOPE-05.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Example loans (8 loans, $28,101), income $30,000, default goal: hero RAP, 'This plan hands over the least money overall', In total $18,000; the IBR card shows In total $12,120 and 'Not picked because it costs $52,437 more overall'; Standard says 'costs $9,199 more overall' though the two totals differ by $19,300. Same loans, private sector, 'Pay the least overall', income $40,000: hero Standard ($37,300 on its card); IBR shows 'In total, over 20 yr $32,120' yet 'costs $25,103 more overall' (the totals differ by $5,180 the other way) and 'Interest you would pay $34,302', more than everything it says you pay; RAP says '$8,801 more' where the totals differ by $1,300 the other way. At $20,000 IBR shows $0 a month, $0 in total and 'costs $63,426 more overall'. $60,000 at 6.53%, income $50,000, 'Pay the least overall': IBR In total $52,120, 'costs $84,068 more overall', 'Interest you would pay $105,933'; RAP In total $60,000, 'costs $20,136 more overall', interest shown $42,000, though all $60,000 paid goes to interest and ED's match retires $18,000 of principal. RAP at the $10 minimum ($40,000 at 7% paid out after July 1, 2026, income $12,000): interest shown $0 on $3,600 paid, all of it interest, with the 'Least interest overall' badge. Cause: totalInterest = totalPaid - (balance - forgiven) at calc.ts:447 and :466 counts every forgiven dollar as paid on IBR and subtracts ED's match on RAP; the 'more overall' gap (calc.ts:565, :582) and the least_total and unsure pick (calc.ts:551) use it, so each sentence is only true at a 100% tax on forgiveness (implied rate 99.91% to 100.01% across 246 sentences). On synthetic inputs: 'costs more overall' points the wrong way on 8,943 plan rows and has the wrong amount on 28,335 of 87,210 (fixed-plan-against-fixed-plan rows: 0 of 29,223 wrong); interest exceeds total paid on 16,834 rows; the least_total pick is not the lowest In total in 4,530 of 15,066. verify.mjs passes 180 of 180 on this code.

## Required

'Interest you would pay' is the interest the borrower actually pays, with each IBR or RAP payment going to accrued interest first, so it can never exceed 'In total'. Any 'more in total' amount equals the difference between the two 'In total' figures on screen, within $1. A plan described as costing or handing over the least is the cheapest on the basis the sentence names. A forgiven balance and its tax are said in words, not folded into a dollar figure.

## Reproduce

1. Open the app with no saved data and click 'Look around with example loans' (8 loans, $28,101).
2. Open Plans. Leave 'What matters most to you?' on 'I do not know yet' and the employer on 'Not sure'. Type 30000 in 'Yearly income, before tax'. Hero: 'RAP, $50 a month ... This plan hands over the least money overall.' RAP card: 'In total, over 30 yr $18,000'. IBR card: 'In total, over 20 yr $12,120' and 'Not picked because it costs $52,437 more overall.' Standard: 'costs $9,199 more overall' beside $37,300.
3. Choose 'Pay the least overall' and 'Private sector', and change income to 40000. Hero: Standard. IBR card: 'In total, over 20 yr $32,120' and 'costs $25,103 more overall'. Click IBR's 'How this plan works': 'Interest you would pay $34,302'.
4. Change income to 20000. IBR: 'Per month $0', 'In total, over 20 yr $0', 'costs $63,426 more overall'.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-01"`.

## Fix

Count the interest the borrower actually pays, compare plans on what they pay, and rank least_total and unsure on that plus a stated tax on any forgiven balance. All in src/lib/calc.ts unless noted.

1. simulateIdr: track interest paid.
```ts
let interestPaid = 0;                          // beside totalPaid, :151
// just before `totalPaid += pay;` at :182
// 34 CFR 685.211(a)(1)(ii): an IBR or RAP payment goes to accrued interest first.
interestPaid += Math.min(interestCharged, pay);
// :186
return { totalPaid, interestPaid, forgiven: Math.max(0, bal), months, paidOff: bal <= 0.005 };
```
2. :447 and :466: `totalInterest: sim.interestPaid,`

3. rankPlans, after lowestInterest (:521):
```ts
// Stated planning assumption: income tax on a balance forgiven outside PSLF.
const FORGIVENESS_TAX_ASSUMPTION = 0.22;
const costWithTax = (e: PlanEstimate) =>
  (e.totalPaid ?? Infinity) + FORGIVENESS_TAX_ASSUMPTION * e.forgivenAmount;
// $1 tolerance, so a float tie keeps the earlier plan (Standard before IBR)
const lowestCost = eligible.reduce((a, b) => (costWithTax(b) < costWithTax(a) - 1 ? b : a));
```
At :539 and :551 set `top = lowestCost;` and keep lowestInterest for the badge only. Replace the reason at :552-555:
```ts
reason =
  (goal === "unsure"
    ? "You have not told us a goal yet, so we are recommending on total cost. "
    : "You want to pay the least overall. ") +
  `Counting what you pay plus an assumed ${Math.round(FORGIVENESS_TAX_ASSUMPTION * 100)}% income tax on any balance forgiven at the end, this plan costs the least.` +
  (top.forgivenAmount > 1
    ? " Part of your balance is left at the end and forgiven, and outside PSLF that counts as taxable income."
    : "");
```
4. whyNotFor, :565 and :582-584:
```ts
const dTotal = (e.totalPaid ?? 0) - (top.totalPaid ?? 0);
if (dTotal > 1) parts.push(`pays ${money(dTotal)} more in total`);
if (dMonthly < -1 && dTotal > 1) parts.push("buys a smaller payment now by charging you more in the end");
if (dTotal < -1 && e.forgivenAmount > top.forgivenAmount + 1)
  parts.push(`pays ${money(-dTotal)} less but leaves ${money(e.forgivenAmount)} to be forgiven, taxed as income outside PSLF`);
```
5. src/data/plans.ts:278-279: 'Two things these estimates assume' becomes 'Three things', adding: 'When we recommend on total cost, a balance forgiven at the end is counted with an assumed 22% income tax.'

The cards keep their pre-tax 'In total', so every 'pays $X more in total' is the difference of two figures on screen. Arithmetic only: no dependency, no network, no storage change.

## Severity

Any borrower who enters an income and keeps the default goal 'I do not know yet', or picks 'Pay the least overall', is hit whenever IBR or RAP would leave a forgiven balance: on the example loans the 'more overall' figures are wrong at every income up to $47,500 and the hero's 'hands over the least money overall' is false from $12,000 to $42,000, and on a synthetic 576-borrower grid the default-goal hero is false 63% of the time. The wrong figures and the pick they drive sit in the default view, while the forgiven-balance note is folded behind 'How this plan works', so no level is dropped.

Proposed P0; independent severity judges said P0, P0; final P0.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), on the local build and the live site; all six kept P0.

<details><summary>Dissent and notes</summary>

Ranking rule: five of six skeptics rank on totalPaid plus a stated 22% tax on the forgiven balance. The money impact skeptic instead ranks on pre-tax totalPaid with 'before tax' in the hero, because with 3% yearly raises the 22% rule had the highest mean overspend of the rules it tested ($17,664 in that world; worst across seven worlds $26,747 against $8,991 for pre-tax totalPaid). The money standards skeptic, scoring on 2026 single-filer brackets at flat income, found the 22% rule picks the cheapest plan in 95.0% of cost-path portfolios with a forgiven balance, against 47.7% for pre-tax totalPaid and 75.2% today. The ux impact skeptic would use 0% for public-service borrowers; not adopted, because the 20- and 30-year forgiveness being priced is taxable, and the PSLF path is priced in MONEY-02. Filed fixes, corrected by every skeptic: the ux filing's patch does not compile (dInterest is still used at calc.ts:583, TS2304) and its Math.max(0, totalPaid - balance) breaks a figure that is right today (IBR at $45,000 goes from $25,235 to $14,019; IBR at $38,000 shows $19 against $28,120 paid to interest); the money filing's rank on raw totalPaid moves 36.8% of picks and makes 4,060 of 30,000 picks a $0 IBR, and its 'keep ranking on interest' alternative is worse still (not the cheapest after tax in 32.0%). Evidence corrections: the 18,397 'badge not on lowest total' count is not a count of false claims, since the badge claims least interest (by interest actually paid it is on the wrong plan in 12,474 to 12,668 of 60,000); the clause 'costs you the least in total interest' is literally true in the $60,000 example (Standard $21,864 against IBR $52,120 actually paid) and false in 20.8% of least_total heroes, so the filed 30% tests the goal, not the clause, and comes from synthetic inputs (37% on another distribution); after a 22% tax, 5,562 of the 9,023 wrong-direction rows really do cost more than the pick, though never by the printed amount; the false 'more overall' also appears under 'Lowest monthly payment' and 'Going for forgiveness'.

Fix choice: the tax-aware rank, proposed by five of six skeptics. On the app's own flat-income model it picks the cheapest plan after tax in 95.0% of cost-path portfolios with a forgiven balance (mean $178 above the cheapest, against $3,569 today) and changes 12.7% of picks, while pre-tax totalPaid moves 36.8% of picks, many of them to a $0 IBR priced as a post-2014 borrower (see MONEY-13). The 22% is a product call for the author; whatever rate is chosen must be named in the hero and in ASSUMPTIONS. lowestInterest stays for the 'Least interest overall' badge only, which becomes true once totalInterest is interest actually paid. The hero carries no new dollar figure because it renders outside `.amt`, so Hide amounts would not blur it (UX-07); the existing whyNot figures already leak that way. Land together with MONEY-02, which edits the same lines (calc.ts:565, :582) and builds on dTotal. MONEY-05 (IBR compounding) changes IBR's forgiven amounts such as $63,426, but not this contradiction. Validate with `npx tsc --noEmit` or `next build`: verify.mjs:52 discards compiler errors, and verify.mjs passes 180 of 180 with or without this bug. Copy left to MONEY-16: plans.ts:96 'Least total interest of any plan' and types/index.ts:173 'which is the safe default'.

</details>

Merged from audit findings: `money-least-total-compares-unlike`, `ux-plan-cost-sentence-contradicts-total`.
