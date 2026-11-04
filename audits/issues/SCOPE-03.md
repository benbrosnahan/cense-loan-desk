# SCOPE-03: Income asked as gross pay, plans priced on AGI

**P0** · effort S · Borrowers the model does not fit yet

The income field asks for gross pay ('Yearly income, before tax') but IBR and RAP are priced on adjusted gross income, so borrowers with pre-tax 401(k) or health deductions see both payments too high and sometimes the wrong recommended plan.

| | |
|---|---|
| Who it hurts | Borrowers with pre-tax payroll deductions see IBR and RAP too high: IBR by $8.33 a month for every $1,000 deducted while it sits between $0 and its cap, RAP by more at bracket edges, and at $5,000 of deductions the recommended plan changes in 281 of 3,024 swept cases. A married borrower filing jointly with an earning spouse who enters only their own pay sees payments hundreds of dollars a month too low, and can be steered to a plan that costs $379 a month more than the right one. |
| Standard | 34 CFR 685.209(b)(1)(ii), (b)(2), (b)(4)(ii), (b)(10)(i), (e)(1)(i)(B); IRS General Instructions for Forms W-2 and W-3, box 1 |
| Where | Plans tab: the 'Yearly income, before tax' field (#income), every IBR and RAP figure and pick built on it, and the IBR and RAP plan copy. Any viewport; read at 1280x1000 on localhost:3100. The live chunk page-eae479cdacf15b74.js ships the same label and hint. |
| Code | [`src/app/page.tsx:724`](../../src/app/page.tsx#L724), [`src/app/page.tsx:725`](../../src/app/page.tsx#L725), [`src/types/index.ts:111`](../../src/types/index.ts#L111), [`src/lib/calc.ts:197`](../../src/lib/calc.ts#L197), [`src/lib/calc.ts:203`](../../src/lib/calc.ts#L203), [`src/data/plans.ts:47`](../../src/data/plans.ts#L47), [`src/data/plans.ts:55`](../../src/data/plans.ts#L55), [`src/data/plans.ts:148`](../../src/data/plans.ts#L148) |
| Test | `scope.spec.mjs`: "SCOPE-03 the income question asks for adjusted gross income, the figure IBR and RAP are priced on" |

## Measured

Single filer, household 1, example loans, $5,000 of pre-tax deductions ($3,000 to a 401(k), $2,000 of cafeteria-plan health premiums). Entered as gross $60,000, as the label asks: IBR $300.50 and RAP $250.00 (cards $301 and $250; totals $37,774 over 10.5 yr and $41,074 over 13.8 yr). Entered as AGI $55,000: IBR $258.83 and RAP $229.17 ($40,337 over 13 yr, $43,242 over 15.8 yr). So the gross entry is $41.67 and $20.83 a month too high, and its totals look $2,563 and $2,168 smaller. Gross $61,000 against AGI $56,000 crosses a RAP bracket: RAP $305.00 against $233.33, $71.67 too high. Gross $38,000 against AGI $33,000, Government, forgiveness goal: the page leads with 'RAP $95 a month' and says IBR 'costs $22 more a month'; on AGI it leads with IBR at $75.50 and RAP is $82.50, so following the gross-based pick costs $7.00 a month, $840 over 120 PSLF payments. Sweep of 3,024 cases per deduction level (3 portfolios, gross $25k-$150k, government and private, 4 goals): at $5,000, RAP is $8.33 to $125.00 too high in every case, IBR is up to $41.67 too high in 1,928, the pick changes in 281, and the median monthly gap between the page's pick and the AGI pick is $18.67; the pick changes in 134 cases at $2,500 and 524 at $10,000 (886 of 9,072 at $5,000 with households 2-4 added). Joint filer, no children, who enters only their own $52,000 when the couple's AGI is $92,000: IBR $233.83 and RAP $216.67 against the rule's $310.83 and $690.00, and the page picks RAP, which under the rule costs $379.17 a month more than the cheapest PSLF plan. With $100k of grad loans and incomes of $35,000 and $25,000: household 1 shows IBR $92.17 and RAP $87.50, household 2 shows $21.17 and $37.50, against the rule's $229.50 and $250.00. Page text: label 'Yearly income, before tax', hint 'Leave blank if you are not earning yet. We will skip the plans priced off income.' With every disclosure on all four tabs open: 0 hits for AGI, adjusted gross, spouse, married, jointly, filing status, tax return, 1040, pre-tax or 401(k). types/index.ts:111 documents the field as 'Annual gross income', while plans.ts:47 keys RAP 'on adjusted gross income'. Given AGI, the engine is right: every AGI run equals an independent reference.

## Required

34 CFR 685.209(b)(10)(i) defines income as the borrower's AGI plus the spouse's where applicable. (b)(1)(ii) takes IBR's 10% of the borrower's 'adjusted gross income, and the borrower's spouse's adjusted gross income if married filing jointly' above 150% of the poverty guideline ((b)(4)(ii)); (b)(2) keys every RAP bracket on AGI; (e)(1)(i)(B) combines both incomes for a joint filer. The IRS W-2 instructions leave 401(k) and 403(b) elective deferrals out of box 1 and count section 125 cafeteria-plan benefits only when taken as cash, so that pay never reaches AGI. The $60,000 earner above should be priced on $55,000: IBR $258.83, RAP $229.17.

## Reproduce

1. Open http://localhost:3100 (or https://cense-loan-desk.vercel.app/) and click 'Look around with example loans'.
2. Open the Plans tab. Click 'I do not know yet' and 'Private sector'. Type 60000 in 'Yearly income, before tax' (someone paid $60,000 who puts $3,000 into a 401(k) and $2,000 into pre-tax health premiums). IBR shows $301 and RAP $250.
3. Type 55000, that person's AGI: IBR $259, RAP $229.
4. Click 'Going for forgiveness' and 'Government', and type 38000: the 'Where we would start' box reads 'RAP $95 a month' and the IBR card says 'costs $22 more a month'. Type 33000, the AGI after the same $5,000 of deductions: the box becomes 'IBR $76 a month'.
5. Open every disclosure on all four tabs and search for AGI, pre-tax, spouse or jointly: 0 hits.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SCOPE-03"`.

## Fix

Ask for the number the rule uses. Given AGI the engine is already right, so this is wording only.
- src/app/page.tsx:724:
  label="Adjusted gross income (AGI)"
- src/app/page.tsx:725:
  hint="Your yearly pay before tax, minus pre-tax 401(k), 403(b), health and HSA deductions. If it has not changed since you last filed, it is the adjusted gross income line on your Form 1040. Leave blank if you are not earning yet."
- src/types/index.ts:111:
  /** Annual adjusted gross income (AGI): the borrower's, plus the spouse's on a joint return. 0 = not supplied, which hides income-driven estimates. */
- src/data/plans.ts:148: 'meaning your adjusted gross income above 150% of the poverty line' in place of 'meaning what you earn above 150% of the poverty line'.
- src/data/plans.ts:189: 'Your payment is a slice of your adjusted gross income (AGI), 1% to 10%, ...' in place of 'a slice of your total income'.
- src/data/plans.ts:200: 'Charges a percentage of your whole AGI, not just income above the poverty floor'.
Do not hard-code a Form 1040 line number. The married-filing-jointly instruction (use combined AGI) belongs to SCOPE-02's checkbox and ships with it.

## Severity

Any working borrower with pre-tax 401(k), 403(b), health or HSA payroll deductions who answers the field as worded gets wrong figures: at $5,000 of deductions RAP is too high in all 3,024 swept cases and IBR in 1,928, and the recommended plan changes in 134, 281 or 524 of 3,024 cases at $2,500, $5,000 or $10,000. Joint filers who type only their own pay see payments hundreds of dollars a month too low, and nothing on the page mentions AGI, pre-tax deductions or a spouse.

Proposed P0; independent severity judges said P0, P0; final P0.

## Verification

Confirmed by 3 of 3 skeptics (standards, impact, reproduce), on the local build and the live chunk; all three kept P0.

<details><summary>Dissent and notes</summary>

Hint anchor: the filer's hint sent users to 'Line 11 of your latest federal tax return'. The standards and reproduce skeptics kept the return as the anchor but corrected the line (line 11a on the 2025 Form 1040, line 11 on 2024 and earlier). The impact skeptic measured that any 'latest return' anchor misprices a recent graduate whose return predates the job ($9,000 AGI on the return against $55,000 this year: IBR $0 with $91,527 forgiven, RAP $10, pick RAP instead of Standard) and proposed describing this year's AGI instead, which this issue adopts. Joint-filer sentence: the filer would add 'Filing jointly? Use the total for both of you' now; all three skeptics found that, without the household and spouse-loans fixes in SCOPE-02, it leaves IBR $71.00 too high at household 1 or RAP $50.00 too low at household 2, and widens the error for couples who both borrowed (IBR $155.42 and RAP $345.00 off with the hint, against $78.42 and $128.33 today). Measured text: the filer's $100k example paired IBR $21.17 (household 2) with RAP $87.50 (household 1), and no single page state shows both (standards, reproduce). Impact text: 'anyone with pre-tax deductions' sees IBR too high only while IBR is between $0 and its cap (1,928 of 3,024 cases), and 'a married borrower' should read 'a married borrower filing jointly with an earning spouse' (impact).

Fix chosen: the impact skeptic's wording, because it asks for this year's AGI without tying users to a past return or to a form line number that changes by tax year, and the engine needs no change. Ship it with SCOPE-02: a joint filer who reads 'adjusted gross income' may copy the combined figure from a joint 1040, which today's household field cannot price, and SCOPE-02's checkbox is where the combined-AGI instruction belongs. Related issues touching the same lines: MONEY-09 also rewrites the hint at page.tsx:725 and the comment at types/index.ts:111 to keep a typed $0 apart from blank, so merge the two hint changes into one string; MONEY-13 also edits the IBR summary at plans.ts:148. Wording only, so privacy and performance are unaffected.

</details>

Merged from audit findings: `gap-income-gross-not-agi`.
