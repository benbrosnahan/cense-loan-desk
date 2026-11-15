# MONEY-17: Rate table goes stale in July 2027

**P2** · effort S · Money figures and eligibility

The loan form fills in 6.52% and calls it the published rate for any payout date after June 30, 2027, so from July 2027 every new Subsidized or Unsubsidized loan gets last year's rate under a false label.

| | |
|---|---|
| Who it hurts | Today the false label reaches only a mistyped or future payout date. From July 1, 2027, every borrower adding a 2027–28 Subsidized or Unsubsidized loan gets the 2026–27 rate presented as the published rate for their year, and every plan and payoff figure for that loan is built on it, unless someone has updated the table by then; nothing in the repo prompts that update. |
| Standard | 34 CFR 685.202(a)(7): the undergraduate rate for loans first disbursed in each July-to-June year is set on the June 1 before that year. FSA GENERAL-26-33 (June 4, 2026) publishes 6.52% only for loans first disbursed from July 1, 2026 to June 30, 2027. |
| Where | Loans tab, the 'Add my first loan' / 'Add a loan' form: 'Date it was paid out' and the 'Interest rate' field and its hint. Subsidized and Unsubsidized only; Grad PLUS and Parent PLUS stay blank. Any width; measured at 1280x1000 and 1280x900 on the local build, plus one live load. |
| Code | [`src/data/seed.ts:136`](../../src/data/seed.ts#L136), [`src/data/seed.ts:128`](../../src/data/seed.ts#L128), [`src/data/seed.ts:146`](../../src/data/seed.ts#L146), [`src/components/loans/LoanForm.tsx:296`](../../src/components/loans/LoanForm.tsx#L296), [`src/components/loans/LoanForm.tsx:357`](../../src/components/loans/LoanForm.tsx#L357), [`src/components/loans/LoanForm.tsx:362`](../../src/components/loans/LoanForm.tsx#L362) |
| Test | `money-edges.spec.mjs`: "MONEY-17 the loan form never calls a filled-in rate published for an award year that has no published rate" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Payout date 2027-08-20 with the browser clock at 2027-07-15, and the same with today's clock: rate field 6.52, hint 'We filled in the published undergraduate rate for 2027–28. Change it if yours is different.' The school-year shortcuts stop at 2026–27. 2030-09-01 says 2030–31, 2099-01-01 says 2098–99 and 12/31/2099 says 2099–00, all at 6.52; 2027-06-30 correctly says 2026–27. A typed 7.01 with 2030-09-01 shows 'The published undergraduate rate for 2030–31 was 6.52%. Use 6.52%' (LoanForm.tsx:362). suggestRate returned 6.52 for all 294 probed dates from 2026-07-01 to 2099-12-31; the code has no upper bound at all. A five-digit year, 09/01/20260, gives 6.52 and a hint ending 'for .' with no year. A loan saved with 2027-09-01 stores rate 6.52. The 2026–27 figure itself is right: FSA GENERAL-26-33 lists 6.52%.

## Required

Call a rate published only for an award year the table has (2022–23 through 2026–27). For a later or malformed date, leave the rate empty so the borrower types it in. No 2027–28 rate exists until it is set on June 1, 2027.

## Reproduce

1. Open the app and click 'Add my first loan' (or 'Add a loan' if loans exist). Leave the type as Subsidized.
2. In 'Date it was paid out' type 08/20/2027. The rate fills in 6.52 and the hint reads 'We filled in the published undergraduate rate for 2027–28. Change it if yours is different.' The school-year buttons stop at 2026–27.
3. Change the date to 09/01/2030: still 6.52, and the hint now names 2030–31.
4. Type 7.01 in 'Interest rate' with the date still 09/01/2030: the hint says 'The published undergraduate rate for 2030–31 was 6.52%' with a 'Use 6.52%' button.
5. Type 09/01/20260: 6.52 again, and the hint ends 'for .' with no year. Control: 06/30/2027 gives 6.52 labelled 2026–27, which is correct.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-17"`.

## Fix

Make suggestRate (src/data/seed.ts:132-138) answer only inside an award year the table has, and only for a well-formed date:

export function suggestRate(disbursementDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(disbursementDate)) return null;
  const match = RATE_BY_AWARD_YEAR.find((r) => {
    const y = Number(r.from.slice(0, 4));
    return disbursementDate >= r.from && disbursementDate < `${y + 1}-07-01`;
  });
  return match ? match.rate : null;
}

No form change is needed: LoanForm.tsx:150-157 already treats null as 'no suggestion', as it does for dates before 2022-07-01, so past the table the rate is left empty with the default hint, both 'published' sentences (LoanForm.tsx:357 and :362) disappear, and Save stops on the rate field with its error. Checked by patching the shipped chunk in the real form: 09/01/2026 and 06/30/2027 give 6.52; 07/01/2027, 12/31/2099, 09/01/20260 and 09/01/20270 give an empty rate with the default hint; picking the 2026–27 shortcut and then typing 09/01/2027 clears the rate. Also add a short constants checklist to the README: add the new RATE_BY_AWARD_YEAR row each June when FSA publishes it (this also adds the school-year shortcut), and update the poverty table each January.

## Severity

Today only a borrower who types a payout date on or after July 1, 2027 (a typo or a planned loan) sees 6.52% called the published rate for a year that has none; from July 1, 2027 that becomes every Subsidized or Unsubsidized loan added through the main form, with every plan and payoff figure for it built on that rate, unless the table is updated first. The hint does invite a correction, which bounds the harm.

## Verification

Confirmed by 3 of 3 skeptics (standards and reproduce on the money finding, reproduce on the resilience finding).

<details><summary>Dissent and notes</summary>

Severity: the resilience finding was filed at P3 and its skeptic kept P3, because no real loan can carry a date after June 30, 2027 yet; the money finding's standards skeptic called P3 arguable until July 2027 but kept P2. Kept at P2 here because the failure date is fixed and the main add-a-loan flow hits it from that day. Fix: both money skeptics said the money finding's fix works as filed, but neither tried a five-digit year; the resilience skeptic showed that the resilience finding's fix still returns 6.52 and 'for .' for 09/01/20260, and the same string comparison lets that date past the money finding's upper bound as well. Scope: 'every new loan' in the money finding's title is only Subsidized and Unsubsidized, and 'through 2062' was just the last date sampled.

Chose the resilience skeptic's corrected suggestRate (a bounded award-year window plus a yyyy-mm-dd check) over the money finding's single upper bound, because only it also rejects five-digit years, which the date input accepts. The fix stops the false label; it does not supply the 2027–28 rate, which still has to be added once FSA publishes it before July 1, 2027. The date input (LoanForm.tsx:296) has no max; adding one is not needed for this fix. Cited lines were rechecked: seed.ts:136 is the open-ended '>=' match, seed.ts:128 the last table row (2026–27), seed.ts:146 the shortcuts derived from the table, LoanForm.tsx:357 and :362 the two 'published' sentences.

</details>

Merged from audit findings: `money-stale-rate-table`, `resilience-rate-suggestion-future-years`.
