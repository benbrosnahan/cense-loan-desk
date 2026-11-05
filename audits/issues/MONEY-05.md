# MONEY-05: IBR compounds unpaid interest

**P1** · effort S · Money figures and eligibility

IBR charges interest on unpaid interest every month, which the rules do not allow while a borrower stays on IBR, so borrowers whose payment is below their interest see a forgiven, taxable balance typically about 40% to 50% too high.

| | |
|---|---|
| Who it hurts | A borrower on a low IBR payment reads a forgiven balance, right beside the warning that it counts as taxable income, that is $19,175 to $160,630 too high in the filed cases, and the visible 'costs $X more overall' comparison is inflated the same way, so IBR's tax risk and cost look far worse than the rules make them. |
| Standard | 34 CFR 685.209(j)(2) with 685.202(b): unpaid IBR interest is capitalized only when the payment reaches the 10-year cap amount or the borrower leaves IBR, not monthly; 20 U.S.C. 1098e(b)(3)(B); 685.211(a)(1)(ii): payments go to accrued interest first. |
| Where | Plans tab at every width, IBR card: the 'How this plan works' detail ('Interest you would pay' and '$X would still be left after 20 years and gets forgiven ... counts as taxable income') and the always-visible 'Not picked because it costs $X more overall' line. Any income where the IBR payment is below the monthly interest; where the payment covers the interest the figures are right. |
| Code | [`src/lib/calc.ts:157`](../../src/lib/calc.ts#L157), [`src/lib/calc.ts:164`](../../src/lib/calc.ts#L164), [`src/lib/calc.ts:167`](../../src/lib/calc.ts#L167), [`src/lib/calc.ts:168`](../../src/lib/calc.ts#L168), [`src/lib/calc.ts:438`](../../src/lib/calc.ts#L438), [`src/lib/calc.ts:447`](../../src/lib/calc.ts#L447), [`src/lib/calc.ts:449`](../../src/lib/calc.ts#L449), [`src/lib/calc.ts:582`](../../src/lib/calc.ts#L582) |
| Test | `money-core.spec.mjs`: "MONEY-05 IBR leaves the balance that uncompounded unpaid interest gives after 20 years" |
| Fix proof | Validated: [`fixes/MONEY-05.patch`](../fixes/MONEY-05.patch). simulateIdr gets its own IBR branch, as the audit proposed: unpaid interest accrues beside principal and earns no interest while the borrower stays on IBR (34 CFR 685.209(j)(2), 685.202(b)), and each payment goes to that interest first (685.211(a)(1)(ii)). The loop guard and paidOff test principal plus unpaid interest, so paid-off runs keep their real term; RAP's loop is unchanged apart from dropping its now-unreachable IBR arm. An independent review found it sound, with the notes below. |
| Before applying | Subsidized IBR balances stay overstated by up to three years of unpaid interest until that relief is modelled (for example $66,000 shown against $60,600 for $30,000 all subsidized at 6% with a $0 payment), so consider a short disclosure or the follow-up. If you also take MONEY-06, port this rule into MONEY-06's shared idrMonth function, so the card and Payoff stay in step. |
| Overlaps | Changes the same lines as [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Forgiven after 20 years, app vs a simple-interest reference (household 1, unsubsidized): $30,000 at 6%, income $20,000: $99,306 vs $66,000 (+50%); $28,101 at 5.919%, income $30,000: $68,422 vs $49,247 (+39%); $60,000 at 6.53%, income $50,000: $113,813 vs $86,240 (+32%); $100,000 at 7%, income $60,000: $247,335 vs $167,880 (+47%); $150,000 at 7.5%, income $75,000: $433,510 vs $272,880 (+59%). The app equals closed-form monthly compounding, B(1+r)^240 - p((1+r)^240 - 1)/r, to within a cent in every below-interest case tested (21,010 random portfolios in one run, 14,567 in another), so compounding is the cause; where the payment covers interest the two models agree (0 mismatches in 8,764, 15,433 and 18,990 cases across three runs). The filed 32% to 59% is a sample, not a range: on grids at 4% to 9% the overstatement runs +0.1% to +117% with medians of 47.8% to 51.8%, a random sample has a median of 41.9%, and $30,000 at 10.5%, income $20,000 shows $242,758 vs $93,000 (+161%). On screen for $60,000 at 6.53%, income $50,000 (local at 1280 and 375 px, and the live site): 'Interest you would pay $105,933', '$113,813 would still be left after 20 years and gets forgiven ... counts as taxable income', and on the collapsed card 'costs $84,068 more overall'. With the fix these read $78,360, $86,240 and $56,496; IBR's monthly payment and total paid do not change. Top pick and badges: 0 changes in 60,000 portfolios. verify.mjs passes 180/180 with the bug because its IBR section checks only the monthly payment.

## Required

While a borrower stays on IBR, unpaid interest accrues beside principal and earns no interest; it is capitalized only on the events 685.209(j)(2) and 685.202(b) list (the payment reaching the 10-year cap amount, leaving IBR), and each payment goes to accrued interest first. So $30,000 at 6% with $0 payments must end at $30,000 + $30,000 x 0.5% x 240 = $66,000, and $60,000 at 6.53% with income $50,000 at $86,240.

## Reproduce

1. Open http://localhost:3100 in a fresh private window and click 'Add a loan': Loan type 'Unsubsidized', school year 2024-25 (fills 6.53%), 60000 in 'What you owe on it today', then 'Save loan'.
2. Open the Plans tab and type 50000 in 'Yearly income, before tax'; keep 'People in your household' at 1.
3. The IBR card shows $217 a month, 'In total, over 20 yr $52,120' and 'Not picked because it costs $84,068 more overall'.
4. Click 'How this plan works' on IBR: 'Interest you would pay $105,933' and '$113,813 would still be left after 20 years and gets forgiven'. The rules give $86,240.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-05"`.

## Fix

Give IBR its own branch at the top of simulateIdr in src/lib/calc.ts, after the declarations at calc.ts:149-153 and before the existing loop, which RAP keeps unchanged:
if (!opts.waiveUnpaidInterest) {
  // IBR: unpaid interest accrues beside principal and earns none, 34 CFR 685.209(j)(2)
  let principal = balance;
  let unpaid = 0;
  for (let m = 0; m < maxMonths; m++) {
    if (principal + unpaid <= 0.005) break;
    unpaid += principal * r;
    const pay = Math.min(monthlyPayment, principal + unpaid);
    const toInterest = Math.min(pay, unpaid);
    unpaid -= toInterest;
    principal -= pay - toInterest;
    totalPaid += pay;
    months++;
  }
  const left = principal + unpaid;
  return { totalPaid, forgiven: Math.max(0, left), months, paidOff: left <= 0.005 };
}
The loop guard and paidOff must test principal + unpaid, not the old bal, or paid-off IBR runs silently show 20 years. Update the comment at calc.ts:164 ('Under IBR the full interest is charged') to say IBR interest is charged but not capitalized while the borrower stays on IBR. Measured in a scratch copy: $66,000.00 and $86,240 on the two reference cases, RAP and every other plan unchanged (0 differences in 30,000 to 60,000 portfolios across three runs), IBR unchanged wherever the payment covers interest, verify.mjs 180/180.

## Severity

It hits only borrowers whose IBR payment is below their monthly interest, a recognizable group with low income for their debt (household of 1: below $40,573 income for $28,101 at 5.919%, $46,740 for $38,000 at 6%, $63,120 for $60,000 at 6.53%), but for them the IBR detail and the always-visible 'costs $X more overall' line are wrong by tens of thousands of dollars every time. No recommendation or badge changed in 60,000 portfolios and the forgiven figure sits behind 'How this plan works', so it stops short of P0 under this rubric.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 3 of 3 skeptics (standards, reproduce, impact); all three kept P0 under the audit leads' scale.

<details><summary>Dissent and notes</summary>

All three skeptics kept P0 because the audit's scale treated any wrong dollar figure as P0; this report rates P1 under the stricter rubric because the harm is limited to borrowers whose payment is below their interest, the forgiven figure sits behind a disclosure, and no pick or badge changes. The strongest legal objection, that 685.202(b)(1) says the Secretary 'may' capitalize, was tested by all three and rejected: 20 U.S.C. 1098e(b)(3)(B) ties IBR capitalization to leaving IBR or reaching the standard amount, (j)(2)(ii) and (iii) would be pointless under monthly capitalization, and a federal servicer's published trigger list matches. Corrections adopted: the title's 32% to 59% was the filed sample, not a range; the fix's $86,239 came from a payment rounded to $217.17 and the exact figure is $86,240; the filed snippet, applied literally, left the loop guard (calc.ts:156) and paidOff (calc.ts:190) on bal and silently showed 20 years instead of 15.25 or 10 for paid-off runs while verify.mjs still passed, so the complete branch above replaces it; $68,422 vs $49,247 reproduces only as one loan at 5.919% (the eight-loan fixture shows $68,418 vs $49,245). The required figures hold for unsubsidized loans only: 685.209(h)(2)(i) also removes up to three years of unpaid interest on subsidized loans ($30,000 at 6% all subsidized should be $60,600; the example portfolio at $30,000 income about $47,056, assuming a pro rata payment split), and neither the app nor this fix models that.

Fix choice: the reproduce skeptic's early-return IBR branch rather than the standards skeptic's rewrite of the shared loop, because it leaves RAP's code path untouched; both gave the same IBR figures and both left RAP unchanged. Not fixed by this change: 'Interest you would pay' stays misleading ($30,000 at 6%, income $20,000 goes from $69,306 to $36,000 with $0 actually paid) until the separate least-total comparison finding lands, and that finding's interestPaid must then use toInterest in this branch. Sequencing with MONEY-06: Payoff's simulate (ranking.ts:103-105) also compounds, and MONEY-06's fix tracks IBR unpaid interest the same way, so land this first or in the same change; if the author takes MONEY-06's one-engine alternative, which deletes simulateIdr, this rule moves there. Follow-up: model or disclose the subsidized-loan relief in 685.209(h)(2)(i). Not checked: ED's Loan Simulator (login required) and studentaid.gov (timed out); the rule rests on the regulation via LII, the statute and the 2022 rule preamble (87 FR 65957 and 66000).

</details>

Merged from audit findings: `money-ibr-compounds-unpaid-interest`.
