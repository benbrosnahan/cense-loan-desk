# SCOPE-05: Defaulted loans shown plans and dates that do not apply

**P1** · effort M · Borrowers the model does not fit yet

Choosing 'Default Resolution Group' as the servicer changes nothing, so a borrower in default is told Standard, Graduated and Extended are open, steered to one of them and given a debt-free date, when in default only IBR or RAP can repay the loan and rehabilitation is the way back to choosing a plan.

| | |
|---|---|
| Who it hurts | A borrower already in collections who names the Default Resolution Group, as the form invites, is told 4 plans are open, steered to Standard at $311 or Graduated at $139 that they cannot use while in default, and shown a December 2036 debt-free date, instead of learning that only IBR or RAP can repay a defaulted loan and that rehabilitation brings back the choice of plan. |
| Standard | 34 CFR 685.209(c)(1): defaulted loans may not be repaid under an IDR plan except IBR ((d)(2)) and RAP ((d)(4)), and both lists leave out Parent PLUS; (d)(5): only loans made before July 1, 2026 can use IBR. 685.211(d)(1): on default the whole unpaid balance and interest are due at once; (d)(2): collection charges are assessed; (a)(1): payments go to collection costs before principal under every plan. 685.211(f)(1): rehabilitation is 9 payments within 10 months, starting at the income-driven amount with a $5 floor before July 1, 2027 and $10 after. FSA's default page: a defaulted borrower loses 'the ability to choose a repayment plan'. |
| Where | Add-a-loan form ('Who do you pay?' offers 'Default Resolution Group' and shows no notice when it is chosen), then the Loans tab plan count, the Plans hero, open list and closed-plan reasons, the 'You owe' summary line and Payoff. Measured at 375x812 on localhost:3100, and once on the live site, with every loan's servicer set to 'Default Resolution Group'; the engine has no viewport branch. Code: nothing in calc.ts or ranking.ts reads loan.servicer, so buildContext (calc.ts:222) and estimatePlans give output byte-identical to a Nelnet borrower's; the picks come from calc.ts:544 (lowest payment) and calc.ts:551 (least total or unsure); Payoff's simulate (ranking.ts:77) has no collection charges. |
| Code | [`src/types/index.ts:185`](../../src/types/index.ts#L185), [`src/components/loans/LoanForm.tsx:399`](../../src/components/loans/LoanForm.tsx#L399), [`src/lib/calc.ts:208`](../../src/lib/calc.ts#L208), [`src/lib/calc.ts:222`](../../src/lib/calc.ts#L222), [`src/lib/calc.ts:283`](../../src/lib/calc.ts#L283), [`src/lib/calc.ts:299`](../../src/lib/calc.ts#L299), [`src/lib/calc.ts:308`](../../src/lib/calc.ts#L308), [`src/lib/calc.ts:338`](../../src/lib/calc.ts#L338) |
| Test | `scope.spec.mjs`: "SCOPE-05 a borrower in default is offered only IBR or RAP and gets no debt-free date on a plan default closes" |
| Fix proof | Validated: [`fixes/SCOPE-05.patch`](../fixes/SCOPE-05.patch). Reads the servicer the form already collects: when any loan is with the Default Resolution Group, estimatePlans closes every plan except IBR and RAP with 'Closed while a loan is in default, because the whole balance is due at once (34 CFR 685.211(d)(1)). Rehabilitating the loan reopens it.' The check sits after the cutoff, Parent PLUS and Extended-floor checks, so permanent closures keep their own reasons: Parent PLUS ends with no open plan, and a portfolio with a loan from July 2026 on keeps RAP only. Plans adds a notice 'A loan in default has fewer options' that names the open plans and the ways out of default, in a Parent PLUS version when a defaulted loan is Parent PLUS (consolidating it now gives Tiered Standard, plus ICR until June 30, 2028, and never RAP). Payoff and the Plans footer show no debt-free date while a loan is in default. An independent review found it sound, with the notes below. |
| Before applying | Apply after a hand merge with SCOPE-07: the two patches touch the same four files, and both insert a verify.mjs section after [17]. Decide knowingly that one Default Resolution Group loan closes Standard, Graduated and Extended, and the debt-free date, for every entered loan. When both a Parent PLUS loan and the borrower's own loan are in default, only the Parent PLUS note shows, so the own loan's $0 route and RAP after consolidation go unmentioned; that leaves the note incomplete but not wrong. |
| Overlaps | Changes the same lines as [`fixes/MONEY-01.patch`](../fixes/MONEY-01.patch), [`fixes/MONEY-03.patch`](../fixes/MONEY-03.patch), [`fixes/MONEY-04.patch`](../fixes/MONEY-04.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-13.patch`](../fixes/MONEY-13.patch), [`fixes/MONEY-23.patch`](../fixes/MONEY-23.patch), [`fixes/RES-12.patch`](../fixes/RES-12.patch), [`fixes/SCOPE-04.patch`](../fixes/SCOPE-04.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Engine, compiled shipped modules, 240 profiles (3 portfolios x 4 goals x 5 incomes x 2 employers x 2 household sizes): output with every loan at 'Default Resolution Group' is byte-identical to 'Nelnet' in 240 of 240 (a skeptic's 2,000 random portfolios with random servicer mixes: 2,000 of 2,000; calc.ts contains 'servicer' 0 times). All 240 list a plan that default closes as open (Standard and Graduated, plus Extended above $30,000). The top pick is a closed plan in 143 (Standard 105, Graduated 38), and 105 of those show a 'Debt free in' date. Parent PLUS at DRG: 80 of 80 show 'All 3 plans open to you' and pick one (Standard $442 on top).
UI, the 8 example loans ($28,101) at DRG, first visit: Loans says '4 of the 6 federal plans are open to you'; the Plans hero reads 'Standard $311 a month ... This plan hands over the least money overall' under 'All 4 plans open to you' (Standard, Graduated, IBR, RAP); the closed Tiered Standard line says 'you keep the original Standard plan instead'. After 'Use Standard as my plan', Payoff reads 'ON STANDARD · $311 A MONTH REQUIRED', 'Debt free in December 2036', interest $9,227. With 'Lowest monthly payment' and $52,000 the hero is 'Graduated $139 a month, to start ... starts smaller than anything else open to you' while the plans default leaves open show IBR $234 and RAP $217. Collection, rehabilitation, garnishment, offset and acceleration appear 0 times on any tab; the only mention of default is 'the loan defaults at 270 days' on Loans. Choosing DRG in the form adds 0 notices (choosing Parent PLUS adds 1). Page text on Loans, Plans and Payoff is identical to the Nelnet run once the servicer name is masked. The live site gives the same count, hero, open list and Payoff headline.

## Required

Under 685.211(d)(1) a defaulted loan's whole unpaid balance and interest are due at once; collection charges are assessed ((d)(2)) and taken before principal ((a)(1)). Only IBR and RAP may repay a defaulted loan (685.209(c)(1), (d)(2), (d)(4)), neither covers Parent PLUS, and IBR also needs a loan made before July 1, 2026 ((d)(5)). Default ends through rehabilitation (9 payments within 10 months starting at the income-driven amount, at least $5 before July 1, 2027 and $10 after, 685.211(f)(1)), consolidation (685.220), or a $0 income-driven payment that covers the default date (685.209(n)). So this borrower should see only IBR and RAP open (none for Parent PLUS; RAP only once any loan is from July 1, 2026 on), no Standard, Graduated or Extended pick, RAP at $217 rather than Graduated at $139 as the lowest open payment at $52,000, and no debt-free date that leaves out collection charges.

## Reproduce

1. In a fresh browser open http://localhost:3100, click 'Add my first loan', tap '2023–24', keep Subsidized, type 6200 in 'What you owe on it today', and choose 'Default Resolution Group' under 'Who do you pay?'. No notice appears (pick Parent PLUS instead and one does). Click 'Save loan': Loans says '4 of the 6 federal plans are open to you'.
2. For the measured figures, in a fresh browser click 'Look around with example loans', then on Loans click 'Edit' on each of the 8 loans, set 'Who do you pay?' to 'Default Resolution Group' and save. Plans: the hero reads 'Standard $311 a month' under 'All 4 plans open to you'. Click 'Use Standard as my plan' and open Payoff: 'ON STANDARD · $311 A MONTH REQUIRED', 'Debt free in December 2036'. Back on Plans pick 'Lowest monthly payment' and type 52000 for income: the hero becomes 'Graduated $139 a month, to start' while IBR shows $234 and RAP $217.
3.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SCOPE-05"`.

## Fix

Read the signal the form already collects, and close the plans default closes after the permanent checks, so every true reason keeps its own text.

1. src/types/index.ts:185: export const DEFAULT_SERVICER = "Default Resolution Group"; and use it in SERVICERS in place of the literal.
2. src/data/plans.ts, beside PARENT_PLUS_EXCLUDED_PLANS (:249):
```ts
/** 34 CFR 685.209(c)(1), (d)(2), (d)(4): only IBR and RAP can repay a defaulted loan. */
export const IN_DEFAULT_PLANS: PlanId[] = ["ibr", "rap"];
export const IN_DEFAULT_REASON =
  "Closed while a loan is in default, because the whole balance is due at once (34 CFR 685.211(d)(1)). Rehabilitating the loan reopens it.";
```
3. src/lib/calc.ts: add inDefault: boolean to PlanContext (:208) and set it in buildContext (:222) from
```ts
export function anyInDefault(loans: Loan[]): boolean {
  return loans.some((l) => l.servicer === DEFAULT_SERVICER);
}
```
In estimatePlans' build(), immediately before '// ---- Fixed plans' at :338, after the cutoff (:283), Parent PLUS (:308) and Extended-floor (:323) checks:
```ts
if (ctx.inDefault && !IN_DEFAULT_PLANS.includes(id)) {
  return {
    ...base, eligible: false, monthlyPayment: null, totalPaid: null,
    totalInterest: null, years: 0, forgivenAmount: 0,
    pslf: "does_not_count", pslfNote: "", ineligibleReason: IN_DEFAULT_REASON,
  };
}
```
The Parent PLUS check at :308 already closes IBR and RAP, so a Parent PLUS portfolio in default ends with no open plan, as the rule says. At :299, when ctx.inDefault, end the Tiered Standard reason after 'Every loan you entered is older.' instead of 'so you keep the original Standard plan instead'.
4. PlansPanel.tsx:321-339: when ctx.inDefault, add a warn Notice 'A loan in default has fewer options' that names the open plans from `open` (not hard-coded: RAP only if any loan is from July 1, 2026 on, none for Parent PLUS) and says: the whole balance is due and collection charges are added; to get out of default, rehabilitate (9 on-time payments within 10 months, starting at your income-driven amount, at least $5 a month before July 1, 2027 and $10 after), consolidate, or ask whether a $0 income-driven payment covers the date you defaulted; rehabilitation brings back the choice of plan; loans not in default can stay on their own plan, so remove the Default Resolution Group loans to see their figures. Word the heading at :388 for open.length === 0.
5. RankingPanel.tsx:95: const required = selected && selected.eligible && !ctx.inDefault ? selected.monthlyPayment : null; and in the empty state at :154-167, when ctx.inDefault, say there is no debt-free date while a loan is in default, because collection charges come out of each payment before principal (34 CFR 685.211(a)(1)) and this tool does not know them. Show the 'See your debt-free date' card at page.tsx:789 only when no loan is in default.
6. verify.mjs: a new section after [17] (verify.mjs:583) with the sweep in testIdea.

## Severity

Every borrower who picks 'Default Resolution Group', which the form's own servicer list offers and which services federal loans over 360 days delinquent, gets a wrong eligibility answer (closed plans listed as open in 240 of 240 profiles, a closed plan as the pick in 143) and, once they use the pick, a debt-free date that ignores acceleration and collection charges. Borrowers in default are a recognizable group rather than the typical borrower in the main flow, so P1 rather than P0; no tab mentions default, collection or rehabilitation, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 3 of 3 skeptics (standards, reproduce, impact), each with their own engine and UI probes on the local build, one also on the live site; all three kept P0 under the audit leads' scale and all three moved the fix's check to after the permanent checks.

<details><summary>Dissent and notes</summary>

Severity: all three skeptics kept P0 under the audit leads' scale, where any wrong eligibility answer was P0; this report's stricter rubric puts harm limited to a recognizable group (borrowers in default) at P1. Fix: the filing put the default check first in build(), before calc.ts:283; all three skeptics measured that this stamps 'Rehabilitating the loan reopens it' on plans closed for permanent reasons (Extended under $30,000 and Tiered Standard on a legacy portfolio, Standard, Graduated and Extended on a post-cutoff one: 2 to 3 false labels per portfolio) and moved it to just before calc.ts:338, which gives the same open sets with 0 false labels and an unchanged Nelnet control; that placement is used here. The skeptics also added the calc.ts:299 rewording, the page.tsx:789 gate, a notice built from the open list, the $10 floor from July 1, 2027, and consolidation and 685.209(n) as ways out. Facts corrected: the filing cited calc.ts:539, which is the forgiveness fallback; the picks shown come from calc.ts:544 and :551, with the hero copy at :547 and :554. It attached '(685.209(c)(1))' to 'both lists leave out Parent PLUS'; the lists are (d)(2) and (d)(4), and (c)(1) is the general bar on IDR in default. 'Normal repayment returns only after rehabilitation' overstates: consolidation (685.220) and 685.209(n) also end default. The impact skeptic notes that the 'An estimate, not financial advice' line and the fact that 'Use as my plan' only changes local state soften the harm but do not remove it. The filed test's 'December 2036' depends on today's date.

Fix choice: the filed fix with all three skeptics' correction to where the check goes, because it keeps every true reason, needs no new question and reads only the servicer the form already collects. It is local logic only: nothing leaves the device and no dependency is added. Limits: 'Default Resolution Group' is a reliable signal (FSA: it services defaulted federal loans over 360 days delinquent) but misses loans that defaulted at 270 days and have not moved there yet; a form question ('Is this loan in default?') would catch those and is the natural next step. Like the Parent PLUS rule, any one DRG loan closes the plans for the whole entered portfolio, so the notice tells borrowers with other loans how to see those separately. Related: UX-13 covers the late-fee notice that mentions default only as '270 days' away (gap-default-late-fee-notice).

</details>

Merged from audit findings: `gap-default-plans-and-payoff`.
