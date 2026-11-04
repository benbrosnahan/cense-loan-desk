# MONEY-13: Pre-2014 IBR borrowers priced as new borrowers

**P1** · effort M · Money figures and eligibility

IBR ignores loans paid out before July 1, 2014, so a borrower still repaying one sees an IBR payment about a third too low, forgiveness at 20 years instead of 25, and sometimes the wrong recommended plan.

| | |
|---|---|
| Who it hurts | A borrower still repaying a pre-July-2014 loan is told IBR costs about two-thirds of what the servicer will bill ($301 against $451 in the $40,000 case), that forgiveness comes after 20 years instead of 25, and sometimes that IBR is the plan to pick when RAP is cheaper, so they can enroll in or budget for the wrong plan. |
| Standard | 34 CFR 685.209(b)(13)(ii), (f)(3)(i) and (k)(1) |
| Where | Repayment plans tab: the IBR card, the 'Where we would start' headline, the why-not sentences and the plan badges; then the summary line and the Payoff tab once IBR is chosen. Any viewport, local build and live site. Triggered whenever IBR is open (no loan on or after July 1, 2026, no Parent PLUS loan) and any listed loan is dated before 2014-07-01. With no income entered, the IBR card still says 'How long 20 yr'. |
| Code | [`src/lib/calc.ts:199`](../../src/lib/calc.ts#L199), [`src/lib/calc.ts:280`](../../src/lib/calc.ts#L280), [`src/lib/calc.ts:427`](../../src/lib/calc.ts#L427), [`src/lib/calc.ts:437`](../../src/lib/calc.ts#L437), [`src/lib/calc.ts:438`](../../src/lib/calc.ts#L438), [`src/lib/calc.ts:448`](../../src/lib/calc.ts#L448), [`src/data/plans.ts:148`](../../src/data/plans.ts#L148), [`src/data/plans.ts:156`](../../src/data/plans.ts#L156) |
| Test | `money-edges.spec.mjs`: "MONEY-13 IBR charges 15% of discretionary income and forgives at 25 years when a loan was paid out before July 1, 2014" |

## Measured

One $40,000 loan at 6.8% paid out 2013-09-01, income $60,000, household 1: the IBR card shows $301 a month and $72,120 over 20 yr, and its detail says '$2,459 would still be left after 20 years'. A 2015-09-01 date renders identical text, and the engine returns the same figures for every date tested from 2009-01-15 to 2022-09-01; '2014' appears in src only at plans.ts:163. The rule gives $450.75 a month (10-year cap $460.32), paid off in 124 months for $55,751, nothing forgiven. $80,000 at 6.8%, income $70,000, household 2: app $312.83 with $151,438 left after 20 years; rule $469.25 for 300 months, $140,775 paid, $67,507 left. Knock-on text: the $40,000 case's why-not sentence says IBR 'costs $19,340 more overall' (rule: $512); with IBR chosen the summary says '$301 a month on IBR' and Payoff says 'Debt free in August 2047' (rule: $451 and March 2037). Headline flips: $90,000 at 6.8% dated 2013, income $70,000, household 4, nonprofit, goal forgiveness shows 'IBR $171 a month' where the rule makes RAP $200 the pick with IBR at $256; $60,000 at 6.8% dated 2012, income $75,000, household 1, nonprofit shows IBR $426 as the lowest PSLF-qualifying payment where the rule gives IBR $638.25 and RAP $437.50. Uniform grids (not weighted by real borrowers): the top pick changes in 9,480 of 52,480 inputs, 18.1% (goal forgiveness 35.9%, lowest payment 18.4%, least total 0), and in 5,168 of 25,344 single-loan pre-2014 profiles, 20%. Disclosure: the 2014 sentence appears only after opening the IBR card's 'How this plan works'; the always-visible paragraph says 'Two things these estimates assume' and omits it.

## Required

34 CFR 685.209(b)(13)(ii): a borrower who had an outstanding Direct or FFEL balance before July 1, 2014 is not a new IBR borrower. (f)(3)(i) then sets the payment at 15% of discretionary income divided by 12 (still capped at the 10-year Standard amount), and (k)(1) forgives after 300 monthly payments, 25 years. The loan form requires a date and a balance above $0, so any listed loan dated before 2014-07-01 meets this test. README.md:131 and plans.ts:163 already state the rule; the app holds the date it needs to apply it.

## Reproduce

1. Open http://localhost:3100 (or https://cense-loan-desk.vercel.app/) with no saved data.
2. Your loans > Add a loan. In 'Date it was paid out' type 09/01/2013 (the school-year buttons start at 2022-23, so type it), put 40000 in 'What you owe on it today' and 6.8 in 'Interest rate', then Save loan.
3. Open Repayment plans and set 'Yearly income, before tax' to 60000 and 'People in your household' to 1.
4. The IBR card reads 'Per month $301' and 'In total, over 20 yr $72,120', and 'How this plan works' says '$2,459 would still be left after 20 years'. The rule gives $451 a month, paid off in about 10.3 years for $55,751.
5. Edit the loan date to 09/01/2015: nothing on the card changes.
6. Headline flip: one loan of $90,000 at 6.8% dated 09/01/2013, income 70000, household 4, 'Who do you work for?' Nonprofit, goal 'Going for forgiveness': the headline reads 'Where we would start IBR $171 a month'; under the rule RAP at $200 is the pick and IBR is $256.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-13"`.

## Fix

Decide the IBR terms once from the loan dates, use them everywhere calc.ts hard-codes 10% and 20 years, and give the IBR card copy that matches. In src/lib/calc.ts:

// 34 CFR 685.209(b)(13)(ii): a loan from before July 1, 2014 that is still
// owed means the borrower is not new: 15% under (f)(3)(i), 300 payments under (k)(1).
export function isIbrNewBorrower(loans: Loan[]): boolean {
  return !loans.some((l) => l.disbursementDate && l.disbursementDate < "2014-07-01");
}

function ibrMonthly(profile: Profile, share: number): number { // :194-199
  ...
  return (discretionary * share) / 12;
}

// estimatePlans, after :273
const ibrNew = isIbrNewBorrower(ctx.loans);
const ibrShare = ibrNew ? 0.1 : 0.15;
const ibrYears = ibrNew ? 20 : 25;

Then :280 forgivenessYears: id === "ibr" ? ibrYears : meta.forgivenessYears; :427 years: id === "rap" ? 30 : ibrYears; :437 Math.min(ibrMonthly(profile, ibrShare), cap); :438 simulateIdr(balance, rate, pay, ibrYears, ...); :448 years: sim.paidOff ? sim.months / 12 : ibrYears.

In src/data/plans.ts add a card variant:

export const IBR_OLDER_BORROWER_META: PlanMeta = {
  ...PLAN_META.ibr,
  summary: "Caps your payment at 15% of discretionary income, meaning what you earn above 150% of the poverty line. That rate and forgiveness at 25 years apply because one of your loans was paid out before July 1, 2014. A low enough income means a $0 payment, and $0 still counts.",
  pros: PLAN_META.ibr.pros.map((p) => p.startsWith("Forgiveness at 20") ? "Forgiveness at 25 years, 5 sooner than RAP" : p),
  cons: PLAN_META.ibr.cons.filter((c) => !c.startsWith("These figures assume")).map((c) => c.replace("at 20 years", "at 25 years")),
};

In src/components/plans/PlansPanel.tsx:108: const meta = e.id === "ibr" && e.forgivenessYears === 25 ? IBR_OLDER_BORROWER_META : PLAN_META[e.id];

Change plans.ts:201 to 'Forgiveness takes 30 years, longer than IBR'. Keep the plans.ts:163 sentence on the 10% card, and add the same caveat to ASSUMPTIONS at plans.ts:279 ('Two things' becomes 'Three things') for older loans that are not listed, for example inside a later consolidation. Update README.md:131 to match. Both skeptics built this on scratch copies: next build passes, verify.mjs passes 180 of 180, the 2013 card reads $451, 15% and 25 years throughout, the no-income card says 25 yr, and the 2015 card is unchanged.

## Severity

Every borrower who lists a loan paid out before July 1, 2014 gets a wrong IBR payment, term and total each time they open Repayment plans, and across uniform input grids the top pick changes in 18% to 20% of cases: P0-type harm limited to a recognizable group whose share of users is unmeasured. The 2014 caveat sits only inside the IBR card's collapsed detail, not beside the headline, why-not sentence, summary line or Payoff date, so it does not earn a drop.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 2 of 2 skeptics (reproduce, standards); both raised severity from P2 to P1 and both corrected the fix.

<details><summary>Dissent and notes</summary>

Severity: the filer rated P2 because the assumption is disclosed in the card detail and the README. Both skeptics raised it to P1 because that disclosure is folded away and missing from the headline, why-not sentence, summary and Payoff date, and because the top pick flips, which the filing did not measure. Both noted that a literal reading of the audit brief's 'wrong dollar figure' fits P0 and held P1 as a judgement on a bounded group of unmeasured size. Fix: both skeptics found the filed fix right on the numbers but incomplete. On a scratch build the repriced card still said 'Caps your payment at 10%', 'Forgiveness at 20 years, 10 sooner than RAP' and 'These figures assume you first borrowed after July 2014' beside $451, the no-income card still said 'How long 20 yr' because calc.ts:427 was missed, and RAP still said '10 longer than IBR'. The filer's advice to keep the plans.ts:163 sentence everywhere is replaced: it stays only on the 10% card.

Fix choice: the two skeptics proposed the same changes. This uses the reproduce skeptic's built diff plus the standards skeptic's exported isIbrNewBorrower helper, so verify.mjs can test the rule directly. Effort is M rather than the filed S because the card copy, the assumptions line and the tests change with the math. Caveats on the numbers: both sides start from today with no credit for payments already made, so a 2013 borrower may be well along toward 300 payments; the monthly gap is the firm figure and the totals are a like-for-like comparison, not a life-of-loan forecast. The shipped $151,438 leftover also carries IBR's monthly compounding of unpaid interest (MONEY-05); the same 10% path with simple interest leaves $113,720. The only false positive the skeptics could construct is a Perkins loan entered as a Direct kind, which the kind list does not offer. MONEY-14 edits the same line (calc.ts:437); combined it reads const capped = Math.min(ibrMonthly(profile, ibrShare), cap); followed by MONEY-14's rounding line.

</details>

Merged from audit findings: `money-ibr-pre-2014-ignored`.
