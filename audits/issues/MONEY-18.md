# MONEY-18: Two different "interest added so far" figures

**P2** · effort M · Money figures and eligibility

'Interest added so far' in the Loans summary disagrees with the loan rows when one loan is paid down and another has grown, and a blank 'Amount you first borrowed' is saved as today's balance, so the row and the spreadsheet show a principal the borrower never entered.

| | |
|---|---|
| Who it hurts | Anyone with one loan paid below what they borrowed and another that has grown sees two answers under one label, and everyone who skips the optional principal field gets a 'First borrowed' figure, and an 'Original principal' in the sheet the app calls 'your evidence', that they never entered. |
| Standard | None cited. Internal consistency: one label has one definition, the summary equals the sum of its rows, and the two parts of the bar add up to 'You owe'. |
| Where | Loans tab: the 'You owe' summary bar ('Borrowed' and 'Interest added so far') and an opened loan row ('First borrowed' and 'Interest added so far'); 'Download as a spreadsheet' ('Original principal' column and TOTAL row). Measured at 1280x1000 and 375x812 on the local build and on the live site. |
| Code | [`src/app/page.tsx:307`](../../src/app/page.tsx#L307), [`src/app/page.tsx:482`](../../src/app/page.tsx#L482), [`src/app/page.tsx:491`](../../src/app/page.tsx#L491), [`src/components/loans/LoanList.tsx:22`](../../src/components/loans/LoanList.tsx#L22), [`src/components/loans/LoanList.tsx:92`](../../src/components/loans/LoanList.tsx#L92), [`src/components/loans/LoanList.tsx:98`](../../src/components/loans/LoanList.tsx#L98), [`src/components/loans/LoanForm.tsx:202`](../../src/components/loans/LoanForm.tsx#L202), [`src/components/loans/LoanForm.tsx:428`](../../src/components/loans/LoanForm.tsx#L428) |
| Test | `money-edges.spec.mjs`: "MONEY-18 the summary\'s interest added equals the loan rows, and a principal nobody entered is never shown as borrowed" |

## Measured

Loan A $10,000 now $9,000 and loan B $5,000 now $7,000: summary 'Borrowed $15,000, Interest added so far $1,000'; rows 'Interest added so far $0' and '$2,000'. Both labels are on screen together at 1280x1000 and 375x812, and the live site gives the same figures. A $10,000 now $5,000 and B $5,000 now $6,000: the summary bar is hidden while row B says $1,000. Controls agree: both loans above their principal gives $2,000 = $1,000 + $1,000; both below gives no bar and $0 + $0. Blank principal through the real form (the field is not rendered until 'Add more detail' is opened): balance 12,345 is stored as principal 12345; the row says 'First borrowed $12,345, Interest added so far $0'; the downloaded xlsx has Original principal 12345 and TOTAL 12345 under the line 'this is your evidence'. Editing that loan's balance to 12,900 keeps 12,345 as principal without showing the field, so the summary and row then say 'Borrowed $12,345' / 'First borrowed $12,345' and 'Interest added so far $555', with no principal ever entered.

## Required

One definition of interest added: the summary's figure equals the sum of the rows, and the two legend figures add up to 'You owe'. A principal that was not entered reads as not entered on screen and is blank in the spreadsheet.

## Reproduce

1. Open the app and click 'Add my first loan'. Enter loan A: Unsubsidized, paid out 09/01/2022, what you owe 9,000, rate 6; open 'Add more detail' and set 'Amount you first borrowed' to 10,000. Click 'Save and add another'.
2. Enter loan B the same way with what you owe 7,000 and first borrowed 5,000, and save.
3. The summary under 'You owe $16,000' reads 'Borrowed $15,000, Interest added so far $1,000'. Open loan B's row: 'Interest added so far $2,000'.
4. Edit A to owe 5,000 and B to owe 6,000: the summary bar disappears while row B still says $1,000.
5. In a new private window, add one Subsidized loan with the 2024–25 school year and what you owe 12,345, without opening 'Add more detail'. Its row says 'First borrowed $12,345, Interest added so far $0', and 'Download as a spreadsheet' puts 12345 under 'Original principal'. Edit its balance to 12,900: the summary now shows 'Borrowed $12,345' and 'Interest added so far $555'.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-18"`.

## Fix

Use the row's per-loan definition everywhere, size the bar from it, and stop inventing a principal. Built and checked on a scratch copy: next build passes, verify.mjs 180 of 180.

1. Move interestSoFar from LoanList.tsx:22 into src/lib/calc.ts and export it:
export const interestSoFar = (l: Loan) =>
  l.principal > 0 && l.balance > l.principal ? l.balance - l.principal : 0;

2. page.tsx:307:
const interest = loans.reduce((s, l) => s + interestSoFar(l), 0);
const restOfBalance = balance - interest;
const restLabel = Math.abs(restOfBalance - principal) < 0.005 ? "Borrowed" : "Rest of the balance";
At page.tsx:482 size the green segment with `${(restOfBalance / balance) * 100}%`, and at page.tsx:489-491 render <dt>{restLabel}</dt> with <Money value={restOfBalance} />, so the two legend items always add up to 'You owe'.

3. LoanForm.tsx:202: const principal = parseNumber(f.principal);
LoanForm.tsx:428: (!!initial.minPayment || (!!initial.principal && initial.principal !== initial.balance))

4. LoanList.tsx:92: {l.principal ? <Money value={l.principal} /> : "not entered"}
LoanList.tsx:98: {l.principal ? <Money value={interestSoFar(l)} /> : "not known"}

5. export.ts:49: l.principal || ""
export.ts:63: loans.every((l) => l.principal) ? loans.reduce((s, l) => s + l.principal, 0) : ""

On that build: first mix 'Rest of the balance $14,000' + 'Interest added so far $2,000' = $16,000 with orange at 12.05%; second mix $10,000 + $1,000 = $11,000; one blank loan plus one entered $17,345 + $1,000 = $18,345 with the TOTAL principal cell blank; the 8 example loans unchanged at 'Borrowed $27,000, Interest added so far $1,101'.

## Severity

Every borrower who leaves the folded 'Amount you first borrowed' field blank, which is the default path, gets a 'First borrowed' figure and $0 of interest they never gave on the row and in the export, and borrowers with one loan below and another above what they borrowed see two different interest totals. Principal feeds no plan, payment, payoff or eligibility figure, so the harm is a wrong informational figure rather than a wrong decision.

## Verification

Confirmed by 2 of 2 skeptics (reproduce, standards).

<details><summary>Dissent and notes</summary>

Both skeptics agree on the defect and on P2; they differ only on the fix. Both measured that the filed fix (sum the rows, save blank as 0, hide 'Borrowed') passes its own test but regresses the bar, because page.tsx:482 still sizes it from principal / balance: in the first mix the legend adds to $17,000 under 'You owe $16,000' and orange is drawn at 5.8% for a 12.5% share; in the second mix the green segment's style width is 136.364% with orange at 0; one blank loan plus one entered draws 72.3% orange for a share of about 5.5%; the sheet's TOTAL principal is understated (5000 beside 18345); and the row still says 'Interest added so far $0' beside 'not entered'. The standards skeptic labels the green part 'Left of what you borrowed' and hides that legend item when any principal is missing; the reproduce skeptic labels it 'Rest of the balance' and keeps it. Scope: the filed 'anyone part way through repaying one loan' is too broad, since a single loan, or loans all on one side of their principal, agree; the blank-principal half reaches further than filed, because blank is the default path.

Chose the reproduce skeptic's version because 'Rest of the balance' is true by construction in every state, including blank principals, and needs no extra conditional render. Limits: loans saved before the fix keep their entry-time balance as principal, and stored data cannot tell that from a real equal amount, so only new saves benefit; with one blank principal the summary's interest covers only the loans that have one, while the blank loan's row says 'not known'. Principal is read only in page.tsx, LoanList.tsx, LoanForm.tsx and export.ts (rechecked by grep), so no plan, payoff or eligibility figure changes. export.ts:63 can later use totalPrincipal (DX-07).

</details>

Merged from audit findings: `money-interest-so-far-disagrees`.
