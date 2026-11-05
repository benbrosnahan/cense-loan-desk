# SEO-05: No canonical, structured data or crawler policy

**P3** · effort S · SEO and findability

The page declares no canonical URL and no structured data, so search engines must guess which of the identical tagged and untagged addresses to show borrowers, and readers that do not run JavaScript get no machine-readable summary of what Loan Desk is.

| | |
|---|---|
| Who it hurts | Search engines have to pick the preferred address among identical URL variants on their own, so tagged links can split signals between them, and parsers that do not run JavaScript get no machine-readable statement that Loan Desk is a free calculator that keeps data in the browser, which limits how tools can describe it to a borrower. |
| Standard | Google Search Central canonicalization guidance (declare the preferred URL with rel=canonical); schema.org WebApplication under Google's structured data general guidelines, which say not to mark up content that readers cannot see. Google's software-app rich result requires aggregateRating or review, so no rich result is expected. |
| Where | The single <head> shared by every state and viewport: raw HTML of / on http://localhost:3100 and live, and of tagged variants such as /?utm_source=beehiiv&utm_medium=email. Code: the metadata object in src/app/layout.tsx:19-34 has no metadataBase, alternates or openGraph.url. page.tsx is a client component with two <main> returns: the pre-hydration skeleton (the hydrated gate at src/app/page.tsx:294, <main> at :296), which is the only one in server HTML, and the app (src/app/page.tsx:310-315). |
| Code | [`src/app/layout.tsx:19-34`](../../src/app/layout.tsx#L19-L34), [`src/app/page.tsx:294`](../../src/app/page.tsx#L294), [`src/app/page.tsx:296`](../../src/app/page.tsx#L296), [`src/app/page.tsx:310-315`](../../src/app/page.tsx#L310-L315) |
| Test | `seo-agentic.spec.mjs`: "SEO-05 a tagged link to / declares one canonical address, and the server HTML describes Loan Desk as structured data" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Canonical: raw HTML of / on local and live has 0 canonical links and no og:url, and layout.tsx:19-34 sets no metadataBase. Live / and /?utm_source=beehiiv&utm_medium=email both return 200 and 7320 bytes and are byte-identical (cmp exit 0, same sha256 and ETag); the newsletter's real tagged form (utm_medium=referral&utm_source=cense.beehiiv.com) is byte-identical too, and so is local. Lighthouse 13.1.0 marks the canonical audit notApplicable (score null), which is why the SEO score of 100 never flagged it. A sweep of 107 of the newsletter's 108 sitemap URLs (/authors is a 404) found cense-decode.vercel.app linked 326 times, 322 of them UTM-tagged, and cense-loan-desk.vercel.app linked by 2 anchors on 1 post, 0 tagged. Structured data: 0 JSON-LD blocks in raw HTML and 0 after rendering, local and live; tools/structured-data.json totalSchemas 0; GEO structuredData 0 of 20. Fix builds in scratch: with the canonical fix, /?utm_source=x returns canonical and og:url https://cense-loan-desk.vercel.app and Lighthouse's canonical audit becomes binary with score 1. A JSON-LD block placed only in the app <main> gives raw 0, rendered 1; placed in both <main> returns it gives raw 1, rendered 1, present in all 6 states tested, 0 on the 404, no console errors; placed in layout.tsx it also appears on the 404.

## Required

One absolute canonical and og:url naming https://cense-loan-desk.vercel.app on the indexable route, whatever query string a link adds, and none on the 404. One JSON-LD block in the server HTML that describes only what a reader can see on the page, with no invented rating or review.

## Reproduce

1. Open http://localhost:3100/?utm_source=beehiiv&utm_medium=email (or the same path on https://cense-loan-desk.vercel.app) and view the page source. The <head> has a title and a description but no <link rel="canonical">, no og:url and no <script type="application/ld+json">.
2. Click 'Look around with example loans', open each section and inspect the DOM: there is no JSON-LD in any state.
3. Compare with the untagged page: curl -s https://cense-loan-desk.vercel.app/ -o a.html; curl -s 'https://cense-loan-desk.vercel.app/?utm_source=beehiiv&utm_medium=email' -o b.html; cmp a.html b.html exits 0, and grep -c 'rel="canonical"' a.html prints 0.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-05"`.

## Fix

1. New file src/data/site.ts (a layout or page module may export only the names Next expects, and page.tsx needs the constant too):

export const SITE_URL = "https://cense-loan-desk.vercel.app";

2. src/app/layout.tsx: add import { SITE_URL } from "@/data/site"; and in the metadata object (line 19):

metadataBase: new URL(SITE_URL),
alternates: { canonical: "/" },
openGraph: { url: "/", /* existing title, description, type */ },

3. src/app/page.tsx, module scope after the imports:

import { SITE_URL } from "@/data/site";

const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Loan Desk",
  url: `${SITE_URL}/`,
  description: "Every loan you have, on one screen: what you owe, which repayment plans you can actually use, and what extra money would change. Everything you type stays in this browser.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Cense", url: "https://cense.beehiiv.com" },
});
const JsonLd = () => (
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
);

