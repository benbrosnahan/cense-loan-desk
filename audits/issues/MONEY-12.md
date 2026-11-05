# MONEY-12: Two-digit year saves as year 0026 and flips eligibility

**P1** · effort S · Money figures and eligibility

The loan date field accepts year 0026 when a borrower types a short date such as 09/15/26, so a loan paid out after the July 1, 2026 cutoff is treated as old and the borrower is told plans are open that are closed to them.

| | |
|---|---|
| Who it hurts | A desktop borrower whose loan was paid out after July 1, 2026 and who types the date as 09/15/26 (or 9/1/2026 in Chrome) is told Standard, Graduated and IBR are open when only Tiered Standard and RAP are, is shown the wrong payment from $25,000 up, and in public service can be told a $136 Standard payment earns PSLF credit when the Tiered Standard plan they will actually be on earns none. |
| Standard | 34 CFR 685.210(a)(1)(ii): a borrower with a Direct Loan made on or after July 1, 2026 may select only Tiered Standard or RAP. The app enforces it with a string compare against CUTOFF (src/types/index.ts:16-25, src/lib/calc.ts:44-46). WCAG 2.2 SC 3.3.1, cited by one filing, does not apply: the form detects no error. |
| Where | Loans tab, 'Add a loan' form, 'Date it was paid out' field (#disb), typed on a keyboard. Measured in desktop Chromium (Chrome 127, 131, 146, 147, 150 and 156) at 1280x900 and 1440, in 375 emulation (which keeps the desktop date control), in macOS WebKit (an off-screen WKWebView with real key events, not Safari.app) for slash-separated dates, and once on the live site. Real phones, Safari.app and Firefox were not tested. |
| Code | [`src/components/loans/LoanForm.tsx:173-175`](../../src/components/loans/LoanForm.tsx#L173-L175), [`src/components/loans/LoanForm.tsx:185`](../../src/components/loans/LoanForm.tsx#L185), [`src/components/loans/LoanForm.tsx:227`](../../src/components/loans/LoanForm.tsx#L227), [`src/components/loans/LoanForm.tsx:295-306`](../../src/components/loans/LoanForm.tsx#L295-L306), [`src/lib/calc.ts:44-46`](../../src/lib/calc.ts#L44-L46), [`src/lib/calc.ts:299`](../../src/lib/calc.ts#L299), [`src/types/index.ts:25`](../../src/types/index.ts#L25), [`src/lib/storage.ts:37-40`](../../src/lib/storage.ts#L37-L40) |
| Test | `money-core.spec.mjs`: "MONEY-12 a date typed with a two-digit year is never saved as year 0026" |
| Fix proof | Validated: [`fixes/MONEY-12.patch`](../fixes/MONEY-12.patch). The loan form now refuses a date whose year no loan can have (not four digits, before 1965, or more than two years ahead). It keeps the form open with a message that names the year it read and how to type the date, so a typed 07/01/26 is never saved as 0026 and treated as pre-cutoff. loanStore.load also repairs loans already saved as 00YY: 20YY up to two years ahead, otherwise 19YY. Saved 0026 loans then get the post-cutoff answer (Tiered Standard and RAP only). An independent review found it sound, with the notes below. |
| Before applying | The repair is safe for valid data but takes effect permanently on the first load, when the existing save effect writes it back: a Chrome-typed 9/1/26 becomes a plausible 2006, and 0029 to 0064 become 1929 to 1964, which the new rule then refuses on any edit until the date is retyped. |
| Overlaps | Changes the same lines as [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Chromium, keys 070126 into #disb: value '0026-07-01', validity valid, no in-form warning, the rate stays blank, and Save stores it. The row reads '26–27 subsidized ... paid out Jul 1, 26' with no 'after Jul 1, 2026' tag, there is no top notice, the Loans tab says '4 of the 6 federal plans are open to you', and Plans picks Standard from Standard, Graduated, IBR and RAP. Control 07012026: in-form warning, rate auto-filled 6.52, top notice, '2 of the 6', pick Tiered Standard from Tiered Standard and RAP. 091526, 090126 and 07/01/26 give the same wrong answer, and it survives a reload. A full year can land here too, because Chromium ignores the slash key: 9/1/2026 stores 0026-09-12, 7/1/2026 0026-07-12, 10/1/2026 0026-10-12, 1/5/2027 0027-12-20 and 9/1/26 0006-09-12, while 09/01/2026, 8/25/2026 and 10/5/2026 are stored correctly. macOS WebKit: 07/01/26, 9/15/26 and 9/1/26 store 00YY; digits-only 070126 stays empty there and the existing empty-date check blocks it. Live site: 091526 stores 0026-09-15 with no notice. Wrong dollars from $25,000 up: at $60,000, 6.52%, income $52,000 the borrower is told Standard $682 a month, $81,828 in total, where the right pick is Tiered Standard $448 a month over 20 years, $107,532; at $40,000, Standard $455 against Tiered Standard $349; eight older loans ($28,101) plus a $5,500 loan typed 091526 give '5 of the 6' and Standard $373 a month against '2 of the 6' and Tiered Standard $284. At $20,000 and below the payment matches ($227) and only the plan names and open list are wrong. A nonprofit borrower ($12,000, income $52,000, goal not sure) is shown 'Standard $136 a month ... After 120 qualifying payments the rest is cancelled, tax free', where the right answer is RAP $217 and Tiered Standard at $136 earns no PSLF credit. Plans states 'Every loan you entered is older' (calc.ts:299). Picking the 2026–27 button and then retyping the date as 091526 or 082526, as the hint under the field invites, throws the right answer away. 090125 stores 0025-09-01 (eligibility right, labels '25–26' and 'Sep 1, 25' wrong); 090120260 stores '20260-09-01' with the auto name 'subsidized'. Cause: LoanForm.tsx:173-175 only checks that the date is not empty; 0026-07-01 is a valid date string under the HTML standard, so validity is true, and the form is noValidate (LoanForm.tsx:227); calc.ts:44-46 compares ISO strings, and '0026-07-01' sorts before CUTOFF '2026-07-01'.

## Required

A year no loan can have blocks Save with a message that names the year it read and how to type the date, and nothing is stored. A loan paid out on Jul 1 2026 then leaves only Tiered Standard and RAP, as the four-digit control shows. Loans already saved with a 00YY year stop giving the wrong answer.

## Reproduce

1. In desktop Chrome, open http://localhost:3100 with no saved data and click 'Add my first loan'.
2. Do not use the school-year buttons. Click the month part of 'Date it was paid out' and type 070126 (or 9/1/2026). The field shows 07/01/0026 (or 09/12/0026), no warning appears and the interest rate stays blank.
3. Type 20000 in 'What you owe on it today' and 6.52 in 'Interest rate', then click 'Save loan'.
4. The row reads '26–27 subsidized ... paid out Jul 1, 26' with no 'after Jul 1, 2026' tag, the Loans tab says 4 of the 6 federal plans are open, and Plans recommends Standard and lists Standard, Graduated, IBR and RAP.
5. Control: open the row, choose Edit, type 07012026 and save. The in-form warning and the top notice appear, 2 of the 6 plans are open, and the pick is Tiered Standard.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-12"`.

## Fix

Two edits. The rule and the repair were built and run in scratch builds: next build passes and node verify.mjs stays at 180 of 180.

1. src/components/loans/LoanForm.tsx:173-175: reject a year no loan can have. Add the year above const errors (line 172) and replace the disbursementDate rule:
  const disbYear = Number(f.disbursementDate.slice(0, 4));
  ...
  disbursementDate: !f.disbursementDate
    ? "Pick the school year, or enter the date below."
    : !/^\d{4}-/.test(f.disbursementDate) || disbYear < 1965 || disbYear > new Date().getFullYear() + 2
    ? `Check this date. We read the year as ${f.disbursementDate.split("-")[0]}. Type it as MM/DD/YYYY, like 09/01/2026.`
    : null,
The existing submit path then keeps the form open, shows the message in #disb-msg and moves focus to #disb. Do not add min and max to the input: the rule blocks everything without them, and with them ArrowUp on an empty year jumps to the minimum and a five-digit year is clipped to 0260.

2. src/lib/storage.ts:37-40: repair loans already saved with a 00YY year, guarding malformed rows:
  load: (): Loan[] | null => {
    const v = read<Loan[] | null>(LOANS_KEY, null);
    if (!Array.isArray(v)) return null;
    // The form used to accept a two-digit year, saved as 00YY. Read it as 20YY
    // up to two years ahead, otherwise 19YY.
    const pivot = (new Date().getFullYear() + 2) % 100;
    return v.map((l) =>
      typeof l?.disbursementDate === "string"
        ? { ...l, disbursementDate: l.disbursementDate.replace(/^00(\d\d)-/, (_, yy: string) => `${Number(yy) <= pivot ? "20" : "19"}${yy}-`) }
        : l
    );
  },

## Severity

Borrowers who enter a post-cutoff loan by typing the date on a desktop keyboard in a short form (a two-digit year, or in Chrome a day without its leading zero, such as 9/1/2026) get a wrong eligibility answer every time with no warning, and from $25,000 up a wrong payment too (at $60,000: Standard $682 a month instead of Tiered Standard $448). It needs keyboard entry in a short form rather than the school-year buttons, phones were not tested, and the field shows 0026 before saving, so it is a harm to a recognizable group rather than a typical-borrower P0.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptic votes across 2 filings (reproduce, standards and impact on each); all 6 kept P0 under the audit leads' rubric.

<details><summary>Dissent and notes</summary>

Severity: all six skeptics kept P0, because the leads' rubric made any wrong eligibility answer P0 with no reach test. This report's rubric reserves P0 for a typical borrower in the main flow, and two of the skeptics (reproduce on agentic-date-year-flips-eligibility, impact on resilience-two-digit-year-cutoff) called this the low-reach end of P0, where P1 is a reasonable reading. Fix: both filed fixes were corrected. resilience-two-digit-year-cutoff's load repair, .replace(/^00(\d\d)-/, "20$1-"), turns a typed 09/01/99 (stored 0099-09-01, correctly 4 of 6 today) into 2099 and a post-cutoff answer (2 of 6), turns 0098 beside a 2024 loan from 5 of 6 into 2 of 6, and crashes on a loan with no date; the pivot version above fixes all three. agentic-date-year-flips-eligibility's rule does not compile (d is never declared), its 1994 floor stops a stored 1992 loan from saving a balance edit, its min and max make ArrowUp on an empty year start at 1994, and its form-only check leaves rows already saved as 0026 wrong with no flag; its skeptics preferred flagging bad rows to rewriting them (see notes). Impact: the filed 'only clue on screen is a small Sep 15, 26' was overstated, because before saving the field reads 09/15/0026 and the rate stays blank, and Plans states 'Every loan you entered is older'. The keyboard ISO path (2024-09-01 stored as 40901-02-02) is agent-only and visibly odd ('Feb 2, 40901'), so it does not support the borrower-harm claim. Citation: WCAG 2.2 SC 3.3.1 was dropped because nothing is detected. The filed requirement 'read as 20YY' was wrong for years like 99.

Chosen fix: the resilience form rule, with a message that also fits the Chrome unpadded-day case (that borrower did type four digits), plus the pivot repair its skeptics built and ran. It is the smaller of the two tested approaches and adds no UI. The repair never makes an eligibility answer worse than today: 0026 becomes 2026 (2 of 6 and the notice), 0099 becomes 1999 (4 of 6), 0098 beside a 2024 loan becomes 1998 (5 of 6), and a loan with no date still loads. It is written back on the next save, so the 00YY original is not kept. Limits: a Chrome-typed 9/1/26 was stored as 0006-09-12 and repairs to 2006, still pre-cutoff and so exactly as wrong as today, but now plausible-looking; five-digit years such as 20260 are left alone. The message wording merges the tested variants and does not change behaviour. RES-07 (malformed storage) also rewrites loanStore.load at storage.ts:37-40 to filter bad rows; if both land, run this repair inside that function before its shape check. Optional polish: once the field is touched, retyping a correct year announces the role=alert message for 0002, 0020 and 0202 before it clears; holding the year message until blur or Save (the checkedDate or typingDate variants, both tested) removes that. Gaps in every version: an in-range wrong year (09012016) still saves, and an auto-generated name such as '26–27 subsidized' keeps its label. Not tested: real phones, Safari.app, Firefox and Windows.

</details>

Merged from audit findings: `resilience-two-digit-year-cutoff`, `agentic-date-year-flips-eligibility`.
