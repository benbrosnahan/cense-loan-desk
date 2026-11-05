# SCOPE-01: PSLF promised without the full-time rule

**P1** · effort S · Borrowers the model does not fit yet

The Plans tab promises Public Service Loan Forgiveness on employer type alone and never mentions the 30-hour full-time rule, so a part-time government or nonprofit worker is told a $0 payment ends in cancellation after 120 payments when none of their months count.

| | |
|---|---|
| Who it hurts | A part-time government or nonprofit worker who answers honestly is told to pay $0 a month because the rest is cancelled tax free after 120 payments, yet none of those months count toward PSLF: on the example loans they still owe about $41,335 at month 120, and their only forgiveness is IBR's, at 20 years and taxable. They are never told the thing they could act on, such as adding hours or a second qualifying job to reach a 30-hour average. |
| Standard | 34 CFR 685.219(b)(11)(i)(A)-(C), (c)(1)(ii), (c)(2)(vi), (e)(3) |
| Where | Plans tab, after choosing Government or Nonprofit with the goal 'Going for forgiveness' or 'I do not know yet': the employer hint, the 'Where we would start' box, and the '✓ Counts toward PSLF' badge, PSLF note and pros inside each 'How this plan works' panel for Standard, IBR and RAP. Same at 375x812 and 1440x900 on localhost:3100; the live chunk page-eae479cdacf15b74.js ships the same strings and the same condition. |
| Code | [`src/lib/calc.ts:235`](../../src/lib/calc.ts#L235), [`src/lib/calc.ts:529`](../../src/lib/calc.ts#L529), [`src/lib/calc.ts:536`](../../src/lib/calc.ts#L536), [`src/lib/calc.ts:262`](../../src/lib/calc.ts#L262), [`src/lib/calc.ts:348`](../../src/lib/calc.ts#L348), [`src/lib/calc.ts:431`](../../src/lib/calc.ts#L431), [`src/lib/calc.ts:452`](../../src/lib/calc.ts#L452), [`src/lib/calc.ts:471`](../../src/lib/calc.ts#L471) |
| Test | `scope.spec.mjs`: "SCOPE-01 a part-time public-service worker is told only full-time months earn PSLF wherever forgiveness is promised" |
| Fix proof | Validated: [`fixes/SCOPE-01.patch`](../fixes/SCOPE-01.patch). Copy only: every place that promises PSLF now states the full-time rule (34 CFR 685.219(c)(2)(vi), (b)(11)(i)). The Government and Nonprofit hints say PSLF needs an average of at least 30 hours a week across qualifying jobs. The recommendation now begins 'If you work full time in public service' and says only full-time months count. The PSLF notes and the 'Always earns ... credit' pros on Standard, IBR and RAP say credit is earned only in months of full-time qualifying work. No pick, payment or PSLF status changes. An independent review found it sound, with the notes below. |
| Before applying | True as written, but 'meaning an average of at least 30 hours a week' gives only (b)(11)(i)(A), so a school-year teacher or an adjunct may wrongly conclude their months do not count. If MONEY-13 lands too, give its older-borrower PSLF pro the full-time wording: git applies the two together without any conflict to flag it. It conflicts with MONEY-02 and MONEY-23 at calc.ts:536. |
| Overlaps | Changes the same lines as [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch), [`fixes/MONEY-08.patch`](../fixes/MONEY-08.patch), [`fixes/MONEY-23.patch`](../fixes/MONEY-23.patch), [`fixes/SCOPE-04.patch`](../fixes/SCOPE-04.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Example loans ($28,101), income $22,880 (20 hours a week at $22), household 1, 'Going for forgiveness' and 'Nonprofit' chosen by real clicks. The employer hint reads 'A 501(c)(3), or a nonprofit doing qualifying public service.' The 'Where we would start' box reads 'IBR $0 a month. You work in public service and want forgiveness on the table, so this is the lowest payment among the plans that actually earn Public Service Loan Forgiveness credit. After 120 qualifying payments the rest is cancelled, tax free.' With every disclosure open, the Plans tab shows 3 '✓ Counts toward PSLF' badges, 3 'always counts toward Public Service Loan Forgiveness' notes (for example 'IBR always counts toward Public Service Loan Forgiveness, even a $0 payment.') and 3 'Always earns Public Service Loan Forgiveness credit' pros. Across all four tabs, at 375 and 1440 wide: full-time 0, part-time 0, 'hours' 0, '30 hours' 0, employer certification or PSLF form 0, W-2 0; 'certif' appears only in 'You have to recertify your income every year' (2). The only Plans inputs are the goal and employer radiogroups, income and household; the stored profile has no hours field (income, householdSize, employment, goal, extraPerMonth, selectedPlan). The same promise appears for Government and for 'I do not know yet', and goes away only for Private sector or Not sure. Engine sweeps: the promise appears in 272 of 1,120 profiles (filer), 240 of 1,008 (standards skeptic) and 980 of 4,800 (reproduce skeptic, own transpile), every time Government or Nonprofit with goal forgiveness or unsure, with 0 deviations; adding {hoursPerWeek: 20, fullTime: 'no'} to the profile leaves the output byte-identical. With 'I do not know yet', Nonprofit picks IBR at $0 while Private sector picks RAP at $38.13, so the employer answer also changes the pick. The local build and the live chunk each contain the promise once and 0 full-time, part-time or '30 hours' strings. For this borrower, 120 months at $0 with no PSLF credit leave about $41,335 owed: $28,101 plus $16,632 of simple interest, less $3,398 that IBR does not charge on the $19,000 of subsidized loans in the first 3 years.

## Required

34 CFR 685.219(c)(2)(vi) credits a payment only for a month in which the borrower is employed full time by a qualifying employer, and (c)(1)(ii) also requires full-time qualifying employment at payment 120 and when the borrower applies. (b)(11)(i)(A) defines full time as an average of at least 30 hours a week across one or more qualifying jobs; (B) deems a 30-hour school-year contract of at least 8 months full time, and (C) converts adjunct credit hours at 3.35. (e)(3) collects employment information on a form the Secretary approves. Wherever the page says a plan 'always counts' or that 'the rest is cancelled', it must state the full-time condition.

## Reproduce

1. Open http://localhost:3100 (or https://cense-loan-desk.vercel.app/) and click 'Look around with example loans' (eight loans, $28,101).
2. Open the Plans tab. Under 'What matters most to you?' click 'Going for forgiveness'. Under 'Who do you work for, or expect to?' click 'Nonprofit'.
3. Type 22880 in 'Yearly income, before tax' (20 hours a week at $22). Leave household at 'Just me'.
4. Read the employer hint and the 'Where we would start' box: IBR $0 a month, ending 'After 120 qualifying payments the rest is cancelled, tax free.' Nothing mentions hours.
5. Click 'How this plan works' on Standard, IBR and RAP. Each shows '✓ Counts toward PSLF', an 'always counts toward Public Service Loan Forgiveness' note and an 'Always earns Public Service Loan Forgiveness credit' pro. Search the page for 'full time' or '30 hours': 0 hits.
6. Switch the goal to 'I do not know yet': the pick stays IBR $0 with the same promise. Switch the employer to 'Private sector': the pick becomes RAP at $38.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SCOPE-01"`.

## Fix

Copy only, made where each claim is made. No pick, payment or PSLF status changes (the impact skeptic's patched-module sweep of 896 profiles found 0 changes).
(1) src/types/index.ts:156-157: append to both public-service hints:
  ' PSLF also needs full-time work: an average of at least 30 hours a week across your qualifying jobs. Teachers on a full-time school-year contract count all year.'
(2) src/lib/calc.ts:536:
  reason = ctx.publicService
    ? "If you work full time in public service, this is the lowest payment among the plans that earn Public Service Loan Forgiveness credit. Only months when you work full time for a qualifying employer count, meaning an average of at least 30 hours a week across your qualifying jobs, and your employer usually certifies that on the PSLF form. After 120 of those payments the rest is cancelled, tax free."
    : ...
(3) src/lib/calc.ts:262, 348, 431, 452 and 471: make each PSLF note conditional. At 452:
  pslfNote: "IBR counts toward Public Service Loan Forgiveness in any month you work full time for a qualifying employer, even a $0 payment."
  Same pattern for Standard (348), RAP (471, keeping 'even at the $10 minimum'), the no-income note (431), and the fixed-plan note (262: '...so these months count toward Public Service Loan Forgiveness while you work full time for a qualifying employer.').
(4) src/data/plans.ts:98, 155 and 196: 'Earns Public Service Loan Forgiveness credit while you work full time in public service'.
Leave src/data/plans.ts:154 as it is: a $0 IBR payment counts toward IBR's own forgiveness whatever the job.

## Severity

Every Government or Nonprofit user with a forgiveness or 'I do not know yet' goal sees the unconditional promise (272 of 1,120 swept profiles), but it is wrong only for those averaging under 30 hours a week: a recognizable group for whom the eligibility answer is wrong every time, leaving about $41,335 owed at month 120 on the example loans instead of $0. The page never states the full-time condition, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 3 of 3 skeptics (standards, impact, reproduce), on the local build and the live chunk; all three kept P0 under the audit leads' scale.

<details><summary>Dissent and notes</summary>

Severity: the filer and all three skeptics rated this P0 under the audit's rule that any wrong eligibility answer is P0; this report's stricter rubric gives P1 because the answer is wrong only for borrowers averaging under 30 hours a week. Money: the filer's $44,733 owed at month 120 leaves out 34 CFR 685.209(h)(2)(i), under which IBR does not charge unpaid interest on the $19,000 of subsidized loans for the first 3 years; the impact and reproduce skeptics each corrected it to about $41,335. Fix wording: the filer's 'Only months you work at least 30 hours a week' misstates a rule that averages across jobs and deems school-year teachers full time (standards, impact); 'your employer confirms that on the PSLF form' is not always true, since ED can decide from information it already holds under 685.219(e)(2) (impact, reproduce); and the filer's PSLF-only rewrite of plans.ts:154 would drop a true statement, because a $0 IBR obligation counts toward IBR forgiveness under 685.209(k)(4)(i)(A) (all three). The impact skeptic's hint clause 'A school-year teaching contract counts' is tightened here to 'a full-time school-year contract', to match 685.219(b)(11)(i)(B).

Fix chosen: the copy-only change, the smallest one that makes every PSLF claim true; all three skeptics endorsed it with the wording corrections applied above. With 'I do not know yet' it does not change the pick (Nonprofit still gets IBR at $0 where Private sector gets RAP at $38.13), but the reason now states the condition the pick depends on. If the pick itself should change for part-time workers, the fuller fix (M) is: add fullTime: 'yes' | 'no' | 'unsure' to Profile with DEFAULT_PROFILE 'unsure' (storage.ts:47 spreads defaults, so no key bump); ask 'Do you average 30 hours a week or more, counting all your public-service jobs?' only for Government or Nonprofit; and set publicService at calc.ts:234-235 to (government || nonprofit) && fullTime !== 'no'. With that, also reword calc.ts:537 'Outside public service, ...' to 'Without PSLF, ...', key the verify.mjs check on ctx.publicService rather than employment, and update the 'Four questions' heading at page.tsx:672. The '✓ Counts toward PSLF' badge (PlansPanel.tsx:42) can stay: it sits directly above the now-conditional note (PlansPanel.tsx:260-262). The new reason also stops telling people who chose an employer they only 'expect to' work for (page.tsx:701) that they already work in public service. MONEY-02 rewrites the same reason sentence at calc.ts:536 to price the 120-payment path; carry the full-time condition into whatever wording lands there. The PSLF form asks about hours, so a borrower who certifies early learns the rule, but months already worked part time stay lost.

</details>

Merged from audit findings: `gap-pslf-full-time-unstated`.
