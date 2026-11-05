# MONEY-02: PSLF path not priced

**P1** · effort M · Money figures and eligibility

The 120-payment PSLF path is never priced, so public-service borrowers compare 20- and 30-year totals that can be tens of thousands off, and those who ask to pay the least are steered to Standard without being told PSLF would cost them less.

| | |
|---|---|
| Who it hurts | Teachers, nurses and other public-service workers are shown the 20- or 30-year price of a plan the page recommends for its 10-year cancellation ($60,000 against $20,000 actually paid in the first example, $90,000 against $30,000 in the second), with comparisons off by tens of thousands on the question they came to answer; those who ask to pay the least are steered to Standard and told RAP 'costs $7,654 more overall' when over 120 qualifying payments it costs $11,300 less at flat income. |
| Standard | 34 CFR 685.219(c)(1)(iii) (120 qualifying payments) and 685.219(d) (ED forgives the principal and accrued interest that remain); consistency with the page's own promise at calc.ts:536. |
| Where | Plans tab, employer Government or Nonprofit, income entered. Goals 'Going for forgiveness' and 'I do not know yet': the hero promises cancellation after 120 payments with no price for that path. Goal 'Pay the least overall': the path is never mentioned. Same text at 320, 375, 768, 1024, 1280 and 1440 wide, and on the live site. |
| Code | [`src/lib/calc.ts:536`](../../src/lib/calc.ts#L536), [`src/lib/calc.ts:438`](../../src/lib/calc.ts#L438), [`src/lib/calc.ts:457`](../../src/lib/calc.ts#L457), [`src/lib/calc.ts:529`](../../src/lib/calc.ts#L529), [`src/lib/calc.ts:555`](../../src/lib/calc.ts#L555), [`src/lib/calc.ts:565`](../../src/lib/calc.ts#L565), [`src/lib/calc.ts:582`](../../src/lib/calc.ts#L582), [`src/lib/calc.ts:584`](../../src/lib/calc.ts#L584) |
| Test | `money-core.spec.mjs`: "MONEY-02 a public-service borrower sees what 120 qualifying payments cost and what is left to cancel" |
| Fix proof | Validated: [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch). Runs the existing IBR and RAP simulation a second time for 120 payments and stores what they cost (pslfPaid) and what would be left to cancel (pslfCancelled). Each card shows those figures to Government and Nonprofit borrowers. For a public-service borrower going for forgiveness, the other plans that earn credit are now compared on the cost of their next 120 payments. With 'Pay the least overall', the reason names the plan whose 120 qualifying payments cost less, and the full-term comparisons say they assume no PSLF. The recommendation promises cancellation only when a balance is still left at payment 120. An independent review found it sound, with the notes below. |
| Before applying | Income is held flat and the 120 payments count from today. So on the example loans the least_total sentence recommends RAP, which costs more than IBR at 4% raises and more than Standard at 5%, with nothing left to cancel; when IBR also qualifies, consider naming it or saying the figure assumes flat income. Remove the e.id !== "ibr" guard once MONEY-05 lands, and merge the IBR block and the reason sentence by hand with SCOPE-01, MONEY-13 and MONEY-23. |
| Overlaps | Changes the same lines as [`fixes/MONEY-01.patch`](../fixes/MONEY-01.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-07.patch`](../fixes/MONEY-07.patch), [`fixes/MONEY-08.patch`](../fixes/MONEY-08.patch), [`fixes/MONEY-13.patch`](../fixes/MONEY-13.patch), [`fixes/MONEY-23.patch`](../fixes/MONEY-23.patch), [`fixes/SCOPE-01.patch`](../fixes/SCOPE-01.patch), [`fixes/SCOPE-02.patch`](../fixes/SCOPE-02.patch), [`fixes/SCOPE-04.patch`](../fixes/SCOPE-04.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

$60,000 at 6.53%, income $50,000, Government, goal 'Going for forgiveness' (identical with 'I do not know yet'): hero RAP, 'After 120 qualifying payments the rest is cancelled, tax free.' RAP card: 'In total, over 30 yr $60,000'; behind 'How this plan works', '$42,000 would still be left after 30 years'. The path itself, traced independently: 120 payments of $166.67, $20,000 paid, $54,000 cancelled. IBR card: 'costs $51 more a month and costs $63,933 more overall', where over the same 120 payments IBR costs $6,060 more ($26,060 against $20,000). Standard carries 'Least interest overall' and only 'costs $516 more a month', though on this path it costs $61,864 more and cancels nothing. $100,000 at 7%, income $60,000, Nonprofit: RAP card $90,000 over 30 yr; the path is $30,000 paid, $94,000 cancelled; IBR says '$147,455 more overall' against $6,060 on the path. With every disclosure open on all four tabs, none of $20,000, $54,000, $26,060, $6,060 or $94,000 appears. Example loans ($28,101), income $52,000, Nonprofit, 'Pay the least overall': hero Standard, 'this plan costs you the least in total interest', Standard In total $37,300; IBR 'costs $5,392 more overall', RAP 'costs $7,654 more overall', both 'and buys a smaller payment now by charging you more in the end'; over 120 qualifying payments IBR totals $28,060 and RAP $26,000, $9,240 and $11,300 less than Standard, and no '120', 'cancel' or 'tax free' appears on the tab even with every disclosure open. 'The rest is cancelled' also shows when nothing is left: 4,547 of 12,560 showings with income entered in a synthetic fuzz (36.2%), for example Standard as the pick at income $120,000 on $40,000 or $60,000 at 6.53%, which reaches $0 on payment 120. In a synthetic population of 40,000 public-service portfolios the card total is at least $10,000 above the path cost in 45.2%, and 'costs $X more overall' is off by $10,000 or more in 5,274 of 6,408 sentences on credit-earning plans; on a grid of legacy portfolios where Standard is the least_total pick, all 234 have a cheaper 120-payment path (median $40,772).

## Required

For a borrower the page treats as going for PSLF: what 120 qualifying payments cost and what is left to cancel at payment 120, with comparison sentences built on those figures and saying so. For a public-service borrower who asks to pay the least: both outcomes, with 120 qualifying payments and without. 'The rest is cancelled' only when something is left.

## Reproduce

A. Promise without a price.
1. With no saved data click 'Add my first loan', tap school year '2024–25' (fills September 1, 2024 and 6.53%), keep any loan type except Parent PLUS, type 60000 in 'What you owe on it today', and click 'Save loan'.
2. Open Plans, choose 'Going for forgiveness' and 'Government', and type 50000 as yearly income. Hero: RAP, 'After 120 qualifying payments the rest is cancelled, tax free.' RAP card: 'In total, over 30 yr $60,000'. IBR: 'costs $51 more a month and costs $63,933 more overall'. Standard: 'Least interest overall', 'costs $516 more a month'.
3. Open every 'How this plan works' and the other tabs: no $20,000 paid or $54,000 cancelled anywhere. Switching the goal to 'I do not know yet' changes nothing.
B. Path never mentioned.
1. On Loans, use 'Clear my data', 'Clear every loan', then click 'Look around with example loans'.
2. Plans: 'Pay the least overall', 'Nonprofit', income 52000. Hero: Standard, 'this plan costs you the least in total interest'. IBR: 'costs $5,392 more overall and buys a smaller payment now by charging you more in the end'; RAP: the same with $7,654. No '120', 'cancel' or 'tax free' on the tab, even with every disclosure open.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-02"`.

## Fix

Price the 120-payment path for IBR and RAP, show it on their cards for public-service borrowers, and build the PSLF-path sentences on it. Written on top of MONEY-01, which turns the gap at calc.ts:565 into dTotal; land the two together.

1. src/types/index.ts, PlanEstimate, after :79:
```ts
/** IBR and RAP: what the next 120 payments cost, and what would be left to cancel then. */
pslfPaid?: number;
pslfCancelled?: number;
```
2. src/lib/calc.ts, IBR (:438) and RAP (:457): run the same simulation for 10 years with the plan's own options and return both fields.
```ts
const opts = { waiveUnpaidInterest: false, matchPrincipal: false }; // RAP: true, true
const sim = simulateIdr(balance, rate, pay, 20, opts);               // RAP: 30
const at120 = simulateIdr(balance, rate, pay, 10, opts);
// in the returned object
pslfPaid: at120.totalPaid,
pslfCancelled: at120.forgiven,
```
3. rankPlans, after pslfOk (:524):
```ts
const pathCost = (e: PlanEstimate) => e.pslfPaid ?? e.totalPaid ?? 0;
const cancels = (e: PlanEstimate) =>
  ctx.publicService && pslfOk(e) && (e.pslfCancelled ?? 0) >= 1;
```
At :536 end the first sentence at 'credit.' and promise cancellation only when something is left:
```ts
(cancels(top)
  ? " After 120 qualifying payments the rest is cancelled, tax free."
  : " At this payment the balance reaches zero by payment 120, so there would be nothing left to cancel.")
```
After the goal branches (:556):
```ts
const goingForPslf =
  ctx.publicService && (goal === "forgiveness" || goal === "unsure") && pslfOk(top);
if (goal === "least_total" && ctx.publicService) {
  const cheaper = eligible.filter((e) => cancels(e) && pathCost(e) < pathCost(top) - 1);
  if (cheaper.length) {
    const best = cheaper.reduce((a, b) => (pathCost(b) < pathCost(a) ? b : a));
    reason += ` That is without Public Service Loan Forgiveness. With 120 qualifying payments while working full time for a qualifying employer, ${best.name} would cost less, and the rest would be cancelled tax free. Its card shows the figures.`;
  }
}
```
4. whyNotFor, replacing the total-cost fragments at :582-584:
```ts
const cheaperOnPath = cancels(e) && pathCost(e) < pathCost(top) - 1;
if (goingForPslf && pslfOk(e)) {
  const gap = pathCost(e) - pathCost(top);
  if (gap > 1) parts.push(`costs ${money(gap)} more over those 120 payments`);
} else {
  if (dTotal > 1) parts.push(`pays ${money(dTotal)} more in total${cheaperOnPath ? " without Public Service Loan Forgiveness" : ""}`);
  if (dMonthly < -1 && dTotal > 1 && !cheaperOnPath) parts.push("buys a smaller payment now by charging you more in the end");
  // MONEY-01's 'pays $X less but leaves $Y to be forgiven' fragment stays in this branch
}
```
5. :603: `isLowestInterest: e.id === lowestInterest.id && !(goingForPslf && pathCost(e) > pathCost(top) + 1),`

6. src/components/plans/PlansPanel.tsx, before the badges at :167, through <Money> so Hide amounts blurs it:
```tsx
{publicService && e.pslf === "counts" && e.pslfPaid !== undefined && (e.pslfCancelled ?? 0) >= 1 && (
  <p className="mt-3 text-sm leading-relaxed text-slate-800">
    If you work full time in public service for 120 more qualifying payments:{" "}
    <Money value={e.pslfPaid} /> paid, then <Money value={e.pslfCancelled} /> cancelled tax free.
  </p>
)}
```
Land with or after MONEY-05 (IBR compounding): until then IBR's cancelled figure reads 7% to 16% high ($78,442 against $73,120 on the $60,000 example). Arithmetic only: no dependency, no network, no storage change.

## Severity

Affects public-service borrowers (Government or Nonprofit) who enter an income, on every visit: with the default goal or 'Going for forgiveness' the hero promises cancellation after 120 payments but every price and comparison is the 20- or 30-year one, and with 'Pay the least overall' the path is not mentioned at all. The harm is limited to this recognizable group, so P1; the card totals are right for someone who leaves public service, but nothing beside the comparison sentences says which path they price, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), on the local build and the live site; all six kept P1.

<details><summary>Dissent and notes</summary>

All six skeptics kept P1 and all six rewrote the filed fixes. The money filing's 'compare on pslfPaid when publicService' also reaches goal 'Pay the least overall' and would print false 'Close to the top pick on every measure' lines (2,368 in a 30,000-portfolio fuzz), '$0 cancelled tax free' on 22,402 of 36,753 new lines, and '120 payments' on 5,540 plans that clear sooner. The ux filing's monthly x 120 overstates plans that clear early (worst by $144,953; at income $100,000 its hero says $90,000 against a real $31,147) and puts 'the rest is cancelled tax free' on Standard, which has $0 left. The ux standards skeptic would leave the cancelled amount out of the card line because IBR compounding overstates it; the money skeptics keep it and require landing after MONEY-05, which this fix follows. The ux impact skeptic would render the hero's new figures through <Money>; this fix keeps dollar figures out of the hero instead. Corrections to the evidence: '6,221 of 60,000' used the wrong denominator and included blank incomes, so 4,547 of 12,560 (36.2%) is used; 'up to $60,000' is only the larger example ($150,000 at 7.05%, income $70,000 gives $84,000); 685.219(d), not (c)(1)(iii), sets the cancelled amount, and neither paragraph is a display duty; the hero's 'least in total interest' stays true on the path (interest over 120 payments: IBR $12,522, RAP $13,263, Standard $9,199), so what fails is the unconditional 'more overall' and 'charging you more in the end'; $11,300 is a flat-income ceiling (about $4,300 at 3% raises; at 5% raises RAP costs $1,397 more while IBR, capped at Standard, stays cheaper); the least_total case reaches only borrowers who pick that goal, because 'I do not know yet' in public service already takes the forgiveness branch at calc.ts:529.

Fix choice: the money skeptics' engine fields and their gate (goal forgiveness or unsure, and the pick earns credit), which is what stops the false 'Close to the top pick' lines, plus the ux standards skeptic's least_total sentence and its 'without Public Service Loan Forgiveness' qualifier. The card line appears only when something is left to cancel, which removes '$0 cancelled' and false '120 payments' without adding a months field. Both card figures go through <Money> so Hide amounts blurs them; the hero names the cheaper plan but carries no dollar figure, because hero text is outside `.amt` (UX-07). If MONEY-05 cannot land first, show only the paid figure and 'the rest is cancelled tax free'. The 120 payments count from today: payments already credited lower the figures (SCOPE-07), and the full-time requirement is SCOPE-01. Income is held flat, as the app already discloses. Adjacent, not fixed here: with RAP selected the Payoff tab never mentions PSLF (MONEY-06); plans.ts:103 tells Standard readers 'No forgiveness at the end unless you are going for PSLF', though 120 Standard payments leave $0 (MONEY-16).

</details>

Merged from audit findings: `money-pslf-path-not-priced`, `ux-pslf-least-overall-wrong`.
