# MONEY-08: Unpriced plans lose to priced ones when income is blank

**P0** · effort S · Money figures and eligibility

When income is blank, the recommendation ignores the unpriced IBR and RAP plans, so it tells borrowers that no open plan earns forgiveness credit, or that a $139 to $455 bill is their smallest option, while RAP or IBR is open and could cost $0 or $10.

| | |
|---|---|
| Who it hurts | A borrower who leaves income blank, as the form tells anyone not earning to do, is told a $139 to $455 bill is their smallest or cheapest option or, with a loan from July 2026 on, that no plan earns forgiveness credit, while RAP or IBR is open, counts toward PSLF and could cost $0 or $10, so drifting onto the default Tiered Standard plan looks safe. |
| Standard | 34 CFR 685.219(b)(28)(i) and (v): IBR and RAP are qualifying PSLF plans, and 685.209(c)(6) and (d)(4) keep RAP open after the July 1, 2026 cutoff. Payment floors at zero income: IBR $0 under 685.209(b)(4) and (f)(2)(i); RAP $10 under 685.209(b)(2)(i), (f)(5) and (g)(3)(ii). |
| Where | Plans tab with the income field blank (its starting value, and what the hint 'Leave blank if you are not earning yet' asks for), any portfolio without a Parent PLUS loan, every goal and employer, all widths from 320 to 1440. Affects the 'Where we would start' pick and its sentence, and the 'Lowest monthly payment', 'Lowest starting payment' and 'Least interest overall' badges. Code: rankPlans keeps only priced plans (calc.ts:499-501), then states superlatives over them (calc.ts:536-537, 541, 547-548, 554-555) and sets badges (calc.ts:602-603), although the unpriced IBR and RAP estimates are eligible and count for PSLF (calc.ts:420-432); the hero is hidden whenever the pick has no price (PlansPanel.tsx:342). |
| Code | [`src/lib/calc.ts:420`](../../src/lib/calc.ts#L420), [`src/lib/calc.ts:500`](../../src/lib/calc.ts#L500), [`src/lib/calc.ts:536`](../../src/lib/calc.ts#L536), [`src/lib/calc.ts:537`](../../src/lib/calc.ts#L537), [`src/lib/calc.ts:541`](../../src/lib/calc.ts#L541), [`src/lib/calc.ts:547`](../../src/lib/calc.ts#L547), [`src/lib/calc.ts:548`](../../src/lib/calc.ts#L548), [`src/lib/calc.ts:554`](../../src/lib/calc.ts#L554) |
| Test | `money-core.spec.mjs`: "MONEY-08 with income blank, the pick and its badges never claim a minimum over IBR and RAP, which are open but unpriced" |
| Fix proof | Validated: [`fixes/MONEY-08.patch`](../fixes/MONEY-08.patch). While IBR or RAP is open but unpriced (income blank), rankPlans no longer claims a minimum over 'the plans open to you'. Each reason says 'of the plans we can price', names the unpriced plans from the estimates and gives the zero-income floors (IBR $0, RAP $10). The 'lowest' and 'least' badges are cleared. A credit-seeking borrower whose only credit-earning plan is unpriced (RAP after the 2026 cutoff) gets RAP as the pick with an 'Add my income' button in the hero, instead of Tiered Standard and the false 'None of the plans open to you earn forgiveness credit'. An independent review found it sound, with the notes below. |
| Before applying | Merge by hand with the patches that touch rankPlans (MONEY-01, MONEY-02, MONEY-23, SCOPE-01, SCOPE-04, SCOPE-07) and the hero (MONEY-01, MONEY-04, RES-12). Keep this patch's 'of the plans we can price' wording, its unpriced guard and the one-string hero label. The translated-page crashes that remain also happen unpatched and belong to RES-12, which keys the summary line (' · $1,250 a month on RAP') where several of them occur. |
| Overlaps | Changes the same lines as [`fixes/MONEY-01.patch`](../fixes/MONEY-01.patch), [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch), [`fixes/MONEY-04.patch`](../fixes/MONEY-04.patch), [`fixes/MONEY-23.patch`](../fixes/MONEY-23.patch), [`fixes/RES-12.patch`](../fixes/RES-12.patch), [`fixes/SCOPE-01.patch`](../fixes/SCOPE-01.patch), [`fixes/SCOPE-04.patch`](../fixes/SCOPE-04.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

After the cutoff: one 2026–27 loan of $18,000 at 6.52%, income blank, goal 'Going for forgiveness' with employer Government, Nonprofit, Private sector or the default 'Not sure', or Government or Nonprofit with goal 'I do not know yet'. Hero: 'Tiered Standard, $205 a month. None of the plans open to you earn forgiveness credit, so this is the one that costs you the least overall.' The heading below reads 'All 2 plans open to you' and lists RAP, which counts toward PSLF, and the Tiered card shows 'Lowest monthly payment' and 'Least interest overall'. RAP's 'Counts toward PSLF' badge appears only after 'How this plan works' is opened, so the default view holds nothing that contradicts the hero. Typing income 1 moves the pick to RAP at $10. Before the cutoff, $40,000 at 6.53%: goal 'Lowest monthly payment' picks Graduated at $218, 'starts smaller than anything else open to you', while IBR is $0 at $20,000 income (the claim is false up to about $52,100 of income); Private sector plus forgiveness picks Standard at $455, 'the lowest payment among the plans that earn forgiveness credit', with nothing left to forgive (false up to about $78,400). Example loans ($28,101): 'Lowest monthly payment' picks Graduated at $139 with the 'Lowest starting payment' badge, against IBR $0 and RAP $10 at income $1; public service plus forgiveness picks Standard at $311 with 'After 120 qualifying payments the rest is cancelled, tax free', though Standard leaves $0.00 after payment 120. Stakes: on the PSLF path at $30,000 income RAP totals $6,000 over 120 payments against Tiered's $24,548; for a $40,000 legacy public-service borrower, Standard's $54,576 is $48,576 more than the cheapest income-driven plan over 120 payments at $30,000. Fuzz of 60,000 portfolios (15% with blank income), reproduced exactly by all three money skeptics: 793 false 'none earn', 2,072 unsupported 'smallest' and 2,315 unsupported 'lowest among credit' claims, and all 8,262 blank-income portfolios with IBR or RAP open carried a superlative. 'None earn' is false at every income tested; the 'smallest' and 'lowest among credit' claims were false in every case at incomes of $20,000 and below and in a shrinking share above that. verify.mjs:500-513 checks that the pick earns PSLF credit when a qualifying plan exists, but only at income $50,000 (verify.mjs:470) and only over priced plans (verify.mjs:507). The live bundle has the same branch.

## Required

While any open plan is unpriced, no sentence or badge may claim a minimum over 'the plans open to you': say 'of the plans we can price' and name the unpriced plans, derived from the estimates so a closed plan is never named. A borrower seeking forgiveness is never told that no open plan earns credit while RAP or IBR is open; the pick is the credit-earning plan, with a prompt for income. Output is unchanged when income is entered and for Parent PLUS portfolios, where 'None of the plans' is true.

## Reproduce

1. Open http://localhost:3100 in a fresh profile, click 'Add my first loan', pick the '2026–27' school year (the rate fills to 6.52%), enter $18,000 and click 'Save loan'.
2. Open Plans, click 'Going for forgiveness' and leave employer and income as they are. The hero reads 'Tiered Standard, $205 a month. None of the plans open to you earn forgiveness credit…', above the heading 'All 2 plans open to you', which lists RAP.
3. Type 1 in 'Yearly income, before tax': the pick becomes RAP at $10.
4. Replace the loan with a '2024–25' loan (6.53%) of $40,000, clear income and choose 'Lowest monthly payment': Graduated $218, 'starts smaller than anything else open to you', while IBR and RAP show 'Add my income'.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-08"`.

## Fix

Rank honestly while a plan is unpriced. In rankPlans, right after `eligible` (calc.ts:501):
```ts
const unpriced = estimates.filter((e) => e.eligible && e.monthlyPayment === null);
const unpricedNames = unpriced.map((e) => e.name).join(" and ");
const scope = unpriced.length ? "we can price" : "open to you";
const floors = unpriced.length > 1
  ? `IBR can be $0 a month and RAP $${RAP_MIN_MONTHLY}`
  : `RAP can be as little as $${RAP_MIN_MONTHLY} a month`;
const addIncome = unpriced.length
  ? ` ${unpricedNames} could be lower, so add your income. Not earning yet? ${floors}.`
  : "";
```
Forgiveness branch: when `unpriced.length`, the reason at calc.ts:536-537 becomes `Of the plans we can price, this is the lowest payment that earns forgiveness credit. ${unpricedNames} earn it too and could be lower, so add your income. Not earning yet? ${floors}.`, and before the final else (calc.ts:538) add:
```ts
} else if (unpriced.some(pslfOk)) {
  top = unpriced.find(pslfOk)!;
  reason = `${top.name} is the plan open to you that earns forgiveness credit, and it is priced off your income. Add yours and we will work out the payment. Not earning yet? ${floors}.`;
```
Keep 'None of the plans…' in the else, where it is now reached only when true (Parent PLUS). calc.ts:547-548: use ${scope} in place of 'open to you' and append ${addIncome}. calc.ts:554-555: 'Of the plans we can price, this one…' when unpriced, plus ${addIncome}. After calc.ts:561: `if (top.monthlyPayment === null) return "Not picked because it earns no forgiveness credit.";`. calc.ts:602-603: `isLowestPayment: !unpriced.length && e.id === lowestPayment.id`, and the same for isLowestInterest. PlansPanel.tsx: move the handler at lines 139-143 into a module-level `focusIncome()`, change the hero gate at line 342 to `{top && (`, wrap the price at lines 352-357 in `top.estimate.monthlyPayment !== null`, and at line 363 render an 'Add my income' button calling focusIncome when the pick has no price. Every string stays byte-identical when nothing is unpriced.

## Severity

Blank income is how the Plans tab starts and what its hint tells anyone not earning to keep, and in that state every borrower without a Parent PLUS loan gets an unsupported 'smallest', 'lowest' or 'least' claim in the hero and matching badges on the cards. Borrowers with a loan from July 1, 2026 on who want forgiveness are told outright that no open plan earns PSLF credit, a wrong eligibility answer one click from the defaults on desktop and phone.

Proposed P0; independent severity judges said P0, P1; final P0.

## Verification

Confirmed by 6 of 6 skeptics, 3 of 3 on each member (reproduce, standards, impact)

<details><summary>Dissent and notes</summary>

Severity: the three skeptics of ux-no-income-recommendation-wrong kept that member at P1 (each figure and the list of open plans are right; the comparison is wrong) and said a merged item inherits P0 from the post-cutoff path. The three skeptics of money-unpriced-idr-false-recommendation kept P0 but rested it only on the 'None of the plans' sentence, calling the 'smallest' and 'lowest among credit' sentences unsupported rather than always false, since they can hold for high earners who skipped the field. Fixes: all six skeptics rejected both filed fixes. The money member's hard-coded 'IBR and RAP could be lower' names closed IBR to post-cutoff borrowers (10,693 of 21,495 such cases in one trial, 3,493 in another), keeps Tiered Standard as the hero pick and button in 5,400 of 5,400 post-cutoff public-service cases, and leaves every badge; the ux member's edit of calc.ts:547 alone leaves 208 of 256 blank-income cells false. Evidence corrections: the 'Counts toward PSLF' text cited from 5-ui.log lines 73-74 was read with 'How this plan works' open, and the collapsed RAP card does not mention PSLF; 'every month on it is a month lost toward forgiveness' holds only once the borrower is in repayment and in qualifying work; the ux member's money.json .goalUnsurePublic records goal 'unsure' and only the pick, not the forgiveness sentence.

Fix choice: the money impact skeptic's tested diff, which agrees with the other two money skeptics on every behavior (names derived from the estimates, the not-earning floor stated outright, the true Parent PLUS sentence kept, badges cleared, an unpriced pick shown with 'Add my income'). It was preferred over the ux skeptics' single trailing guard because it keeps each goal's own reason and changes no string when nothing is unpriced. Measured on 40,000 new-seed portfolios, shipped against corrected: credit-seeking borrowers given a zero-credit pick while an open plan counts 2,111 to 0; badges while unpriced 14,247 to 0; closed IBR named 0; 'None of the plans' kept only in its 573 true cases; 0 differences from shipped with income typed or with Parent PLUS. verify.mjs 180 of 180, page JS 37.2 to 37.5 kB, First Load 125 kB unchanged, no new dependency, nothing leaves the device. Legacy public-service borrowers keep Standard as the pick, because it earns credit and IBR and RAP cannot be ranked without income, but the reason now says those two earn it too and could be lower. The copy is a proposal for the author. The other half of ux-no-income-recommendation-wrong, that a typed 0 is ignored, is MONEY-09; once that lands a non-earner can price IBR and RAP, but this guard still matters for anyone who skips the field. Separate follow-up: the 'After 120 qualifying payments the rest is cancelled' sentence at calc.ts:536 also shows on Standard with an income entered (for example $100,000 and $150,000 in public service), where Standard leaves nothing to cancel; two ux skeptics suggest swapping it when the pick's payment is at least pslfBenchmark - 1. How many borrowers reach this state cannot be measured, because the app has no analytics by design.

</details>

Merged from audit findings: `money-unpriced-idr-false-recommendation`, `ux-no-income-recommendation-wrong`.
