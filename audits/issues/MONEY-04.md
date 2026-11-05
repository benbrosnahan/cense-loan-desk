# MONEY-04: Graduated breaks the 3x cap and hides its peak

**P0** · effort M · Money figures and eligibility

Graduated's starting payment is understated by up to 56% because the step schedule behind it breaks the legal 3x cap, so borrowers comparing monthly payments choose on a wrong number and are never shown how high the payment climbs.

| | |
|---|---|
| Who it hurts | A borrower who picks on the monthly number, which the app's own goal invites, is told Graduated starts at $139 on the example loans when the app's own five-step schedule within the legal cap starts at $178 (the shape that published federal figures match to the dollar at other rates), that wrong figure can win the badge and the recommendation, and the card never says the payment ends near $533 (the shipped model's own peak is $628). |
| Standard | 34 CFR 685.208(b)(6)(iii): no Graduated payment may be more than three times greater than any other; 685.208(b)(6)(i): repaid within 10 years at two or more levels. |
| Where | Plans tab at every width: the Graduated card ('Per month, to start' and 'In total, over 10 yr'), its 'Lowest starting payment' badge, and the 'Where we would start' hero when the goal is 'Lowest monthly payment'. The same starting figure appears with no peak in the Loans summary line, the Payoff eyebrow and the Payoff plan switcher. Affects any blended rate below 8.96% once the balance is above roughly $3,500 to $4,750; below that the $25 floor keeps the ratio under 3. |
| Code | [`src/lib/calc.ts:86`](../../src/lib/calc.ts#L86), [`src/lib/calc.ts:89`](../../src/lib/calc.ts#L89), [`src/lib/calc.ts:106`](../../src/lib/calc.ts#L106), [`src/lib/calc.ts:108`](../../src/lib/calc.ts#L108), [`src/lib/calc.ts:129`](../../src/lib/calc.ts#L129), [`src/lib/calc.ts:363`](../../src/lib/calc.ts#L363), [`src/types/index.ts:70`](../../src/types/index.ts#L70), [`src/components/plans/PlansPanel.tsx:63`](../../src/components/plans/PlansPanel.tsx#L63) |
| Test | `money-core.spec.mjs`: "MONEY-04 Graduated starts where a schedule within the 3x cap must start, and shows how high it climbs" |
| Fix proof | Validated: [`fixes/MONEY-04.patch`](../fixes/MONEY-04.patch). Graduated now steps by 3^(1/4) every two years, so its last payment is exactly three times its first, with the start solved in closed form to repay in 120 months, or the monthly interest with a smaller step when that is higher (34 CFR 685.208(b)(6)(i), (iii)); as the issue chose, the old $25 floor is dropped because (b)(6) sets none, at the cost that $1,000 at 6.53% starts at $7 and $37 shows $0. The card shows 'rising to $X' beside the start and the hero says how high it climbs, both through <Money>, and the summary and the Payoff plan switcher say 'to start', each written so a page translator never holds a text node that React later removes. Because Payoff can only run one level payment, with Graduated chosen it now says it can't project Graduated's rising payments yet and shows no debt-free date, months saved, interest saved or per-loan dates, and its screen-reader summary says the same, until MONEY-06 makes Payoff step-aware. An independent review found it sound, with the notes below. |
| Before applying | Land it with MONEY-06, or expect a rebase: MONEY-06's patch no longer applies on top of this one, and whichever lands second should drop the Graduated guards in Payoff. Until then the eyebrow, the extra-payment control and Plans' 'See your debt-free date' still promise a projection for Graduated. Dropping the $25 floor makes Graduated the 'Lowest monthly payment' pick on small balances: $1,000 at 6.53% becomes Graduated at $7 rising to $20 ($1,464 total) instead of Standard at $11, and $37 becomes 'Graduated $0 a month, to start'. With MONEY-03's $50 floor, the 'a little over half the Standard amount' copy is false below about $4,400. |
| Overlaps | Changes the same lines as [`fixes/MONEY-01.patch`](../fixes/MONEY-01.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-08.patch`](../fixes/MONEY-08.patch), [`fixes/RES-12.patch`](../fixes/RES-12.patch), [`fixes/SCOPE-05.patch`](../fixes/SCOPE-05.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Final payment over starting payment on $27,000: 10.29x at 2.75%, 7.38x at 3.73%, 5.41x at 4.99%, 4.89x at 5.5%, 4.10x at 6.53%, 3.31x at 8.08%; the schedule first meets 3x at 8.96% (9.08%: 2.96x). Above the $25 floor the ratio depends on rate, not balance, and every rate in the app's own award-year table (4.99% to 6.53%) fails at 4.10x to 5.41x. Example loans ($28,101 at a blended 5.9187%): start $138.60, last step $627.63 (4.53x, and 2.02x the $310.83 Standard payment), total $40,646.38; the same five two-year steps held to 3x start at $177.59, end at $532.76 and total $39,755.39. Shown start vs that compliant start: 2.75% $61.88 vs $142.22; 3.73% $83.93 vs $150.60; 5.5% $123.75 vs $166.65; 6.53% $146.93 vs $176.56. That is 17% to 56% low at 2.75% to 6.53%, 5% to 13% low at 7.05% to 8.08%, about 0 from 8.94%, and 22% low on the example loans. Below 4.10% the shown start is under the floor of any schedule that obeys the cap (2.75%: $61.88 vs $86.42; 3.73%: $83.93 vs $90.57). Published federal-format figures match the compliant model, not the app: $20,000 at 5% (ED Repayment Estimator via Wichita State) $120 / $360 / $26,863, app $83.33 / $449.84 / $27,574; $27,000 at 6.39% (Bradley University sample, rev 11/7/25) $175 / $526 / $39,218, app $143.78 / $39,992; $35,000 at 6% (Motley Fool 2015 table citing ED's estimator) $222 / $667 / $49,742, app $175 / $50,835; an 8.25% chart hosted by the University of New Haven matches the compliant model on all ten rows within $1. Totals are overstated by $327 to $981 on $27,000 at 2.75% to 8.08%; on the example loans no 120-month schedule within 3x can total more than about $40,397, so the shown $40,646 is impossible by about $249. The peak appears nowhere: no $627, $628, $533 or $178 in the text or HTML of any tab at 320 to 1440 px, detail open or closed. With goal 'Lowest monthly payment' the example loans at about $41,600 to $50,000 income (household 1) switch from Graduated $139 to RAP $150 once the schedule complies; on a 37,856-case grid (not population-weighted) the shipped app picks Graduated in 62.0% of cases and the fix changes 23.7% of those picks. verify.mjs passes 180/180 with the bug because verify.mjs:339 computes an unused 'sanity only' value. Edge case: the hi = 2.0 growth cap stops the schedule clearing below 1.61% ($50,000 at 1.5% totals $46,500), under any real federal rate. The live chunk contains the same code (s=Math.max(e*a,25),l=1,r=2).

## Required

Last payment at most 3.0 times the first at every rate, on a schedule that repays within 120 months (685.208(b)(6)(i) and (iii)). With the shape the app describes (five levels, stepping every 2 years) that means g = 3^(1/4) and start = balance / sum over s = 0..4 of g^s * a * (1+r)^(-24s), where a is the 24-month annuity factor; where monthly interest is higher than that start, start at interest and solve a smaller g, as the published 10.5% PLUS chart does. Product requirement, not in the CFR: show the peak wherever the start is shown.

## Reproduce

1. Open http://localhost:3100 in a fresh private window and click 'Look around with example loans' (8 loans, $28,101).
2. Open the Plans tab, type 45000 in 'Yearly income, before tax', keep 'People in your household' at 1, and set the goal to 'Lowest monthly payment'.
3. The hero reads 'Graduated $139 a month, to start'; the Graduated card shows 'Per month, to start $139', 'In total, over 10 yr $40,646' and 'Lowest starting payment'; RAP shows $150.
4. Click 'How this plan works' on Graduated: no peak figure is shown anywhere, and the note says regulation caps the largest payment at three times the smallest. The model's own last step is $627.63, 4.53 times the start.
5. Against a published schedule: in a fresh window click 'Add a loan', Loan type 'Unsubsidized', school year 2025-26 (fills 6.39%), 27000 in 'What you owe on it today', 'Save loan'; the Graduated card shows $144 to start and $39,992 in total, where the Bradley University sample for the same loan shows $175 and $39,218.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-04"`.

## Fix

Engine, src/lib/calc.ts. Add a closed-form start beside graduatedTotals:
function graduatedStart(balance: number, r: number) {
  const g = Math.pow(3, 1 / 4);
  const a = r > 0 ? (1 - Math.pow(1 + r, -24)) / r : 24;
  let pv = 0;
  for (let s = 0; s < 5; s++) pv += Math.pow(g, s) * a * Math.pow(1 + r, -24 * s);
  return balance / pv;
}
// calc.ts:106
const base = Math.max(graduatedStart(balance, r), balance * r);
// calc.ts:108
let hi = Math.pow(3, 1 / 4);
Keep the existing g bisection; it now returns 3^(1/4) unless the interest floor binds. Add export to graduatedTotals at calc.ts:89 so the test can read finalPayment, and update the comment at calc.ts:85-87 ('near interest-only'). Copy: 'roughly half' at plans.ts:110 and plans.ts:115 becomes 'a little over half' (the fixed start is 0.54 to 0.60 of Standard).
Show the peak: add finalPayment?: number to PlanEstimate beside src/types/index.ts:70 and finalPayment: t.finalPayment at calc.ts:363; widen Measure's note at PlansPanel.tsx:63 to ReactNode (import type ReactNode from react) and put {" "} before the note span at PlansPanel.tsx:72; then on the card
const rises = (e.finalPayment ?? 0) >= (e.monthlyPayment ?? 0) + 1;
<Measure ... note={rises ? <>rising to <Money value={e.finalPayment!} /></> : undefined} />
and in the hero at PlansPanel.tsx:356: a month{top.estimate.id === "graduated" && <>, to start, rising to <Money value={top.estimate.finalPayment!} /> by year 9</>}. Render the peak only through <Money>, which Hide dollar amounts blurs; a plain string or money() stays readable. Add 'to start' to the Graduated figure at page.tsx:468 and to the option text at RankingPanel.tsx:369 (no second figure in the option, since an <option> cannot blur).

## Severity

Every borrower with only pre-July-2026 loans at a blended rate under 8.96% and a balance above roughly $3,500 to $4,750 sees this on the Plans tab, which covers every rate in the app's own award-year table; the start is 17% to 56% low at 2.75% to 6.53%, and for borrowers choosing on the monthly number it wins 'Lowest starting payment' and the pick (example loans at about $42,000 to $50,000 income: Graduated $139 instead of RAP $150). The 'to start' label says the payment rises but not that the start is understated, and the model note sits in a collapsed panel and says the cap is respected, so no level is dropped.

Proposed P0; independent severity judges said P0, P0; final P0.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each); the 3 on the money filing kept P0 and the 3 on the UX filing kept P1.

<details><summary>Dissent and notes</summary>

Severity: the UX filing's three skeptics kept P1. Their case: above 4.10% a differently shaped legal schedule can start at $139 ($138.61 for 24 months then $368.18 for 96 is 2.66x), the UI calls the schedule a model, and the only provably impossible figure is the total, 0.6% high in the cautious direction. The money filing's three kept P0 because published federal figures at 5%, 6%, 6.39% and 8.25% match the compliant five-step schedule to the dollar, below 4.10% no legal schedule can start that low, and the figure drives the badge and the pick. This report takes P0 under the stricter rubric because the start is wrong against the app's own stated schedule for the typical borrower and can change the plan chosen. Published samples also disagree on shape: ED's 2009 chart and the July 2018 Exit Counseling Guide at 6.8% start higher still ($198 on $25,000, implied ratio about 2.17), so even the fixed start may be a lower bound. Corrections adopted from the skeptics: the 17% to 56% range holds only at 2.75% to 6.53%; the floor crossing is 4.10%, not 4.05%; 'every rate below about 9%' needs the balance qualifier; the $2,200 tiny-balance threshold is really $1,967 to $2,620 depending on rate; the filed test (finalPayment / monthlyPayment on estimatePlans output) evaluates NaN and fails before and after the fix; and 'never told' is true of the amount only, since the label, tagline and hero all say the payment climbs. After the fix the peak to disclose is about $533, not $628: under the cap no servicer could charge $628 after a $139 start.

Fix choice: the money filing's closed-form start with g fixed at 3^(1/4), over the UX filing's bisection that keeps the $25 floor. Both pass the cap sweep. The closed form adds no search loop, was checked on 200,112 stress cases (0 over the cap, 0 not cleared by month 120, 0 below interest, 0 at or above Standard; next build and verify.mjs 180/180 pass), and drops the $25 floor, which (b)(6) does not set and which made tiny balances start above Standard while the copy says 'below'. Cost of dropping it: $1,000 at 6.53% shows $7 to start and $37 shows $0, as Standard already does at $37. The engine change alone is S and could ship first, but ship it together with MONEY-06's step-aware Payoff or withhold Graduated's Payoff date until then: on its own it turns Payoff's 'does not clear' into 'Debt free in October 2052' (311 months) on a 10-year plan. The Payoff eyebrow and assumption line (RankingPanel.tsx:172 and :335) are rewritten in MONEY-06. Expected knock-on: the lowest-payment pick moves from Graduated to RAP, IBR or Extended in some income bands; that is the intended correction. Neither the shipped code nor the fix models the (b)(5) rules for borrowers who entered repayment before July 2006. Not checked: the federal Loan Simulator (studentaid.gov timed out).

</details>

Merged from audit findings: `money-graduated-breaks-3x-cap`, `ux-graduated-peak-hidden-and-over-cap`.
