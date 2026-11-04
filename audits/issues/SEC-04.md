# SEC-04: xlsx frozen on npm

**P3** · effort S · Security, privacy and best practices

The xlsx package is stuck at 0.18.5 on npm with two high advisories that can never clear there, but borrowers are not exposed because the app only writes spreadsheets and never reads one.

| | |
|---|---|
| Who it hurts | No borrower is exposed today. The author lives with a permanent red audit line that can hide a new one, and any future spreadsheet import would inherit both flaws. |
| Standard | None (dependency hygiene). npm audit flags GHSA-4r6h-8v6p-xvw6 (prototype pollution, fixed in 0.19.3) and GHSA-5pgg-2g8v-p4x9 (ReDoS, fixed in 0.20.2); SheetJS publishes both fixes only on cdn.sheetjs.com, never on npm. |
| Where | The two 'Download as a spreadsheet' buttons, on the Loans tab ('Keep a copy' card) and the Records tab, are the only paths that load xlsx; same at every width. In the repo: package.json, package-lock.json and the production npm audit. |
| Code | [`package.json:18`](../../package.json#L18), [`package-lock.json:6467`](../../package-lock.json#L6467), [`src/lib/export.ts:76`](../../src/lib/export.ts#L76), [`src/lib/export.ts:113`](../../src/lib/export.ts#L113), [`src/lib/export.ts:300`](../../src/lib/export.ts#L300), [`README.md:79`](../../README.md#L79), [`.eslintrc.json:1`](../../.eslintrc.json#L1) |
| Test | `security-privacy.spec.mjs`: "SEC-04 the spreadsheet library can still be patched, or the repo records why xlsx 0.18.5 is safe and nothing reads a spreadsheet" |
| Fix drafts | Draft materials for the fix are in [`fixes/SEC-04/`](../fixes/SEC-04/). |

## Measured

Registry: npm's newest xlsx is 0.18.5, published 2022-03-24; none of its 108 versions is newer, and xlsx@0.20.3 gives E404. npm audit --omit=dev: xlsx high, range *, fixAvailable false, via GHSA-4r6h-8v6p-xvw6 (<0.19.3) and GHSA-5pgg-2g8v-p4x9 (<0.20.2); npm outdated does not list xlsx at all. Use: src calls only XLSX.utils.book_new, aoa_to_sheet, book_append_sheet and XLSX.write, with no XLSX.read, FileReader or file input. A V8 coverage run of the shipped exportLoans and exportHistory against 0.18.5 entered 85 to 86 named functions and 0 of the 463 read/parse-named ones. SheetJS sits in a lazy chunk (2170a4aa, 413,745 bytes raw, 138,864 gzip) fetched 0 times in 11 page-load requests and once on Download. Option tried, vendor tarball 0.20.3: xlsx leaves the audit; tsc, build and a 16-step smoke pass; the chunk grows to 159,417 bytes gzip (+20.5 KB, +14.8%, on export only); the lockfile resolves to cdn.sheetjs.com and npm outdated stops tracking it; the audit still exits 1 on next, postcss and source-map-js. Option tried, a 138-line hand-written writer: 9 packages, xlsx among them, leave the lockfile, the lazy chunk is gone, first-load script grows 1,179 bytes net for every visitor, export makes 0 requests (2 today) and works offline, and files shrink (ordinary 8-loan export: 7,887 against 20,420 bytes and 12,942 against 26,027). On that export SheetJS, openpyxl and calamine read back the same cells as today's file except the 'Saved' time, whose two runs straddled a minute; on a hostile fixture the only differences are 15 cells holding control characters, CR or a lone surrogate, which the writer strips; 0 formula cells in every file. The writer's files have not been opened in Excel, Numbers or Google Sheets.

## Required

A dependency that can still receive fixes, or none. Because nothing is reachable, both filers also accept keeping 0.18.5 with a recorded reason, provided the reason stays true: the app never reads a spreadsheet.

## Reproduce

1. Open http://localhost:3100 and click 'Look around with example loans'.
2. Open the browser's network panel. On the Loans tab, in the 'Keep a copy' card, click 'Download as a spreadsheet'. Only now does the page fetch /_next/static/chunks/2170a4aa.319f5df2f1849a13.js (SheetJS) and 919.07c6b8536b715587.js, then it saves cense-loan-desk-<date>.xlsx. The Records tab's 'Download as a spreadsheet', enabled after 'Save today's snapshot', loads the same chunk.
3. In a copy of the repo: npm view xlsx version prints 0.18.5; npm audit --omit=dev lists xlsx as high with fixAvailable false; npm outdated does not list it; grep -rn 'XLSX\.' src shows only utils.book_new, utils.aoa_to_sheet, utils.book_append_sheet and write.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEC-04"`.

## Fix

Keep xlsx 0.18.5 and record why in README.md, right after the Privacy paragraph (README.md:79-81), where the author already records what was verified. No code change:

**Dependencies.** `xlsx` stays at 0.18.5, the last version SheetJS published to npm (2022-03-24). Its two high advisories (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) are in the file reader. This app only writes spreadsheets (`book_new`, `aoa_to_sheet`, `book_append_sheet`, `write`) and has no file input. Replace xlsx before adding any spreadsheet import.

Then list xlsx, pointing at this note, in the audit allowlist from SEC-05's test idea, so any other new advisory still fails the check.

## Severity

No borrower is exposed: both advisories are in SheetJS's file reader, and a coverage run of the shipped export entered 0 of its 463 read and parse functions. What remains is upkeep for the author, a permanent red line in the audit that can hide a new one, so P3.

## Verification

Confirmed by 2 of 2 skeptics across 2 filings (one reproduce review each); both kept P3.

<details><summary>Dissent and notes</summary>

The filers split on the fix: bp-xlsx-frozen recommends replacing SheetJS with the hand-written writer; dx-xlsx-npm-dead-end recommends keeping 0.18.5 with a recorded note, and its skeptic agreed, adding that removing xlsx does not turn the audit green because next, postcss and source-map-js still fail it. The bp skeptic confirmed the writer but corrected the filing: its title ('beats the CDN tarball on every measure except real-app testing') overclaims, because the tarball adds 0 bytes to first load and the writer about 1.2 KB (1,179 bytes net, against the filed 1,286, a gap within build-directory noise); CR is not a character XML cannot hold (it can be written as &#13;), the writer simply strips it; and the offline failure affects only the first export after page load. That skeptic also added two guards the writer needs (see notes). The dx skeptic noted that the filed 138,590 bytes is gzip -9 (138,864 with default gzip), and that only the prototype-pollution advisory says write-only use is unaffected; the ReDoS advisory has no such carve-out, so 'not on the app's path' rests on the vendor's 0.20.2 changelog ('Reworked parsing methods to avoid slow regexes') plus the coverage run.

Fix choice: keeping 0.18.5 is the smallest change, nothing is reachable, a swap does not clear the audit on its own (next remains, SEC-02), and the writer's files have not been opened in Excel, Numbers or Google Sheets, which matters for a file the app tells borrowers to keep as evidence. Take the writer instead if you also want the first export to work offline and the 139 KB chunk gone: copy `audits/fixes/SEC-04/xlsx-writer.ts` to src/lib/xlsx-writer.ts, apply `audits/fixes/SEC-04/patch-export.mjs` to src/lib/export.ts (it replaces the XLSX calls with buildXlsx([{ name, rows, widths }])), run npm uninstall xlsx, and add the skeptic's two guards in sheetXml: cap text at 32,767 characters (Excel's cell limit; SheetJS throws there) and add xml:space="preserve" when text has leading or trailing whitespace or a newline. With those guards the skeptic's build passed tsc, next build and verify.mjs 180 of 180. Open one Loans and one Records export in Excel, Numbers and Google Sheets before shipping it, which makes that route M effort rather than S. The vendor tarball (npm install --save-exact https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz) is the weakest option: +20.5 KB on export, a dependency npm outdated cannot see, and every install depends on cdn.sheetjs.com. Related: the silent failure when the chunk cannot load (first export offline: ChunkLoadError, no file, no message) is filed as RES-08. While on SheetJS, the bp skeptic found two more silent export failures on hostile text: U+FFFE or U+FFFF in loan text produces XML that openpyxl refuses, and a cell over 32,767 characters makes SheetJS throw with no file; the nickname input has no maxLength. Line check: the filer's export.ts:75 is the sheetjs() loader and :76 its import("xlsx"); export.ts:113 and :300 are the two XLSX.write calls; all current.

</details>

Merged from audit findings: `bp-xlsx-frozen`, `dx-xlsx-npm-dead-end`.
