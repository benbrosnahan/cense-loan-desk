# RES-09: Export file name uses the UTC date

**P2** · effort S · Data safety and resilience

Spreadsheet file names use the UTC date, so a US borrower who downloads in the evening gets a file named for tomorrow while the 'Saved' date inside it says today.

| | |
|---|---|
| Who it hurts | A borrower keeping dated evidence of their balances files it under the wrong day: an evening download in the US is named for tomorrow (on December 31, for next year) while the Saved cell inside says today. |
| Standard | none |
| Where | Both 'Download as a spreadsheet' buttons: the Loans tab 'Keep a copy' card (export.ts:114) and the Records tab (export.ts:301), at any viewport. Only the file name is wrong. In New York it is wrong from 7 PM EST or 8 PM EDT until midnight, in Los Angeles from 4 PM PST or 5 PM PDT, in Honolulu from 2 PM all year. East of UTC it is wrong in the morning instead (Tokyo before 9 AM gets the previous day). |
| Code | [`src/lib/export.ts:12-14`](../../src/lib/export.ts#L12-L14), [`src/lib/export.ts:114`](../../src/lib/export.ts#L114), [`src/lib/export.ts:301`](../../src/lib/export.ts#L301), [`src/lib/export.ts:16-24`](../../src/lib/export.ts#L16-L24), [`src/lib/export.ts:101`](../../src/lib/export.ts#L101), [`src/lib/export.ts:103`](../../src/lib/export.ts#L103) |
| Test | `resilience.spec.mjs`: "RES-09 spreadsheet file names carry the borrower's local date" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

today() is new Date().toISOString().slice(0, 10) (export.ts:13), the UTC date, while the Saved cell (export.ts:101) and the snapshot 'Taken' cells use stamp() (export.ts:16-24), which is local time. On the real clock with no Date override (2026-11-03T00:14Z), real Chromium downloads in New York (Saved cell 'Nov 2, 2026 7:14 PM'), Chicago, Los Angeles, Honolulu and Pago Pago all saved cense-loan-desk-2026-11-03.xlsx and cense-loan-history-2026-11-03.xlsx; a second real-clock run at 4:06 PM PST on Nov 2 gave the same next-day names with Saved 'Nov 2, 2026 4:06 PM'. Fixed clock: 9:30 PM Nov 2 in New York gives cense-loan-desk-2026-11-03.xlsx with Saved 'Nov 2, 2026 9:30 PM' and cense-loan-history-2026-11-03.xlsx; 6:30 PM in Los Angeles and 4:30 PM in Honolulu give the same names; 7:30 AM Nov 3 in Tokyo gives 2026-11-02; 1 PM in New York gives 2026-11-02 (control). Onsets: 6:59 PM EST is right and 7:00 PM EST is wrong; 3:59 PM PST is right and 4:00 PM PST is wrong; 7:59 PM EDT on Jul 15 is right and 8:00 PM EDT gives 07-16; 5:00 PM PDT and 2:00 PM HST are wrong; 8:00 PM EST on Dec 31 gives 2027-01-01. The history file's newest 'Taken' cell shows the local date, so that file's name disagrees with its own contents. The live page chunk contains the same toISOString().slice(0,10). With the fix below built verbatim, 13 of 13 fixed-clock cases and 7 of 7 real-clock zones carry the local date and match the Saved cell, and verify.mjs passes 180 of 180.

## Required

The file name carries the borrower's local date, the same date as the Saved cell inside it and the newest snapshot's Taken cell.

## Reproduce

1. Set the computer's time zone to America/Los_Angeles (or America/New_York) and use the app after 4 PM Pacific (7 PM Eastern) in winter, or after 5 PM (8 PM) in summer.
2. Open http://localhost:3100 and click 'Look around with example loans'.
3. On Loans, scroll to 'Keep a copy' and click 'Download as a spreadsheet'. The file is cense-loan-desk-<tomorrow's date>.xlsx. Open it: the Saved cell shows today's date and time.
4. Open Records, click 'Save today's snapshot', then 'Download as a spreadsheet'. The file is cense-loan-history-<tomorrow's date>.xlsx.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-09"`.

## Fix

Build the name from the local calendar date, the same clock stamp() uses. src/lib/export.ts:12-14:
```ts
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```
Both callers (export.ts:114 and :301) pick it up unchanged.

## Severity

Every US borrower who downloads in the evening gets a next-day file name (from 7 PM Eastern or 4 PM Pacific in winter, 8 PM and 5 PM in summer, from 2 PM all year in Hawaii), and on the evening of December 31 a next-year one. The Saved date and time inside the file are right, so no figure is wrong, but the sheet calls itself the borrower's evidence (export.ts:103), which makes this a misleading date rather than polish.

## Verification

Confirmed by 3 of 3 skeptics across 2 filings (standards and reproduce on the resilience filing, a P3 review on the money filing), including real-clock runs with no Date override; two kept P2 and the money filing's skeptic kept P3. Both skeptics on ux-export-failure-silent (RES-08) reproduced the same file names.

<details><summary>Dissent and notes</summary>

Severity: the money filing and its skeptic rate it P3 because the dates inside the sheet are right; the resilience filing and both its skeptics rate it P2 because this is the file the sheet calls evidence and the wrong name recurs every evening; the ux standards skeptic (on RES-08) called the file name P3 on its own. This report keeps P2 under the stricter rubric as a misleading date with no wrong figure. Fix: the money and ux filings proposed new Date().toLocaleDateString('en-CA'); it returned 2026-11-02 in Chromium, Node (ICU 78.3, CLDR 48) and JavaScriptCore, but nobody ran it in Firefox. Window: the filings describe winter evenings; in summer the wrong name starts an hour later on the mainland (8 PM Eastern, 5 PM Pacific), and in Hawaii it starts at 2 PM all year.

Fix choice: the resilience filing's getFullYear/getMonth/getDate version, because it reads the same local clock as stamp() and does not depend on any locale's date format. Both its skeptics built it verbatim (13 of 13 fixed-clock cases, 7 of 7 real-clock zones, verify.mjs 180 of 180). The en-CA one-liner also worked where it was run. The 412x823 viewport in the filed 'where' plays no part. The file-name half of ux-export-failure-silent, filed under RES-08, is this same defect. Land together with RES-08, which also edits src/lib/export.ts.

</details>

Merged from audit findings: `resilience-export-filename-utc`, `money-export-filename-utc`.
