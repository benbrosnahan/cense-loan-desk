# RES-14: Implausible values accepted silently

**P3** · effort S · Data safety and resilience

The loan form saves misread or implausible numbers without asking the borrower to check them, so a rate typed as 0.0653 shows a $42 Standard payment on $5,000 instead of $57 and a pasted 2.256,40 becomes a $2.25 balance; its rate error also says 0 is allowed when 0 is rejected.

| | |
|---|---|
| Who it hurts | A borrower who types a rate as a decimal (0.0653) sees a Standard payment that looks plausible but is too low ($42 instead of $57 on $5,000), one who pastes a balance in another format gets a $2.25, $12.50 or $15 loan with no question asked, and one who tries 0 for the rate is told 0 is allowed. |
| Standard | none |
| Where | Add a loan and Edit this loan form: 'What you owe on it today' and 'Interest rate', any width (measured at 320x640, typed and pasted). The saved values then drive the header total, Plans and Payoff. |
| Code | [`src/components/loans/LoanForm.tsx:169-181`](../../src/components/loans/LoanForm.tsx#L169-L181), [`src/components/loans/LoanForm.tsx:328-348`](../../src/components/loans/LoanForm.tsx#L328-L348), [`src/components/loans/LoanForm.tsx:350-395`](../../src/components/loans/LoanForm.tsx#L350-L395), [`src/lib/utils.ts:120-127`](../../src/lib/utils.ts#L120-L127), [`src/lib/utils.ts:129-132`](../../src/lib/utils.ts#L129-L132), [`src/data/seed.ts:122-138`](../../src/data/seed.ts#L122-L138), [`src/components/shared/ui.tsx:266-284`](../../src/components/shared/ui.tsx#L266-L284) |
| Test | `resilience.spec.mjs`: "RES-14 the loan form asks the borrower to check implausible numbers and states the real rate rule" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Through the real form at 320x640, typed and pasted, after tapping 2025–26: balance 2.256,40 shows and saves as 2.25 (header $2; Standard $0 a month, $3 in total); 12.5k saves as 12.5 (header $13); 1e5 as 15; -5000 and (5,000.00) as 5,000; 1000000000000 saves, and its header figure is 521px wide in a 288px box, pushing the page 217px past the 320px screen against 41px with a normal balance. Every one of these keeps only the normal hint 'Called the current balance or outstanding balance.' (formatDollarsInput at utils.ts:120-127 drops signs, letters and commas and keeps two digits after the first point). Rate 0.0653 saves as 0.0653: Standard on $5,000 is $42 a month against $57 at 6.53. Rate 1e1 saves as 11, because the rate filter at LoanForm.tsx:390 drops the 'e'. On Subsidized and Unsubsidized loans dated 2025–26 both rates show 'The published undergraduate rate for 2025–26 was 6.39%. Use 6.39%'; on Grad PLUS, Parent PLUS, a 2021 or 2015 date, or no date they show only 'Federal rates are fixed, so this never changes.' Rate 0 and 0.0 are rejected with 'Enter the interest rate, a number between 0 and 25.', while the rule at LoanForm.tsx:178 is rate > 0 && rate <= 25. The filed hint (balance over 2,000,000 or rate under 1) fires for 2 of these 8 values ($1T and 0.0653).

## Required

The rate message states the real rule (more than 0, up to 25), and a hint that never blocks saving asks the borrower to check values no federal loan has, including the misread forms above. Pasted values stay cleaned rather than rejected, as README.md:187-188 decides.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Add my first loan'.
2. Tap '2025–26' (fills September 1, 2025 and 6.39%). Paste or type 2.256,40 in 'What you owe on it today': the field shows 2.25 and the hint still reads 'Called the current balance or outstanding balance.' Click 'Save loan'. The header shows $2, and on Plans Standard is $0 a month and $3 in total.
3. On Loans, open the loan, click Edit, set the balance to 5000 and the rate to 0.0653, and save. Plans now recommends Standard at $42 a month; with 6.53 it is $57. On this loan the rate field shows 'The published undergraduate rate for 2025–26 was 6.39%. Use 6.39%'. Switch the type to Grad PLUS and the same 0.0653 shows only 'Federal rates are fixed, so this never changes.'
4. In the balance, 12.5k saves as 12.5, 1e5 as 15 and -5000 as 5,000; in the rate, 1e1 saves as 11. At 320px wide, 1000000000000 saves and the header figure runs off the screen.
5. Type 0 in 'Interest rate' and leave the field: 'Enter the interest rate, a number between 0 and 25.'

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-14"`.

## Fix

Keep cleaning pasted values (README.md:187-188), add a hint that never blocks saving, and make the rate message match the rule. All in src/components/loans/LoanForm.tsx.

After :170, where balance and rate are parsed:
```tsx
// Soft checks: the loan still saves; we only ask them to look again.
const unusualBalance = balance > 2000000 || (balance > 0 && balance < 100);
const unusualRate = rate > 0 && rate < 1;
const checkIt = "That looks unusual. Check it against studentaid.gov.";
```

:180, the rate message:
```tsx
: "Enter the interest rate, more than 0 and up to 25.",
```

:332, the balance hint:
```tsx
hint={unusualBalance ? checkIt : "Called the current balance or outstanding balance."}
```

:354-378, put the warning in front of the existing rate hint instead of replacing it, because Field has one hint slot (ui.tsx:266-284) and the 'Use 6.39%' button must stay:
```tsx
hint={
  <>
    {unusualRate && `${checkIt} `}
    {rateIsAuto && suggested !== null ? (
      <>We filled in the published undergraduate rate for {yearLabel}. ...</>
    ) : suggested !== null && rate !== suggested ? (
      <>The published undergraduate rate for {yearLabel} was ... <button ...>Use {suggested}%</button></>
    ) : (
      "Federal rates are fixed, so this never changes."
    )}
  </>
}
```

Of the measured values this flags 2.25, 12.5, 15, 0.0653 and $1,000,000,000,000. No dependency, nothing sent anywhere.

## Severity

Only borrowers who enter a number in an unusual form (a rate as a decimal fraction, a European-style or abbreviated balance, a stray minus sign) are affected. The app computes correctly from the value it shows in the field, and Subsidized and Unsubsidized loans dated from July 1, 2022 already get a line with that year's published rate and a one-click 'Use' button, so the quiet case is a decimal rate on a PLUS or older loan, which is rare; the 0-to-25 message is a wording slip that blocks nothing.

## Verification

Confirmed by 1 of 1 skeptic (P3 review lens), every value reproduced through the real form, typed and pasted; the skeptic replaced the filed hint, which caught 2 of the 8 measured values.

<details><summary>Dissent and notes</summary>

The skeptic confirmed the defect and P3 but corrected the filing. 'Without a word' is untrue for Subsidized and Unsubsidized loans dated from July 1, 2022 (the rate table at seed.ts:122-138), where the published-rate line with a one-click 'Use' button appears ('Use 6.39%' for 2025–26); it holds for every balance, for PLUS loans, and for older or missing dates. 'Quietly wrong' is weak for balances, because the field shows 2.25 and the header $2; the rate is the quiet case, since $42 looks plausible next to the true $57. The filed hint (balance over $2,000,000 or rate under 1) misses the filing's own 2.256,40 example, so it did not meet its own requirement; the fix here adds balances under $100. The filing also left out the rate filter at LoanForm.tsx:390 that reads 1e1 as 11.

Fix choice: the skeptic's predicate over the filed one, because it catches 5 of the 8 measured values instead of 2. Still silent by design: 1e1 read as 11 (a plausible rate) and -5000 or (5,000.00) read as 5,000 (almost certainly what was meant). The predicate was checked against the measured values only, not run in the app. A real balance under $100, such as a loan nearly paid off (the README's sweep uses $37), also gets the hint, which never blocks saving. The hint does not stop a $1,000,000,000,000 balance from overflowing the header at 320px; it asks the borrower to check the number first. Overlaps UX-16, which rewrites the same message at LoanForm.tsx:180 as 'above 0 and up to 25': ship one wording. UX-16 also makes Field show the hint beside an error; that does not conflict, because these hints only fire on values that pass validation.

</details>

Merged from audit findings: `resilience-implausible-values-accepted`.
