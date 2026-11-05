# MONEY-16: Card and reason copy contradicts the numbers

**P2** · effort M · Money figures and eligibility

Plan-card and recommendation sentences contradict the figures beside them, such as Standard's 'Least total interest of any plan' next to RAP's 'Least interest overall' badge and 'At least $50 a month goes to principal' on a $10 RAP payment, so borrowers checking the reasoning see the screen disprove itself.

| | |
|---|---|
| Who it hurts | A borrower checking why a plan was picked, or how RAP works, finds statements that the figures on the same tab disprove: a fixed plan called least interest beside another plan's 'Least interest overall' badge, '$50 a month to principal' on a $10 payment, 'close on every measure' on a plan $4,307 cheaper. A RAP borrower at the $10 floor is told the balance falls five times faster than it does, and each contradiction undercuts trust in every other figure. |
| Standard | 34 CFR 685.209(o)(2)(i) for the RAP sentence: each on-time payment lowers principal by at least the lesser of $50 or the payment. For the rest, Nielsen heuristic 4 (consistency): the same tab states facts that conflict. |
| Where | Plans tab: the 'How this plan works' detail on Standard and RAP, the top-pick reason, the 'Not picked because' line on the other cards, and the goal and employer hints in 'Four questions'. Payoff tab: the body text and screen-reader summary under the headline, and the reasons in 'Your order'. All widths; measured at 1280x1000 and 375x812, with spot checks on the live site. |
| Code | [`src/data/plans.ts:91`](../../src/data/plans.ts#L91), [`src/data/plans.ts:96`](../../src/data/plans.ts#L96), [`src/data/plans.ts:101`](../../src/data/plans.ts#L101), [`src/data/plans.ts:103`](../../src/data/plans.ts#L103), [`src/data/plans.ts:195`](../../src/data/plans.ts#L195), [`src/types/index.ts:159`](../../src/types/index.ts#L159), [`src/types/index.ts:173`](../../src/types/index.ts#L173), [`src/lib/calc.ts:529`](../../src/lib/calc.ts#L529) |
| Test | `money-edges.spec.mjs`: "MONEY-16 every plan and payoff sentence agrees with the figures shown beside it" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

(1) Standard detail. Example loans, income $70,000: RAP $350, 8.6 yr, $35,866, interest $7,765, badge 'Least interest overall'; Standard $311, 10 yr, $37,300, interest $9,199, whose detail says 'The shortest term of any plan, so the least interest', 'Least total interest of any plan' and 'Highest monthly payment of the plans open to you'. At $100,000, RAP is $750 a month, 3.5 yr, $31,147 beside the same three lines. Standard's con 'No forgiveness at the end unless you are going for PSLF' implies a PSLF benefit, but 120 Standard payments leave $0. In fuzz runs the term and payment claims are false in about 31% to 40% of portfolios and the interest claim in 57% to 69%, depending on the generator mix (these are mixes, not shares of borrowers). (2) RAP detail. $40,000 at 7%, income $12,000: card $10 a month, $3,600 over 30 yr, '$36,400 would still be left', and 'At least $50 a month goes to principal, so the balance always shrinks'; the engine correctly cuts principal by $10 a month. The sentence is false for any RAP payment under $50: single borrowers up to $29,999, a household of 4 up to $50,000, a household of 8 up to $70,000; 25% of a 56,640-case grid. (3) Pick reasons. Example loans, goal 'I do not know yet', Nonprofit, $52,000: hint 'We will recommend on total cost, which is the safe default.' above a pick of RAP at $217 with 'You work in public service and want forgiveness on the table', while RAP has the highest total on the tab ($44,953 against IBR $42,692, Graduated $40,646, Standard $37,300). Goal forgiveness, Private sector, $52,000: Graduated reads 'Close to the top pick on every measure' at $78 a month less to start and $4,307 less overall; RAP is picked as earning forgiveness credit yet pays off in 17.3 years with $0 forgiven, and Standard is 'Not picked because it costs $94 more a month' while totalling $7,653 less. The 'Close' sentence is false in 34 of 166 rows on one income grid and 140 of 764 on another, worst $55,880 apart in total (IBR $112,120 against RAP $168,000, both $467 a month). Employer 'Not sure' with goal forgiveness: hint 'We will leave forgiveness out of the recommendation' beside a forgiveness-based pick. (4) Payoff. $100,000 at 6.5% on Standard with $5 extra: 120 months either way and $242 less interest, but the body says 'That is 10 yr of paying only what is required. Add an amount below...' and the screen-reader line says 'Paying the required amount only'. Two identical $5,000 loans at 6%: 'and the smaller of the loans at that rate', 'Also 6%, but a larger balance than the one above' and 'Largest balance, so it goes last'.

## Required

Every sentence is true for the figures on the same screen, and fixed copy in plans.ts says only what is always true. For RAP, 34 CFR 685.209(o)(2)(i): each on-time payment lowers principal by at least the lesser of $50 or the payment, so the balance falls by the whole payment when it is under $50.

## Reproduce

1. Open the app, click 'Look around with example loans', open Repayment plans and type 70000 in 'Yearly income, before tax'. On Standard click 'How this plan works': 'The shortest term of any plan, so the least interest', 'Least total interest of any plan' and 'Highest monthly payment of the plans open to you' sit below RAP's $350 a month, 8.6 yr, $35,866 and its 'Least interest overall' badge.
2. Change income to 52000, the goal to 'I do not know yet' and the employer to 'Nonprofit': the goal hint says 'We will recommend on total cost' while the pick is RAP at $217 with 'You work in public service and want forgiveness on the table', the highest total on the tab.
3. Switch to goal 'Going for forgiveness' and employer 'Private sector': Graduated says 'Close to the top pick on every measure' at $139 to start and $40,646, against RAP's $217 and $44,953.
4. In a new private window add one Unsubsidized loan owing 40,000 at a 7% rate, then enter income 12000 with household 1, and open RAP's 'How this plan works': $10 a month, '$36,400 would still be left', and 'At least $50 a month goes to principal'.
5. In a new private window add one loan owing 100,000 at 6.5%, click 'Use Standard as my plan', open Payoff and type 5 in 'Extra each month': the body still says 'That is 10 yr of paying only what is required'.
6. With two loans each owing 5,000 at 6%, 'Your order' on Payoff says 'a larger balance than the one above', and under 'Smallest balance first' says 'Largest balance'.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-16"`.

## Fix

Six copy changes, each a skeptic's correction; no figure changes.

1. Plan copy, src/data/plans.ts:
:91 "The same payment every month for 10 years, whatever you earn. No fixed plan finishes sooner."
:96 "Usually the least interest of the fixed plans"
:101 "Usually the highest starting payment of the fixed plans"
:103 "No forgiveness at the end"
:195 "Each on-time payment cuts your balance by at least $50, or by the whole payment if it is under $50, so the balance always shrinks"

2. Hints, src/types/index.ts:
:173 GOAL_HINTS.unsure: "We will lead with total cost, or with forgiveness if you work in public service."
:159 EMPLOYMENT_HINTS.unsure: "We will leave forgiveness out of the recommendation unless your goal is forgiveness."

3. Pick reason, src/lib/calc.ts:535-537:
reason = ctx.publicService
  ? `${goal === "unsure" ? "You work in public service and have not picked a goal, so we are leading with forgiveness:" : "You work in public service and want forgiveness on the table, so"} this is the lowest payment among the plans that actually earn Public Service Loan Forgiveness credit. After 120 qualifying payments the rest is cancelled, tax free.`
  : "This is the lowest payment among the plans that earn forgiveness credit. Outside public service, a forgiven balance is taxed as income in the year it is cancelled." +
    (top.forgivenAmount < 1 ? " At this income you would finish paying before anything is forgiven." : "");

4. 'Close to the top pick', src/lib/calc.ts:587-589:
if (!parts.length) {
  const less = [
    dMonthly < -1 ? `${money(-dMonthly)} less a month` : "",
    dInterest < -1 ? `${money(-dInterest)} less interest` : "",
  ].filter(Boolean).join(" and ");
  return less
    ? `Shows ${less} than the top pick, which we chose from your answers above. If you prefer it, it is a defensible choice.`
    : "Close to the top pick on every measure. If you prefer it, it is a defensible choice.";
}

5. Payoff text, src/components/ranking/RankingPanel.tsx: replace the ') : (' at :214 with
) : extra > 0 ? (
  <><Money value={extra} /> extra a month does not bring the date forward a whole month{roughly(interestSaved) > 0 && <>, but it does save about <Money value={roughly(interestSaved)} /> in interest</>}.</>
) : (
and at :136 start the sentence with `${extra > 0 ? `Paying ${money(extra)} extra a month` : "Paying the required amount only"}, you are debt free in ...`.

6. Equal balances, src/lib/ranking.ts: at :37, when ordered[1]?.rate === loan.rate && ordered[1]?.balance === loan.balance, say `Highest rate you carry at ${loan.rate}%, and the same balance as the next loan, so either can clear first.`; at :40 and :49, when prev.balance === loan.balance, say 'the same balance as the one above' instead of 'a larger balance than the one above' and 'Largest balance'.

Already checked on scratch builds: the Standard lines at :91, :96 and :101 at $70,000 and on small balances (verify.mjs 181 of 181); the item 1 RAP sentence true in all 56,640 grid cases; item 4 wrong in 0 of 5,849 'Close' rows and 0 of 622 new rows across 60,000 portfolios; items 5 and 6 in the real UI (verify.mjs 180 of 180). The :103 line and items 2 and 3 (copy plus one condition, from the ux skeptics) have not been run.

## Severity

Any borrower who opens a plan's detail or reads why a plan was or was not picked can meet one of these, most visibly higher earners comparing Standard with RAP and RAP borrowers paying under $50 a month. Every dollar figure on the cards is right, so these are misleading statements with no wrong number.

## Verification

Confirmed by 7 of 7 skeptics across the 4 merged findings (standards 3, reproduce 3, P3 reproduce 1); none refuted.

<details><summary>Dissent and notes</summary>

Severity: money-reason-copy-edges was filed and confirmed at P3; it merges here under the P2 the other three findings kept. Counts: ux-reason-text-contradictions' '22 combinations' was a misread, since only 4 of those 22 are false (denser grids give 34 of 166 and 140 of 764); its forgiveness-pick sub-claim is misleading by omission rather than false (standards skeptic); and its 'same screen' is really the same tab, because Standard's list sits in a collapsed panel on another card. Filed fixes: every member's replacement copy failed a skeptic's check. 'Least interest of the fixed plans' and 'Highest payment of the fixed plans' are false at balances under about $2,620 and wherever Graduated steps above Standard; 'falls by $50 a month' is false for about half of RAP payments (52% of one grid, 48% of random months); 'Lower on payment and interest, but it does not fit your goal' is false on 42 of 424 rows; 'does not earn forgiveness credit' is false for IBR rows and Graduated rows; and the forgiveness-omission sentence as filed would also fire for public-service borrowers. The two Standard-copy skeptics disagree on the replacement: the standards skeptic keeps 'of the fixed plans', changes the payment line to 'Highest starting payment', and accepts the small-balance gap until the $50 minimum (MONEY-03) lands; the reproduce skeptic adds 'Usually' instead. Scope: the RAP sentence is wrong for any payment under $50, not only for single borrowers under $30,000.

The plans.ts:103 line comes from a skeptic's review of the PSLF finding (ux-pslf-least-overall-wrong), which MONEY-02 leaves to this issue; the change is the smallest true wording, since the Standard card already says it always earns PSLF credit. Choices. Standard copy: the reproduce skeptic's 'Usually' wording, because it stays true at small balances without waiting for MONEY-03; drop 'Usually' once Standard honors the $50 minimum. Computing those lines from isLowestInterest and the top monthly payment (the ux finding's idea; PlanRow already has both) was not chosen, because the payment line would still need 'starting': on the example loans Graduated's last step is $627.63 against Standard's $310.83, as the Graduated card itself says. RAP: the standards skeptic's wording, because the interest waiver (685.209(h)(4)(i)) and the $50 match ((o)(2)(i)) both apply only to on-time payments. Goal hint: change the text (both ux skeptics) rather than hide it for public-service borrowers (the P3 skeptic), so every combination keeps a true hint. Employer hint: a minimal edit of the existing string rather than the standards skeptic's 'We will not assume public service work unless your goal is forgiveness', because with goal forgiveness the engine still gives the outside-public-service reason (calc.ts:537). 'Close to the top pick': the P3 skeptic's version, the only one measured to zero wrong. Widening the PSLF gate at calc.ts:568 to (ctx.publicService || goal === "forgiveness") && !pslfOk(e) && pslfOk(top) is a worthwhile extra that gives Graduated its real reason, 'only earns forgiveness credit on some months'; the standards skeptic measured false rows falling from 140 to 18 with that change alone. Left out on purpose: appending the total saving to 'costs $X more a month' (both ux skeptics). Today, where forgiveness makes interest and totals point opposite ways, it would sit beside 'costs ... more overall'; add it after MONEY-01, whose fix bases that gap on totals at calc.ts:565. Overlaps: MONEY-02 rewrites the last sentence of the calc.ts:536 reason so 'the rest is cancelled' appears only when something is left; item 3 changes only that reason's opening clause, so keep both. The goal-unsure 'hands over the least money overall' contradiction is MONEY-01. Item 4 compares dInterest; if MONEY-01 replaces it with dTotal, use that and say 'less in total'. All cited lines were rechecked against the repo.

</details>

Merged from audit findings: `money-standard-static-copy`, `money-rap-at-least-50-copy`, `ux-reason-text-contradictions`, `money-reason-copy-edges`.
