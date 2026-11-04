# SEO-06: SVG-only favicon, no touch icon

**P3** · effort S · SEO and findability

Loan Desk's only icon is an SVG, a format Google's favicon guide does not list, and there is no Apple touch icon, so Google results and iPhone Home Screen shortcuts may show a generic icon instead of the Cense mark (not yet observed on either).

| | |
|---|---|
| Who it hurts | If Google or iOS will not use the SVG, phone-first borrowers see a generic icon beside the Google result or on a Home Screen shortcut instead of the Cense mark, which makes a money tool look less trustworthy; neither effect has been observed. |
| Standard | Google Search Central favicon documentation (last updated 2026-10-27): supported formats BMP, GIF, ICO, PNG, JPEG, PPM and TIFF (SVG is not listed), icons larger than 48x48 recommended, and rel values icon, shortcut icon, apple-touch-icon and apple-touch-icon-precomposed accepted. |
| Where | The <head> of / in every state and at every viewport, local and live. The surfaces are the favicon beside a Google result on mobile and the icon of an iOS Home Screen shortcut. Code: src/app/icon.svg is the only icon file; Next links it automatically, and the repo has no public/ folder, favicon.ico or apple-icon file. |
| Code | [`src/app/icon.svg:1`](../../src/app/icon.svg#L1) |
| Test | `seo-agentic.spec.mjs`: "SEO-06 search results and iPhone home screens get a raster Cense icon" |
| Fix drafts | Draft materials for the fix are in [`fixes/SEO-06/`](../fixes/SEO-06/). |

## Measured

Raw HTML of / (local and live) has one icon link, <link rel="icon" href="/icon.svg?497578d03306b208" type="image/svg+xml" sizes="any">, generated from src/app/icon.svg. /favicon.ico, /apple-touch-icon.png and /manifest.webmanifest return 404 on live and local; there is no apple-touch-icon or manifest link. Google's favicon documentation (last updated 2026-10-27) lists BMP, GIF, ICO, PNG, JPEG, PPM and TIFF, does not list SVG, recommends icons larger than 48x48 and accepts apple-touch-icon. The meta-validate tool rates the favicon good because a link tag exists. Control with Google's favicon service (undocumented, not a results page): the SVG-only hosts vite.dev, astro.build, starlight.astro.build and rolldown.rs return their real logos, while Loan Desk returns 404 and the generic globe; for the other Cense tools the result did not follow format, and one host changed between runs minutes apart. No Google results page and no iOS device was observed. Fix built in two scratch builds: favicon.ico 32x32, icon.png 192x192 and apple-icon.png 180x180 with no alpha, all 200; icon.svg no longer linked but still served.

## Required

A crawlable raster icon in a listed format and larger than 48x48 (for example a 192x192 PNG), a /favicon.ico, and an opaque 180x180 apple-touch-icon.

## Reproduce

1. Open http://localhost:3100 (or https://cense-loan-desk.vercel.app) and view the page source: the only icon tag is <link rel="icon" href="/icon.svg?497578d03306b208" type="image/svg+xml" sizes="any">, and there is no apple-touch-icon or manifest link.
2. Open /favicon.ico and /apple-touch-icon.png: both 404. From a shell, curl -sI https://cense-loan-desk.vercel.app/favicon.ico prints HTTP/2 404.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-06"`.

## Fix

No code. Add three files next to src/app/icon.svg and Next generates the tags:

src/app/favicon.ico      32x32
src/app/icon.png         192x192
src/app/apple-icon.png   180x180, opaque (no alpha)

Measured output in the scratch builds:

<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="32x32"/>
<link rel="icon" href="/icon.png?310725a7a4200e25" type="image/png" sizes="192x192"/>
<link rel="apple-touch-icon" href="/apple-icon.png?6d45cf126a7e121a" type="image/png" sizes="180x180"/>

All three return 200. Next stops linking icon.svg once icon.png exists but still serves it, so it can stay. Drafts: `audits/fixes/SEO-06/` (favicon.ico, icon.png, apple-icon.png). Export the apple icon on a solid background, because icon.svg has transparent rounded corners (rx="7"). Leave out the optional manifest.

## Severity

It concerns how any phone user would see Loan Desk beside a search result or on a Home Screen, but no one has observed a wrong icon: Google's favicon service shows real logos for SVG-only sites and iOS was not tested. No figure or flow is affected, so this is cheap hardening: P3.

## Verification

Confirmed by 2 of 2 skeptics (standards, reproduce); both lowered the lead's P2 to P3 because no user-visible effect was observed.

<details><summary>Dissent and notes</summary>

Severity: the filing lead rated P2; both skeptics rated P3, adopted here. Both found the impact's two harms unproven. Beside a Google result: SVG-only control sites get their real logos from Google's favicon service, so the missing format is not shown to cause Loan Desk's generic globe; the reproduce skeptic thinks a young vercel.app host not yet processed is the likelier cause, unproven, and the service is not a results page. On iOS: the filed 'screenshot thumbnail' has no support in Apple's archived Safari guide, whose only screenshot mention concerns the startup image, and no device was tested. The two skeptics' service results for the older Cense tools differ (standards run: Loan Lab and Debt Dashboard got the globe; reproduce run: the same Vercel triangle as other .ico tools), and one host changed between runs minutes apart, so the service is a weak signal either way.

Fix choice: the filed static-file fix, built and measured by the lead and both skeptics; no code change. The optional manifest (src/app/manifest.ts with display: "browser") is left out: nothing measured needs it, and RES-06 found that on iOS 26 a Home Screen icon opens Loan Desk with empty storage, so do not pair the touch icon with any prompt to add Loan Desk to the Home Screen. The drafts were made by the audit (apple-icon.png 180x180 RGB with no alpha, icon.png 192x192, favicon.ico 32x32); check them against the brand mark before shipping. Worth doing because it takes minutes and matches Google's documented list, but do not present it as fixing an observed Google defect. The meta-validate tool rates an SVG-only favicon good, so it will not catch a regression; the test above will.

</details>

Merged from audit findings: `seo-favicon-format-and-touch-icon`.
