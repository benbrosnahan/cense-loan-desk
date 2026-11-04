# SEO-08: vercel.app host: decide the domain now

**P3** · effort S · SEO and findability

Loan Desk lives on a rented vercel.app address with no recorded plan for it, and moving to a new domain later with a plain redirect would open an empty app for every returning borrower, because saved loans stay behind at the old address.

| | |
|---|---|
| Who it hurts | Every link the newsletter earns points at an address the author does not own, and if the app later moves by redirect, every returning borrower opens an empty first-run screen with no explanation while their loans sit unreachable at the old address. |
| Standard | Public Suffix List (vercel.app is a private-section entry, so each project counts as its own site); Google Search Central site-move and Change of Address guidance, which names 301 redirects; HTML Standard: localStorage belongs to the origin, so it does not follow a redirect. |
| Where | Every route's public address, https://cense-loan-desk.vercel.app, which the repo names only at README.md:3. Saved data sits in four localStorage keys bound to that origin: cense.loandesk.loans.v1, cense.loandesk.profile.v2 and cense.loandesk.snapshots.v1 (src/lib/storage.ts:9-13) and cense.loandesk.hideAmounts.v1 (src/app/page.tsx:79). The only way data leaves the app is the spreadsheet export (src/lib/export.ts:95 and :128, 'Download as a spreadsheet' on the Loans and Records tabs), and nothing reads it back. Any viewport. |
| Code | [`README.md:3`](../../README.md#L3), [`src/lib/storage.ts:9-13`](../../src/lib/storage.ts#L9-L13), [`src/app/page.tsx:79`](../../src/app/page.tsx#L79), [`src/lib/export.ts:95`](../../src/lib/export.ts#L95), [`src/lib/export.ts:128`](../../src/lib/export.ts#L128) |
| Test | `seo-agentic.spec.mjs`: "SEO-08 a borrower can carry saved loans to a new address before the app moves" |

## Measured

vercel.app is on the Public Suffix List (version 2026-10-31_14-17-28_UTC, line 16327, inside the private section at lines 11243-16559; pages.dev is at line 12759), so cense-loan-desk.vercel.app counts as its own site. Live HEAD: 200, server Vercel. It does not block ranking: the rented-subdomain tools rappath.pages.dev and student-loans.pages.dev appear in one result list for 'RAP repayment assistance plan student loan calculator 2026' (run through the audit's web-search tool, not confirmed to be Google). Without DNS control the author can verify only a URL-prefix Search Console property; Search Console help, as the verifier quoted it, says a Domain property uses DNS record verification only. Inbound links are few: a sweep of 107 of 108 newsletter sitemap URLs finds 2 anchors to Loan Desk on 1 post (/p/how-to-manage-multiple-loans), plus README.md:3, while loan-lab.vercel.app and cense-debt-dashboard.vercel.app are linked from all 108 pages in the sweep through the site nav. There is no import path: grep -rnE 'FileReader|type="file"|xlsx\.read' src exits 1 with no hits, a case-insensitive grep of src for restore, upload and paste finds nothing, and all 4 tabs have 0 file inputs; 'Download as a spreadsheet' appears on Loans and Records only. A move simulated with a real 308 between two origins serving the same build: the old origin showed 'Your 8 loans' with 8 stored; after 308 then 200, the new origin showed the first-run headline 'Every loan you have, on one screen.' with 0 loans. robots.txt and sitemap.xml return 404 on the shipped build. Google's Change of Address page names 301 five times and 308 never, and says its tool checks for 301s on a few pages.

## Required

A deliberate, written host decision before inbound links grow; the address defined in one constant that the canonical, og:url and any sitemap or robots file read; and, before any redirect, a way for borrowers to carry saved loans to the new address.

## Reproduce

1. Open http://localhost:3100 and click 'Look around with example loans'. The Loans tab heading reads 'Your 8 loans'.
2. In the same browser, open http://127.0.0.1:3100: the same build at a different origin, which is what a new domain would be (if you have used that address before, clear its site data first). It shows the first-run headline 'Every loan you have, on one screen.' and no loans.
3. Go back to http://localhost:3100: the 8 loans are still there, stuck at the first address.
4. Look for a way to carry them across: the Loans and Records tabs offer only 'Download as a spreadsheet', and no tab has a file input, import or restore control.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-08"`.

## Fix

Decide the host now and write the decision down; the code change is one constant.
1. One constant for the address, shared with SEO-02 and SEO-05 (add it here if neither has landed):

// src/data/site.ts
export const SITE_URL = "https://cense-loan-desk.vercel.app";

layout.tsx reads it through metadataBase: new URL(SITE_URL), so the canonical, og:url and SEO-01's sitemap.ts and robots.ts all resolve from it, and no other file in src names the host.
2. Record the decision beside the Live link at README.md:3: which host, the date, and that a move must follow step 3. Keeping vercel.app is a fine outcome; it does not block ranking.
3. If a domain is wanted, buy it before SEO-04 puts Loan Desk in the newsletter nav, and move in this order: (a) add the domain in Vercel, serve the app on both hosts, and change SITE_URL so the canonical points at the new host; (b) ship RES-05's 'Save a backup file' and 'Restore from a backup file', which is the import path; (c) on the old host, tell borrowers who have saved loans how to carry them across:

// src/app/page.tsx, only while both hosts serve the app
const OLD_HOST = "cense-loan-desk.vercel.app";
{loans.length > 0 && window.location.hostname === OLD_HOST && (
  <Notice tone="warn" title={`Loan Desk has moved to ${new URL(SITE_URL).host}`}>
    Your loans are saved at this address only. Choose Save a backup file, then open the new address and choose Restore from a backup file.
  </Notice>
)}

(d) only after the notice has run, verify the old host as a URL-prefix property, add a 301 from its homepage and pages to the new host, and file Search Console's Change of Address. A redirect before (b) and (c), 301 or 308, makes saved loans unreachable, because localStorage belongs to the origin and does not follow a redirect. Nothing here sends data off the device, and no dependency is added.

## Severity

Nobody is harmed today: the vercel.app address does not block ranking and every saved loan loads. The harm is conditional: every returning borrower would lose sight of their loans, once, if the host moved by redirect before an import path exists, so this is hardening that gets cheaper the earlier it is decided.

## Verification

Confirmed by 1 of 1 skeptics (single P3 verifier, reproduce lens), who re-fetched the Public Suffix List, reproduced the stranded loans with a real redirect between two origins, and swept 107 of 108 newsletter URLs.

<details><summary>Dissent and notes</summary>

None on severity: the filing lead and the verifier both rate it P3. Corrections adopted: (1) the last step uses a 301, not the filed 308, because Google's Change of Address page names only 301 and its tool checks for 301s; Google's redirect guidance treats 301 and 308 alike for indexing, but whether a 308 passes that check is unconfirmed. (2) The filing called its link count a sample; the full sweep finds the same 2 anchors on 1 post. (3) The verifier could not confirm the co-occurrence search was Google, so 'does not block ranking' is supported but not measured on Google, and 'counts as its own site' is true by the list's definition without a measurement of how Google ranks it. (4) The filed test idea assumed a sitemap and robots.txt; both return 404 on the shipped build and arrive only with SEO-01.

Fix choice: the filed order with the verifier's 301 correction, using RES-05's JSON backup and restore as the import path instead of building a new one. RES-05 explains why not to read the .xlsx back: the history workbook has no loan ids, neither workbook holds the profile, and parsing user-chosen files with xlsx 0.18.5 exposes its open advisories. Effort S covers the constant and the written decision; an actual move also needs RES-05 (M) and the old-host notice. Timing: SEO-04's fix points the newsletter's site nav at Loan Desk, which would take it from 1 linking page to every page that carries the nav (108 in the sweep) at whatever address is current, so settle the host first or in the same change. The old host can keep serving the app with the notice and its canonical pointing at the new host for as long as needed; only the Change of Address step requires the redirect. The same per-origin trap is why SEO-04 says not to redirect the Loan Lab and Debt Dashboard hosts before checking for saved data there.

</details>

Merged from audit findings: `seo-vercel-app-host`.
