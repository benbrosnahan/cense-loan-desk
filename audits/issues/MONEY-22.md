# MONEY-22: 0% rate rejected

**P3** · effort S · Money figures and eligibility

The interest rate field rejects 0% while its error says "a number between 0 and 25", so a borrower with a 0% loan cannot save it and is not told why.

| | |
|---|---|
| Who it hurts | A borrower with a 0% loan cannot record it at 0%, and the error message tells them 0 is allowed; rare. |
| Standard | None (form validation copy). |
| Where | Loans tab: the add-loan form ('Add my first loan' or 'Add a loan') and the Edit form, 'Interest rate' field. Same at every width. |
| Code | [`src/components/loans/LoanForm.tsx:180`](../../src/components/loans/LoanForm.tsx#L180), [`src/components/loans/LoanForm.tsx:178`](../../src/components/loans/LoanForm.tsx#L178), [`src/components/loans/LoanForm.tsx:95`](../../src/components/loans/LoanForm.tsx#L95), [`src/lib/utils.ts:129`](../../src/lib/utils.ts#L129), [`README.md:145`](../../README.md#L145) |
| Test | `money-edges.spec.mjs`: "MONEY-22 a 0% rate is either saved as 0% or refused with a message that says why" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Production build on :3100 with real typing: '0' and '0.00' show 'Enter the interest rate, a number between 0 and 25.', set aria-invalid to true and store nothing. Blank, '.' and '25.01' are rejected the same way; '0.01' and '25' save. The check at LoanForm.tsx:178 is `rate > 0 && rate <= 25`. README.md:145 lists 'a 0% loan' among the walked edge cases, but today's form cannot create one. A 0% loan seeded into storage renders, and the fixed plans price it correctly ($30,000: Standard $250 a month, Extended $100, Tiered Standard $166.67 over 15 years, all matching hand division). Graduated does not: $30,000 at 0% shows $25 to start and $18,600 in total, and the engine gives the same at 0.01% and 0.5%, which the form already accepts (covered by MONEY-04).

## Required

The error has to match the rule: either accept 0 while still rejecting blank and malformed input, or say the rate must be above 0.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Add my first loan'.
2. Tap the 2022–23 school-year shortcut and type 1,000 in 'What you owe on it today'.
3. Clear 'Interest rate', type 0 and click 'Save loan': the field is marked invalid with 'Enter the interest rate, a number between 0 and 25.' and nothing is saved.
4. Type 0.01 instead and save: the loan is saved.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-22"`.

## Fix

Reword the error at LoanForm.tsx:180 so it matches the check at :178, which stays as it is: `rate: rate > 0 && rate <= 25 ? null : "Enter the interest rate, a number above 0 and up to 25.",`. One string, no logic change.

## Severity

Only a borrower with a loan at exactly 0% hits this, which the lead rated rare, and nothing the app shows about their loans is wrong. The cost is a contradictory error message on one field, so it is polish.

## Verification

Confirmed by 1 of 1 skeptic (reproduce); P3 kept, filed fix rejected as unsafe.

<details><summary>Dissent and notes</summary>

None on the defect or P3. The skeptic rejected the filed fix (`f.rate.trim() !== '' && rate >= 0 && rate <= 25`). Built literally on a scratch copy, it saved '.', '..', '6..53' and '6.5.3' as a 0% loan, all of which the shipped build rejects, because parseNumber returns 0 for anything Number() cannot parse (utils.ts:129-132). It also missed LoanForm.tsx:95, where `initial.rate || ""` blanks a saved 0% rate in Edit, so Save changes is blocked until 0 is retyped (a balance edit from $30,000 to $30,100 did not save). The finder's 'the engine handles 0% correctly' holds only for the fixed-payment plans, not Graduated.

Fix choice: the finder allowed either remedy, and rewording carries none of the risk above. If 0% must be accepted, make both of the skeptic's tested changes: LoanForm.tsx:178 `f.rate.trim() !== "" && Number.isFinite(Number(f.rate)) && rate >= 0 && rate <= 25` and LoanForm.tsx:95 `rate: String(initial.rate ?? "")`. On a scratch build that saved 0, 0.0, 0., .5, 6.53 and 25, rejected blank, ., .., 6..53, 6.5.3 and 25.01, reopened a stored 0% loan showing 0 and saved it, and verify.mjs passed 180 of 180. Ship it only after MONEY-04 fixes Graduated at low rates ($30,000 at 0% shows $18,600 in total), and guard the Payoff sentence 'pay about $0 less in interest' that a 0% loan produces. The README's 0% sweep case (README.md:145) cannot be reproduced through today's form.

</details>

Merged from audit findings: `money-zero-rate-rejected`.
