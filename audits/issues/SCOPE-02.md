# SCOPE-02: Married borrowers cannot be priced correctly

**P1** · effort M · Borrowers the model does not fit yet

Married borrowers who file jointly cannot be priced correctly: one household number sets both IBR family size and RAP dependents, and a spouse's own federal loans cannot be entered, so IBR or RAP is off by up to $71 a month (much more when both spouses borrowed) and the recommended plan can flip.

| | |
|---|---|
| Who it hurts | A married borrower filing jointly who follows the hint sees IBR up to $71 a month too high and can be steered to RAP: in the example, a public-service borrower pays $6,460 more over 120 payments before forgiveness. One who counts the spouse instead sees RAP up to $50 too low. A couple who both borrowed see IBR and RAP far above the rule (RAP $640 against $345 in the example) and can be steered to Standard, which forgives nothing under PSLF and costs $7,530 to $18,650 more per spouse. |
| Standard | 34 CFR 685.209(b)(3), (b)(5), (b)(9)(i)(B), (e)(1)(i)(B), (e)(2)(i), (f)(5)(ii), (g)(1)(i), (g)(3)(i); 26 U.S.C. 152(b)(2) and (d)(2)(H) |
| Where | Plans tab: the 'People in your household' select and its hint, the income field, the IBR and RAP cards and the 'Where we would start' box. Any viewport, because the engine does not branch on width; read at 1280x1000, 390x844 and 390x900 on localhost:3100. |
| Code | [`src/app/page.tsx:752`](../../src/app/page.tsx#L752), [`src/app/page.tsx:753`](../../src/app/page.tsx#L753), [`src/app/page.tsx:724`](../../src/app/page.tsx#L724), [`src/app/page.tsx:725`](../../src/app/page.tsx#L725), [`src/lib/calc.ts:197`](../../src/lib/calc.ts#L197), [`src/lib/calc.ts:204`](../../src/lib/calc.ts#L204), [`src/lib/calc.ts:272`](../../src/lib/calc.ts#L272), [`src/lib/calc.ts:437`](../../src/lib/calc.ts#L437) |
| Test | `scope.spec.mjs`: "SCOPE-02 a married couple filing jointly can be priced by the rule: IBR $163 with RAP $217, and the spouse's own loans count" |
| Fix proof | Validated: [`fixes/SCOPE-02.patch`](../fixes/SCOPE-02.patch). Adds an 'I am married and we file taxes jointly' checkbox under the household question and, while it is ticked, an optional field for what the spouse owes in federal student loans. A joint filer's spouse is added to IBR's family size only (RAP keeps counting tax dependents, which a spouse never is), the income field then asks for the couple's combined income, and IBR and RAP are multiplied by the borrower's share of the couple's loans (34 CFR 685.209(b)(9)(i)(B), (b)(3), (g)(1)(i), (g)(3)(i)). An independent review found it sound, with the notes below. |
| Before applying | Ready to apply. When merging with SCOPE-07 or MONEY-13, keep the spouse's +1 in whichever ibrMonthly survives. Consider the record's relabel: 'People in your household' now sits above a hint saying not to count the spouse, and a joint filer who already counted the spouse there and also ticks the box gets an IBR family one too large. |
| Overlaps | Changes the same lines as [`fixes/MONEY-02.patch`](../fixes/MONEY-02.patch), [`fixes/MONEY-03.patch`](../fixes/MONEY-03.patch), [`fixes/MONEY-06.patch`](../fixes/MONEY-06.patch), [`fixes/MONEY-07.patch`](../fixes/MONEY-07.patch), [`fixes/MONEY-09.patch`](../fixes/MONEY-09.patch), [`fixes/MONEY-11.patch`](../fixes/MONEY-11.patch), [`fixes/MONEY-13.patch`](../fixes/MONEY-13.patch), [`fixes/RES-05.patch`](../fixes/RES-05.patch), [`fixes/SCOPE-03.patch`](../fixes/SCOPE-03.patch), [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch) and [`fixes/SCOPE-07.patch`](../fixes/SCOPE-07.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Example loans ($28,101 at 5.9187%), married filing jointly, no children, combined AGI $52,000; the rule gives IBR $162.83 (family size 2) and RAP $216.67 (0 dependents). Household 1, as the hint 'You, plus anyone you claim as a dependent.' directs: IBR $233.83, $71.00 too high, with the card reading 'In total, over 15.3 yr $42,692' against the rule's 20 yr, $39,080 paid and $17,012 forgiven; RAP $216.67 is right. Household 2, counting the spouse: IBR $162.83 is right; RAP $166.67, $50.00 too low, with 'over 27.8 yr $55,608' against 17.3 yr and $44,953. None of the 8 select values prices both. With a forgiveness goal (any employer), household 1 leads with 'RAP $217 a month' and says IBR 'costs $17 more a month', but under the rule IBR is $53.83 cheaper and 120 qualifying payments cost $26,000 against $19,540, $6,460 more. On these loans both entries pick RAP where the rule picks IBR at $38k-$40k, $45k-$50k and $53k-$60k, and at $67k-$69k household 1 picks Standard and household 2 RAP. A joint filer with 1 or 2 children shows the same $71.00 / $50.00 split; the controls (an unmarried parent, a married borrower filing separately) are priced right. Sweep of 4,344 cases (3 portfolios, combined AGI $20k-$200k, government and private, 4 goals): household 1 leaves IBR up to $71.00 high in 2,176 and prices both right in the other 2,168 (IBR $0 or capped at both family sizes); household 2 leaves RAP $6.67 to $50.00 low in all 4,344; the top pick differs from the rule's in 575 (household 1), 391 (household 2) and 688 (either). Spouse with own loans: combined AGI $92,000 and the spouse owing $28,101, the rule gives RAP $345.00 and IBR $248.08 ($155.42 under the literal cap-then-share reading); the page shows IBR $310.83 with RAP $640.00 at household 2 or $690.00 at household 1, and for government with a forgiveness goal at household 2 leads with 'Standard $311 a month' (IBR ties Standard at the cap and the tie goes to Standard), which repays everything and forgives nothing: $7,530 to $18,650 more per spouse over 120 payments than IBR. Combined $60,000 with the spouse owing $14,050: the rule gives IBR $153.00 and RAP $166.67; household 2 shows $229.50 and $200.00. No household and income entry yields both rule figures (300,000 incomes x 8 households). With every disclosure open, the Plans tab says spouse, married, joint, filing status, AGI or tax return 0 times.

## Required

34 CFR 685.209(b)(9) defines family size 'for all IDR plans except the Repayment Assistance Plan' and counts, under (i)(B), the spouse of a married borrower filing jointly, so IBR family size is 2 here. (b)(3) limits RAP dependents to IRC 152 dependents claimed on the return, and 26 U.S.C. 152(b)(2) and (d)(2)(H) mean a spouse never is one, so RAP dependents are 0 and (f)(5)(ii) subtracts nothing. (e)(1)(i)(B) uses the couple's combined income; when it does, (e)(2)(i) brings in the spouse's eligible loans ((b)(5): not parent PLUS or excepted consolidation loans), and (g)(1)(i) and (g)(3)(i)(A) multiply the IBR and RAP payment by the borrower's share of the couple's balance, with RAP's $10 floor applied after ((g)(3)(i)(B)). Correct figures: $52,000 joint, no children, spouse without loans: IBR $162.83 and RAP $216.67, with IBR first for a forgiveness goal. $60,000 joint with the spouse owing $14,050: IBR $153.00 and RAP $166.67.

## Reproduce

1. Open http://localhost:3100 and click 'Look around with example loans' ($28,101).
2. Open the Plans tab. Click 'Going for forgiveness' and 'Government'.
3. Type 52000 in 'Yearly income, before tax' (a one-earner married couple filing jointly) and leave household at 'Just me', as the hint 'You, plus anyone you claim as a dependent.' directs; a spouse is never a dependent.
4. The 'Where we would start' box reads 'RAP $217 a month'. The IBR card reads 'Per month $234 ... In total, over 15.3 yr $42,692 ... Not picked because it costs $17 more a month.'
5. Change household to '2 people': the box becomes 'IBR $163 a month' and the RAP card drops to $167, 'over 27.8 yr $55,608'. The rule for this couple is IBR $163 and RAP $217 at once; no household value shows both.
6. Spouse with loans: type 92000 and keep '2 people'. IBR shows $311, RAP $640, and the box reads 'Standard $311 a month'. If the spouse owes $28,101, the rule gives RAP $345 and IBR $248 (or $155), with IBR the pick. There is no field for the spouse's loans.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SCOPE-02"`.

## Fix

Part 1: the spouse counts in IBR family size only.
- src/types/index.ts:110-130: add `filesJointly: boolean` and `spouseLoanBalance: number` to Profile, and `filesJointly: false, spouseLoanBalance: 0` to DEFAULT_PROFILE. storage.ts:47 spreads the defaults, so saved v2 profiles price exactly as today.
- src/app/page.tsx:752-753: keep the select meaning what its hint already says. label="You and your dependents", hint="You, plus anyone you claim as a dependent on your tax return. Do not count your spouse here."
- Under the select, a checkbox 'I am married and we file taxes jointly':
  onChange={(e) => setProfile((p) => ({ ...p, filesJointly: e.target.checked }))}
  It leaves householdSize alone, so ticking and unticking is symmetric.
- src/lib/calc.ts:197:
  profile.income - 1.5 * getPovertyLine((profile.householdSize || 1) + (profile.filesJointly ? 1 : 0))
- src/lib/calc.ts:204 stays as it is: a spouse is never an IRC 152 dependent.
- src/app/page.tsx:724-725, while filesJointly is true: label "Combined AGI on your joint return", hint "Your combined income with your spouse: the adjusted gross income on your joint return."
Part 2: the spouse's loans, shown only while filesJointly is true.
- Field 'Your spouse's federal student loan balance', hint 'Their Direct and FFEL student loans, not Parent PLUS loans they took for a child.' Parse it the way LoanForm does, parseNumber(formatDollarsInput(e.target.value)); the income field's formatWholeDollars would read '$28,101.37' as 2,810,137.
- src/lib/calc.ts, after line 272:
  const share = profile.filesJointly && profile.spouseLoanBalance > 0
    ? balance / (balance + profile.spouseLoanBalance)
    : 1;
- src/lib/calc.ts:437:
  const pay = Math.min(ibrMonthly(profile) * share, cap); // 685.209(g)(1)(i)
- src/lib/calc.ts:456:
  const pay = Math.max(RAP_MIN_MONTHLY, rapMonthly(profile) * share); // (g)(3)(i)
- Keep simulateIdr on the borrower's own balance, which is what (g) scales.

## Severity

Limited to a recognizable group, married borrowers filing jointly, but systematic for them: where IBR depends on family size no household entry prices both plans (the hint's entry leaves IBR up to $71.00 high in 2,176 of 4,344 swept cases, the other leaves RAP $6.67 to $50.00 low in all 4,344), and the recommended plan differs from the rule's in 688 of 4,344. Nothing on the page mentions marriage or a spouse, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (standards, reproduce, impact on each); under the audit leads' scale the household filing kept P0 and the spouse-loans filing kept P1.

<details><summary>Dissent and notes</summary>

Severity: the household member was filed and confirmed as P0 and the spouse-loans member as P1; this report's stricter rubric gives the merged issue P1 because it reaches only married joint filers. Scope: 'no entry prices both plans' and 'every married borrower sees IBR $71 high or RAP $50 low' hold only where IBR depends on family size (combined AGI about $24k to $69k on the example loans); household 1 prices both right in the other 2,168 of 4,344 swept cases, and the errors are up to $71.00 and $6.67 to $50.00 (standards, impact, reproduce). Household fix: the filer's checkbox raised householdSize to at least 2 and subtracted the spouse from RAP dependents. The impact skeptic measured it regressing an unmarried user who ticks then unticks (IBR $162.83 against the rule's $233.83, pick flips to IBR) and a joint filer with one child who had followed the old hint (IBR $162.83 against $91.83, RAP $216.67 against $166.67); the standards and reproduce skeptics kept the filer's approach but added a family-size clamp. IBR order with a spouse share: the filer's Math.min(ibrMonthly(profile), cap) * share gives $155.42 in the $92,000 case; the standards skeptic recommends Math.min(ibrMonthly(profile) * share, cap), $248.08, which the pre-2023 685.221 method also gives; the reproduce and impact skeptics found the current text ambiguous and could not settle it from studentaid.gov. Test values: the filer's RAP 345.00 and 690.00 assertions hold only once the household change is in; the share change alone gives 320.00 and 640.00 (all three spouse-loans skeptics).

Household fix chosen: the impact skeptic's version, which adds the spouse to IBR family size only and keeps the select meaning 'you plus your dependents', as the shipped hint already says. It needs no clamp, no stored householdSize changes meaning, ticking and unticking is symmetric, and on a patched copy it gave 0 mismatches against the rule over the 4,344-case sweep, 0 output changes on 7,500 profiles without the flag, and 180 of 180 verify.mjs assertions. Its remaining weak spot is a returning joint filer who counted the spouse in the select despite the hint; the relabel and 'Do not count your spouse here' target that case. IBR order chosen: share before cap, because it is never lower than the literal reading, equals it whenever the cap does not bind, and follows the code's own rule against 'a friendlier number we could not defend' (calc.ts:138-140); keep the comment on that line. The combined-AGI relabel must ship with the share, not after it: a user who ticks the box but types only their own pay gets the payment cut twice (IBR $81.42 and RAP $108.33 against the rule's $155.42-$248.08 and $345.00). Ship with SCOPE-03, which relabels the income field as AGI. Related issues touching the same lines: MONEY-14 bands IBR to $0/$10 at calc.ts:437; apply that band after the share (const adj = Math.min(ibrMonthly(profile) * share, cap); const pay = adj < 5 ? 0 : adj < 10 ? 10 : adj;), because (g)(1)(iii) bands the adjusted payment and banding before the share gave 298 of 903 low-income points wrong. MONEY-13 changes ibrMonthly at calc.ts:194-199 for pre-2014 borrowers, and MONEY-21 changes the household options at page.tsx:768-771.

</details>

Merged from audit findings: `gap-married-household-one-select`, `gap-joint-filer-spouse-loans`.