Render <JsonLd /> as the first child of both <main> elements: the pre-hydration skeleton (line 296), the only one in server HTML, and the app (line 310).

4. Ship with SEO-07, whose not-found.tsx sets alternates: { canonical: null }, openGraph: null and twitter: null, so the 404 does not inherit the homepage canonical and og:url.

## Severity

No borrower sees a wrong figure or a broken page; both gaps are hints for search engines and parsers. The duplicate-URL risk is still prospective (the newsletter's 2 links to Loan Desk are untagged) and this markup earns no rich result without ratings, so it is hardening: P3.

## Verification

Confirmed by 1 of 1 skeptic on each of the two members (P3 review lens): the canonical finding reproduced as filed, and the structured-data finding was confirmed with a corrected fix.

<details><summary>Dissent and notes</summary>

Structured data: the skeptic showed that the filed fix fails on this codebase. A block placed only in the app <main> never reaches server HTML, because page.tsx returns the skeleton <main> while hydrated is false (line 294): measured raw 0 blocks, rendered 1, so it fails its own test idea and misses the non-rendering readers its impact names. The filed fix proof (patched-home.html, 1 block) came from a broader scratch patch that also prerendered the app. The filed description named RAP, IBR, Tiered Standard, PSLF and the July 1, 2026 cutoff, each with 0 visible hits on first run, against Google's rule to mark up only visible content. File reference corrected from page.tsx:309-315 to :296 and :310-315. Canonical: the skeptic re-tested with the newsletter's real tagged form instead of the filed utm_medium=email and got the same byte-identical result, rated the impact prospective, and could not reproduce the filed claim that /repayment-plans sets its own canonical, because that route exists only in another patch. Without a not-found.tsx, the 404 inherits the homepage canonical and og:url. Severity: no disagreement; both leads and both skeptics rated P3.

Fix choice: the skeptic's placement in both <main> returns, built and measured. layout.tsx was measured too and puts the block on the 404 as well; if SEO-01 merges the two returns, one placement is enough. Description: the skeptic's version opened with 'See every federal student loan on one screen', a phrase visible only once A11Y-17's new headline ships; this one uses the current visible headline 'Every loan you have, on one screen.' (page.tsx:359), the paragraph at page.tsx:362-365 and PRIVACY_NOTE (src/data/plans.ts:285, shown in the footer), so every phrase is on screen today. Update it if the headline changes. Keep RAP, IBR, Tiered Standard, PSLF and the July 2026 cutoff out until SEO-01 makes them visible text. Expect no stars: Google's software-app rich result needs aggregateRating or review, which must not be invented. Skip FAQPage as a rich-result play: Google's search updates page says the FAQ feature stopped appearing in Search from May 7, 2026. Overlap: metadataBase, SITE_URL and og:url are the same lines SEO-02 (share card) needs, and SITE_URL is the one place to change after SEO-08's domain decision. A tagged link to Loan Desk does exist outside the newsletter: Loan Lab's results card links /?utm_source=loan-lab&utm_medium=tool&utm_campaign=loan-lab-footer (SEO-04 evidence), though only after a six-step quiz. Excluded: the third filed member, agentic-no-structured-data-or-discovery (robots.txt, llms.txt, a markdown copy), was not confirmed after a tie-break, so this issue does not cover a crawler policy.

</details>

Merged from audit findings: `seo-no-canonical`, `seo-no-structured-data`, `agentic-no-structured-data-or-discovery`.
