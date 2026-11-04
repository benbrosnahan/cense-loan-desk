# SEO-02: Share card has no image or URL

**P2** · effort S · SEO and findability

The page asks for a large-image link preview but provides no image and no og:url, so a borrower who is sent the link in a chat or social post sees a text-only preview.

| | |
|---|---|
| Who it hurts | A borrower who is sent the link by a friend, in a group chat or from a social post sees a text-only preview with no image, so a free tool that spreads by link makes a weaker first impression; nothing inside the app changes. |
| Standard | Open Graph protocol (ogp.me): og:title, og:type, og:image and og:url are the four required properties; og:site_name is optional. X Cards reference: twitter:image is not formally required and falls back to og:image, but a summary_large_image card has nothing to show without an image. |
| Where | Every share surface that reads Open Graph or X card tags, from the <head> of / on http://localhost:3100 and https://cense-loan-desk.vercel.app, at every viewport. The metadata block is src/app/layout.tsx:19-34; its openGraph and twitter parts are lines 23-33. |
| Code | [`src/app/layout.tsx:19`](../../src/app/layout.tsx#L19), [`src/app/layout.tsx:23-33`](../../src/app/layout.tsx#L23-L33) |
| Test | `seo-agentic.spec.mjs`: "SEO-02 a shared link shows a preview image and names its own address" |
| Fix drafts | Draft materials for the fix are in [`fixes/SEO-02/`](../fixes/SEO-02/). |

## Measured

Raw HTML of / is the same on local and live: twitter:card is summary_large_image, and og:title ('Loan Desk by Cense'), og:description, og:type (website), twitter:title and twitter:description are present, but there is no og:image, og:url, og:site_name or twitter:image. /opengraph-image, /opengraph-image.png and /twitter-image return 404 on both hosts. src/app holds no image apart from icon.svg, the repo has no public directory, and nothing in src defines metadataBase or a site URL. The meta-validate tool reports og:image missing, og:url missing, twitter:image warning, preview.image null, score 60. Against ogp.me, 2 of the 4 required properties are missing.

## Required

An absolute og:image, conventionally 1200x630 (X shows large cards at about 2:1), that twitter:image can inherit, plus og:url; og:site_name is optional. A scratch build of this fix (built outside the repo) emitted the same absolute URL for og:image and twitter:image, with type, width and height, plus og:url and og:site_name, and /opengraph-image.png returned 200 image/png, 1200x630, 52,636 bytes.

## Reproduce

1. Open view-source:https://cense-loan-desk.vercel.app/ and search the <head> for og:image, og:url, og:site_name and twitter:image: none exist, while twitter:card says summary_large_image.
2. Open https://cense-loan-desk.vercel.app/opengraph-image.png and https://cense-loan-desk.vercel.app/twitter-image: both return 404 (the same on http://localhost:3100).
3. Optional: paste the link into a Slack or iMessage message draft without sending it; the preview should show no image. The audit did not observe a real card; the tags above are what those previews read.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-02"`.

## Fix

In src/app/layout.tsx, define the host (the repo has no constant for it) and add metadataBase, og:url and og:site_name. Keep today's titles and descriptions:

const SITE_URL = "https://cense-loan-desk.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: /* unchanged */,
  description: /* unchanged */,
  openGraph: {
    title: "Loan Desk by Cense",
    description: "Every federal student loan you have, on one screen. Balances, rates, eligible repayment plans, and payoff order.",
    url: "/",
    siteName: "Cense",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Loan Desk by Cense",
    description: "Every federal student loan you have, on one screen.",
  },
};

Then add a 1200x630 PNG at src/app/opengraph-image.png. Next's file convention emits og:image with type, width and height, metadataBase makes it absolute, and because the twitter block sets no images, twitter:image inherits the same file. A draft with the real headline and brand colours is at `audits/fixes/SEO-02/opengraph-image.png`; redo it in Bricolage Grotesque and Instrument Sans. If SEO-01's /repayment-plans guide ships with its own openGraph block, add images: ["/opengraph-image.png"] there, because a route that sets its own openGraph without images emits no og:image.

## Severity

Everyone who shares or receives the link gets a preview with no image, on every share, and two of the four properties the Open Graph protocol requires are missing. No figure, date or answer is wrong, so the harm is bounded to a weaker first impression for a tool that spreads by link.

## Verification

Confirmed by 2 of 2 skeptics (standards, reproduce); severity unchanged at P2.

<details><summary>Dissent and notes</summary>

No disagreement on the defect or on P2. Corrections adopted from the skeptics: X's Cards reference marks twitter:image as not required and falls back to og:image, so the X half is softer than 'needs an image', though the declared large-image card has nothing to show; og:site_name is optional and 1200x630 is a convention, not an OGP rule; the original impact's 'generic title' was unsupported (og:title is 'Loan Desk by Cense') and is dropped; the original snippet used SITE_URL, which the repo does not define (0 matches in src), so the fix defines it; and the /repayment-plans line applies only if SEO-01's guide ships. No real X, iMessage or Slack card was observed.

The member also proposed new og:title and og:description copy. It is not needed for this defect, so the fix keeps today's strings; the skeptics' scratch build used the new copy, which does not change how the image tags are emitted. In a scratch build outside Vercel with the image but no metadataBase, og:image resolved to http://localhost:3000/opengraph-image.png, so ship the image and metadataBase in one change. SEO-01's guide step needs the same SITE_URL for an absolute canonical, so it can live in a small shared module such as src/data/site.ts. Optional and not in the verified build: src/app/opengraph-image.alt.txt for og:image:alt. The image is a static file served from the same host, so nothing leaves the device and no dependency is added.

</details>

Merged from audit findings: `seo-share-image-missing`.
