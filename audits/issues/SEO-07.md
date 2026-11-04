# SEO-07: Default 404 is a dead end

**P3** · effort S · SEO and findability

A mistyped or guessed Loan Desk address shows Next.js's bare default 404 page, white or black, with no link back to the app and no word that saved loans are safe, so the borrower hits a dead end.

| | |
|---|---|
| Who it hurts | A borrower who follows a mistyped or guessed link hits a bare, off-brand error with no way back into the app and no sign that their saved loans are safe. |
| Standard | None. Status 404 and the noindex robots meta are already correct; this is about the page people see. |
| Where | Any unknown path, local and live (measured /plans and /this-page-does-not-exist), at 390px in light and dark color schemes, in raw HTML and the rendered DOM. The default page inherits the root metadata at src/app/layout.tsx:19-34; src/app/not-found.tsx does not exist. |
| Code | [`src/app/layout.tsx:19-34`](../../src/app/layout.tsx#L19-L34) |
| Test | `seo-agentic.spec.mjs`: "SEO-07 a mistyped address shows a Loan Desk page with a way back and word that saved loans are safe" |

## Measured

Status 404 with <meta name="robots" content="noindex"> and no canonical, local and live (live answers HTTP/2 404 with x-matched-path /404): correct for crawlers. Raw HTML has 2 <title> tags, '404: This page could not be found.' and the homepage title 'Loan Desk by Cense — every student loan you have, in one place'; the rendered head has 3, and document.title is the 404 one. The head also carries the homepage description, og:title, og:description and twitter tags inherited from layout.tsx:19-34. The body is 7 words ('404 This page could not be found.') with 0 links and 0 buttons. Next's default page injects body{color:#000;background:#fff} and, in dark mode, body{color:#fff;background:#000}, so the background measures rgb(255, 255, 255) in light and rgb(0, 0, 0) in dark, against the brand rgb(255, 252, 236) that globals.css sets on body. There is no src/app/not-found.tsx. With SEO-05's metadataBase, canonical and og:url built into the layout and still no not-found page, the 404 also carries <link rel="canonical" href="https://cense-loan-desk.vercel.app"> and an og:url for the homepage. The corrected fix, built and measured: status 404, 1 title, 1 link to /, noindex, no canonical, no og:url or og:title, its own description, and a painted background of rgb(255, 252, 236) in both color schemes.

## Required

A page in the app's own look with one title ('Page not found | Loan Desk'), its own description, a visible link to /, and a line saying saved data was not touched. It keeps status 404 and noindex and has no canonical, og:url or og:title pointing at the homepage.

## Reproduce

1. Open http://localhost:3100/plans (or https://cense-loan-desk.vercel.app/this-page-does-not-exist) in a phone-width window.
2. The page shows only '404' and 'This page could not be found.' on white, or on black if the system is in dark mode, with no link to Loan Desk and nothing about saved loans. The browser tab reads '404: This page could not be found.'
3. View the page source: two <title> tags, the second being the homepage title, plus the homepage description.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-07"`.

## Fix

Add src/app/not-found.tsx. Next serves it for every unknown URL with status 404 and noindex, stops injecting its default white or black body style, and uses this metadata instead of the homepage's:

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found | Loan Desk",
  description: "This page does not exist.",
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-slate-900">This page does not exist.</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-700">Opening this page did not change anything you saved.</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="mt-5 inline-block font-semibold text-navy underline underline-offset-2 hover:text-navy-hover">Go to Loan Desk</a>
      </div>
    </main>
  );
}

The null canonical, openGraph and twitter change nothing today; they keep SEO-05's homepage canonical and og:url, and SEO-02's share card, off the 404 once those land. No dependency.

## Severity

Only people who reach an unknown URL see it: the app has one route, the known inbound links (2 anchors on 1 newsletter post, plus the README) all point at the homepage, a visitor can still go Back or fix the address, and crawlers already get a correct 404 with noindex. That is polish, not a key journey that dead-ends.

## Verification

Confirmed by 1 of 1 skeptics (single P3 verifier, reproduce lens), who re-measured local and live in light and dark and built and measured the corrected fix.

<details><summary>Dissent and notes</summary>

None on severity: the filing lead and the verifier both rate it P3. Corrections adopted from the verifier: the filed fix left the homepage description and og:title on the 404, and with SEO-05's canonical change in place it also carried an og:url for the homepage (og:url https://cense-loan-desk.vercel.app in the filed-fix build), so the metadata export now sets its own description and nulls openGraph and twitter. The filed snippet also lacked the Metadata type import.

Fix choice: the verifier's corrected metadata, which was built and measured. One line of visible copy differs from the filed fix: 'Anything you saved is still in this browser.' becomes 'Opening this page did not change anything you saved.' RES-06 measured that each browser and in-app browser keeps its own copy, so a borrower who saved loans in Safari and opens a bad link inside another app would be promised loans that are not in that browser. The new line is true in every context, and the status, title, link and background results do not depend on the wording. The eslint-disable comment is needed because .eslintrc.json extends next/core-web-vitals, where @next/next/no-html-link-for-pages is an error and the rule scans src/app; Link from next/link would also work but is not what was measured. Ship this with or before SEO-05 and SEO-02, which add metadataBase, a canonical and og:url to the layout. Keep SEO-05's JSON-LD out of layout.tsx: its verifier measured that it would then appear on the 404 too.

</details>

Merged from audit findings: `seo-default-not-found`.
