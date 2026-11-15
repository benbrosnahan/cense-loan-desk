# SEC-02: Next 14 is end of life: plan the exit, static export first

**P3** · effort M · Security, privacy and best practices

The site runs on Next.js 14.2.35, which no longer gets security fixes, so a future Next.js flaw that reaches borrowers would have no patch; none of today's 25 advisories reaches this static deployment.

| | |
|---|---|
| Who it hurts | No borrower is exposed today; if a future Next.js flaw does reach this page there will be no 14.x patch, and the move to 16 adds about 45 to 47 KB of compressed script to every first visit on a phone. |
| Standard | Next.js support policy (nextjs.org/support-policy, read 2026-11-02): 16.x Active LTS, 15.x Maintenance LTS with security releases through 2027-01-31, 14.x Unsupported; the policy reserves rare out-of-policy patches. npm audit --omit=dev. Next.js static exports documentation (headers, rewrites and default image optimization are unsupported under export). |
| Where | package.json:14 (next 14.2.35) and package.json:15-16 (React 18); next.config.mjs, whose empty config makes Vercel deploy 6 Next functions for a page that needs none. Every visitor, every viewport. |
| Code | [`package.json:14`](../../package.json#L14), [`package.json:15-16`](../../package.json#L15-L16), [`package.json:8`](../../package.json#L8), [`package.json:9`](../../package.json#L9), [`next.config.mjs:2`](../../next.config.mjs#L2), [`src/app/page.tsx:140`](../../src/app/page.tsx#L140) |
| Test | `security-privacy.spec.mjs`: "SEC-02 the site runs on a Next.js release line that still gets security fixes" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

npm audit --omit=dev: 32 advisories in 4 packages; next 14.2.35 has 25 (3 critical, 9 high, 11 moderate, 2 low), postcss 4, source-map-js 1, xlsx 2. All 25 next ranges include 14.2.35 and none has a 14.x patch: 14.2.35 is the last 14.x release (dist-tag next-14), and the earliest versions clean of all 25 are 15.5.28 and 16.4.1. The support policy lists 14.x as Unsupported and gives 15.x security releases through 2027-01-31, 90 days from this audit. Triage of all 32 against this deployment: 0 reachable; 2 conditional (GHSA-wfc6-r584-vfw7 and GHSA-vfv6-92ff-j949, RSC cache poisoning, availability only because the server holds no user data); GHSA-ffhc-5mcf-pf4q only if CSP nonces were added. Inputs checked: 0 next/image, next/script or 'use server' in src, no middleware, rewrites [], an empty server-reference manifest, 0 sharp in the lockfile, and xlsx used only to write files (its advisories exempt export-only use). Vercel's builder run locally (CLI 65.10.0, @vercel/next 28.0.1) emits 6 functions for today's build (index, index.rsc, _not-found, _not-found.rsc, icon.svg, icon.svg.rsc; index.func carries the next-server runtime in 112 files); with output: "export" it emits 0, keeps immutable caching on /_next/static and compiles vercel.json headers. On live, every probed route was a static cache HIT with no function region, and /_next/image is Vercel's own optimizer (200 image/svg+xml for the icon, 400 INVALID_IMAGE_OPTIMIZE_REQUEST for a remote URL), while next start answers the same URLs with Next's own 400 errors. Export on 14.2.35: build exit 0, First Load JS for / still 125 kB (+93 to 95 bytes gzip), out/ has 27 files, and the journey on a static server at 1280 and 375 had 0 console messages, 0 violations, 0 offsite requests and 2 downloads (18,191 and 22,225 bytes, as today). next dev still answers 200; next start exits 1 ('does not work with output: export'). Upgrades in scratch with no source change: 15.5.28 with React 19 builds, verify passes 180 of 180, 7 advisories remain (0 on next itself); 16.4.4 with React 19 builds, verify passes 180 of 180, 3 advisories remain (source-map-js, xlsx), Next rewrites tsconfig.json, npm run lint exits 1, and eslint . reports react-hooks/set-state-in-effect at src/app/page.tsx:140. Script a modern browser downloads on first load, gzip, without the 39,373-byte nomodule polyfill it never fetches: 14.2.35 124,571 bytes; 15.5.28 about 139,900 (+15.3 KB, +12%); 16.4.4 171,071 with Turbopack (+46.5 KB, +37%) or 169,490 with webpack (+44.9 KB, +36%). Live sends the same 6 scripts at 129,004 compressed bytes, so gzip is a fair proxy. On 16 with Turbopack, SEC-01's Trusted Types lines leave both spreadsheet downloads empty (0 files, 2 page errors, 2 violations); without those lines or with --webpack, 2 files and 0 violations.

## Required

A Next.js line that still receives security releases: 16.x, or 15.x only until 2027-01-31. Until then, a deployment with no Next server code for server-side advisories to reach and no growth in first-load script. npm audit stays red until the upgrade, because it reads the lockfile, not the deployment.

## Reproduce

1. In a copy of the repo run npm audit --omit=dev: 32 advisories, 25 of them on next 14.2.35, none offering a 14.x fix.
2. Run npm view next dist-tags: next-14 is 14.2.35, backport 15.5.28, latest 16.4.4.
3. Open https://nextjs.org/support-policy: 14.x is listed under Unsupported, and 15.x security releases end 2027-01-31.
4. Run curl -sI 'https://cense-loan-desk.vercel.app/_next/image?url=%2Ficon.svg&w=64&q=75': 200 image/svg+xml although src never uses next/image (Vercel's optimizer serves it, x-matched-path /icon.svg).
5. In a scratch copy set next.config.mjs to { output: "export", images: { unoptimized: true } } and run npm run build: First Load JS for / stays 125 kB and out/ holds 27 files; npm start then exits 1.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEC-02"`.

## Fix

Step 1, now: deploy a static export, so no Next server code is left for server-side advisories to reach.

next.config.mjs:2
const nextConfig = { output: "export", images: { unoptimized: true } };
export default nextConfig;

headers() does not apply under export, so the SEC-01 and SEC-03 headers move to a new vercel.json, as one rule so every document carries the policy:
{ "headers": [ { "source": "/(.*)", "headers": [
  { "key": "Content-Security-Policy", "value": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types nextjs nextjs#bundler" },
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" },
  { "key": "Referrer-Policy", "value": "no-referrer" },
  { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
] } ] }

Delete "start": "next start" at package.json:8, which exits 1 under export; to preview a production build locally, serve out/ with any static file server. Deploy a Vercel preview first and check with curl -sI that /, /no-such-page and /icon.svg carry the policy and that /_next/image?url=%2Ficon.svg&w=64&q=75 returns 404.

Step 2, planned: leave 14 in one move, straight to 16, because 15.x security releases end 2027-01-31:
npm i next@16.4.4 react@19 react-dom@19 && npm i -D eslint-config-next@16.4.4 eslint@10 @types/react@19 @types/react-dom@19
No source change is needed. Next rewrites tsconfig.json itself. next lint no longer exists, so replace "lint": "next lint" at package.json:9 as the ESLint issue describes ("eslint ." with a flat eslint.config.mjs, and a one-line reason to disable react-hooks/set-state-in-effect on the deliberate hydrate effect at src/app/page.tsx:140). Either drop the two Trusted Types entries from the CSP or build with next build --webpack, because Turbopack plus Trusted Types makes both spreadsheet downloads silently produce no file. Before merging, record first-load script bytes: expect about +45 to +47 KB compressed (+36 to 37%).

## Severity

No borrower is affected on any visit today: 0 of the 25 Next advisories reach this static deployment, and the 2 conditional ones (RSC cache poisoning) could at worst affect availability, with no user data on the server to expose. What remains is the risk that a future flaw has no 14.x patch, which this rubric counts as maintenance and hardening.

## Verification

Confirmed by 6 of 6 skeptics across the 3 findings (standards and reproduce on each); 3 kept P2, 3 rated P3.

<details><summary>Dissent and notes</summary>

Severity: both skeptics on bp-next14-eol and the reproduce skeptic on dx-next-upgrade-path kept P2 ('an unsupported line with 0 of 25 advisories back-ported is a real but bounded risk'); the standards skeptic on dx-next-upgrade-path and both skeptics on bp-static-export rated P3 because no borrower is hurt and nothing is reachable. This issue takes P3 because the stricter rubric judges harm in this deployment and names maintainability as P3. Evidence for export: both bp-static-export skeptics found that live /_next/image is Vercel's own optimizer rather than Next's code, so the 5 image-optimizer advisories (which exempt Vercel or are self-hosted only) never applied here and removing the route changes nothing about them; the real gain is 6 deployed functions becoming 0. Sizes: the filed +48.3 KB (+38%) and +16.7 KB (+13%) compared a build without the proposed headers against upgrades with them; the filed +46.5 KB (+28%) and 163,944 bytes counted a 39,373-byte nomodule polyfill that modern browsers never fetch, which also made export look like a 39 KB saving it is not. Corrected: +44.9 to +46.5 KB (+36 to 37%) for 16 and +15.3 KB (+12%) for 15. The dx standards skeptic quoted a brotli budget of +35 to +39 KB from offline quality-11 brotli; the bp standards skeptic found Vercel's brotli is not smaller than gzip on the largest live chunk (55,068 against 54,312 bytes), so this issue uses the gzip figures. Upgrade path: dx-next-upgrade-path filed 'go to 15.5.x first and skip React 19'; its standards skeptic showed that 15.5.x has security releases only until 2027-01-31, that the page already ships React 19 code under Next 15 whatever package.json says, that react@19 costs 0 bytes, and that the upgrade guide makes 19 the minimum, so this issue goes straight to 16 with React 19. Wording: 'gets no more patches' is the expected outcome, not a guarantee, because the policy reserves rare out-of-policy patches; post-upgrade audit counts such as '0 critical, 3 high, 1 moderate' count packages, not advisories (7 advisories remain on 15.5.28, 3 on 16.4.4). The filed vercel.json put the CSP on / only; both bp-static-export skeptics required every same-origin document to carry it (one rule here, as in SEC-01).

Why export first: it is a config change that turns what live already shows (every probed route a static cache HIT, no function region) into a guarantee, removes the RSC-header rewrites behind the 2 conditional advisories, and leaves first-load script unchanged, so the upgrade becomes a choice you can schedule. It does not turn npm audit green, which reads the lockfile, and the RSC payload survives as a static /index.txt, which is expected. Step 1 alone is under an hour; the M covers the upgrade, the lint migration, the bundle check and device checks. Why straight to 16: 15.5.28 clears all 25 next advisories with no code change for +15.3 KB, but buys only 90 days of security releases and a second migration. Do not upgrade for features: nothing this page uses needs 15 or 16. ESLint: eslint@10 is what the ESLint issue recommends; it installs with 3 non-blocking ERESOLVE peer warnings because eslint-plugin-react, jsx-a11y and import cap at ESLint 9, and eslint@9 installs with 0 but is flagged unsupported by npm. Browser tests should serve out/, not next start; next dev keeps working and .gitignore already covers /out/. Not verified by anyone: export on a real Vercel deployment (the Vercel builder was run locally and compiled the headers), so deploy a preview first. Triage limits: no RSC header was sent to live, to avoid poisoning a shared cache, so 'conditional' rests on advisory text and the Vary header; one GET with a Next-Action header returned 403 x-vercel-mitigated: deny and probing stopped there.

</details>

Merged from audit findings: `bp-next14-eol`, `dx-next-upgrade-path`, `bp-static-export`.
