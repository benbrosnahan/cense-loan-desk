# MONEY-21: Households over 8 priced as 8

**P1** · effort S · Money figures and eligibility

Households larger than 8 can only pick '8 people or more' and are priced as 8, so their income-driven payments show too high (RAP $117 a month instead of $17 for 10 people at $80,000) and the recommended plan can change.

| | |
|---|---|
| Who it hurts | A borrower in a household of 9 or more is told RAP and IBR cost more than they would (a family of 10 at $80,000 sees $117 a month instead of $17) and can be steered to a different plan, such as Standard instead of RAP. |
| Standard | HHS 2026 poverty guidelines (ASPE), 48 contiguous states and DC: $15,960 for 1 person, $55,720 for 8, and $5,680 for each additional person (https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines). The app's IBR formula uses 1.5 times that guideline (calc.ts:197) and its RAP rule takes $50 a month off per dependent (plans.ts:53), both for any household size. |
| Where | Repayment plans tab, the 'People in your household' select in the income card, at every width. The overstated payment shows on the RAP and IBR cards and in the 'Where we would start' pick, and once RAP or IBR is chosen also in the summary line under 'You owe' and on Payoff. Only the select stops at 8: getPovertyLine (plans.ts:26) and rapMonthly (calc.ts:204) take any size. |
| Code | [`src/app/page.tsx:768`](../../src/app/page.tsx#L768), [`src/app/page.tsx:771`](../../src/app/page.tsx#L771), [`src/data/plans.ts:26`](../../src/data/plans.ts#L26), [`src/lib/calc.ts:197`](../../src/lib/calc.ts#L197), [`src/lib/calc.ts:204`](../../src/lib/calc.ts#L204) |
| Test | `money-edges.spec.mjs`: "MONEY-21 a household of 10 can enter its size, and RAP is priced for 10 people" |
| Fix proof | Validated: [`fixes/MONEY-21.patch`](../fixes/MONEY-21.patch). The 'People in your household' select now offers 1 to 20 people, with 'or more' on the last option, instead of stopping at '8 people or more'. Households of 9 and up are priced at their real size. The engine already took any size, so this changes the option list only. An independent review found it sound. |
| Overlaps | Changes the same lines as [`fixes/RES-01.patch`](../fixes/RES-01.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

One $60,000 loan at 6%; the engine and separate hand arithmetic agree. At $80,000 income RAP is $116.67 a month at 8 people, $66.67 at 9, $16.67 at 10 and the $10.00 floor at 11 and 12. At $100,000 IBR is $136.83, $65.83 and $0 at 8, 9 and 10 (RAP $400, $350 and $300); at $150,000 IBR is $553.50 at 8 and $269.50 at 12 (RAP $900 and $700). At $50,000 nothing changes, since both plans already sit on their floors. Through the UI at $80,000, '8 people or more' shows RAP $117 a month and $42,000 over 30 years, not picked; a stored household of 10 shows $17 and $6,000 and makes RAP the pick. Across 480 combinations (8 incomes from $40,000 to $200,000, 5 balances from $20,000 to $150,000 at 6%, 4 goals, households of 9, 10 and 12) the top pick differs from the capped-at-8 pick in 52; for example, $80,000 income, $20,000 at 6%, goal least total, household 9: Standard when priced as 8, RAP at the real size. POVERTY_2026 and the $5,680 increment in plans.ts match the ASPE 2026 table.

## Required

Households of 9 or more can enter their real size and are priced at it: 10 people at $80,000 see RAP $17 a month.

## Reproduce

1. Open http://localhost:3100, click 'Add my first loan', pick a school year before 2026–27, type 60000 in 'What you owe on it today' and 6 in 'Interest rate', and click 'Save loan'.
2. Open Repayment plans, choose 'Private sector' under 'Who do you work for, or expect to?', and type 80000 in 'Yearly income, before tax'.
3. Open 'People in your household': the last choice is '8 people or more'. Pick it. The RAP card shows $117 a month and 'Not picked'.
4. To see what a family of 10 should get, set householdSize to 10 in localStorage 'cense.loandesk.profile.v2' and reload: RAP shows $17 and becomes 'Our pick' (the select then shows 'Just me', because no option matches 10).

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-21"`.

## Fix

src/app/page.tsx:768 and :771: offer sizes up to 12 and move 'or more' to the last one. No engine change.
```tsx
{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
  <option key={n} value={n}>
    {n === 1 ? "Just me" : `${n} people`}
    {n === 12 ? " or more" : ""}
  </option>
))}
```

## Severity

Borrowers in households of 9 or more, a small but recognizable group, hit this every time their income is above the plans' floors: at $80,000 a family of 10 sees RAP $117 instead of $17, and the top pick changes in 52 of 480 tested cases. The '8 people or more' label sits on the input, not on the payment, and never says larger households are priced as 8, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 1 of 1 skeptic (reproduce), who raised the severity to P2

<details><summary>Dissent and notes</summary>

Severity: the filer set P3 ('rare, and the label is candid about the cap'). The skeptic raised it to P2 because it shows a wrong dollar figure ($117 where $17 is right) and changes the recommendation, which the filing did not mention, and called 'candid about the cap' generous, since nothing says larger households are priced as 8; the skeptic held it well below P0 for rarity and because the error runs in the conservative direction. This report sets P1 because the stricter rubric places a decision-changing wrong figure confined to a recognizable group at P1, and the limitation is not stated where the payment is shown. The skeptic also notes the fix still caps at 12, so households of 13 or more keep the same defect on a smaller scale.

Fix choice: the filer's 12-option list, the only fix proposed, checked by the skeptic on a scratch copy (12 options ending '12 people or more'; choosing 10 at $80,000 shows RAP $17 and stores 10; verify.mjs 180 of 180). Any fixed list leaves households above its top priced at the top; extending it is the same one-line change, while a number input would remove the cap but needs its own validation. Do not shorten the list later: a stored size with no matching option makes the select show 'Just me' while the cards price the stored size, as seeding households of 9, 10 and 12 showed. SCOPE-02 (married borrowers) edits the label, hint and RAP dependents line of this same field (page.tsx:751-753, calc.ts:204); the option list does not conflict with it, but land them together so the wording agrees.

</details>

Merged from audit findings: `money-household-8-plus`.
