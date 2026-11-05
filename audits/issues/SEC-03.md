# SEC-03: Baseline security headers missing

**P3** · effort S · Security, privacy and best practices

Responses carry none of the baseline security headers (frame, MIME-sniffing, referrer and permissions policies), so nothing would stop a later change from exposing borrowers; today the browser's storage partitioning and the links' rel="noopener noreferrer" already cover each gap.

| | |
|---|---|
| Who it hurts | No borrower is hurt today; the headers keep a future link, script or browser sniffing quirk from undoing what the code and browser already get right. |
| Standard | OWASP Secure Headers Project (a recommendation, not a requirement). |
| Where | Every response from https://cense-loan-desk.vercel.app/ (/, the 8 linked JS and CSS assets, /icon.svg), in every state and at every viewport. |
| Code | [`next.config.mjs:2`](../../next.config.mjs#L2), [`src/app/page.tsx:404`](../../src/app/page.tsx#L404), [`src/app/page.tsx:851`](../../src/app/page.tsx#L851), [`src/components/loans/LoanForm.tsx:244`](../../src/components/loans/LoanForm.tsx#L244), [`src/components/plans/PlansPanel.tsx:485`](../../src/components/plans/PlansPanel.tsx#L485) |
| Test | `security-privacy.spec.mjs`: "SEC-03 another site cannot frame the app, and its responses refuse MIME sniffing, referrers and unused device features" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Absent on live for /, all 8 linked JS and CSS assets and /icon.svg: X-Frame-Options (and CSP frame-ancestors), X-Content-Type-Options, Referrer-Policy and Permissions-Policy. Strict-Transport-Security is present. Header-check score 40 (a fresh run on live also gave 40); lab scan headers category 27 in all 6 stored live runs. Real exposure, header by header. Framing: the app can be framed today, but a cross-site frame sees 0 loans against 8 at top level and the parent's read of the frame throws SecurityError, in Chromium on the local build and on live, and in WebKit (1 seeded loan at top level, 0 in the frame); a same-site control frame shows all 8, so storage partitioning is the cause. MIME sniffing: chunks, CSS and the icon already carry correct types (application/javascript, text/css, image/svg+xml). Referrer: all 4 external links carry rel="noopener noreferrer"; 9 real clicks across 6 states sent Referer null, an empty document.referrer and a null opener, while control clicks with rel removed sent the page URL. Permissions: src uses no powerful-feature API. Access-Control-Allow-Origin * on all 10 responses is Vercel's default, with no credentials header and no Set-Cookie on a public page, so it needs no action. With the header block from SEC-01 on next start: every header present on /, a cross-site frame is refused (frame URL chrome-error://chromewebdata/; WebKit shows a contentless frame whose localStorage throws SecurityError), and a 13-step journey at 1280 and 390 matched the current build's text except one snapshot timestamp minute, with 0 CSP violations, 0 console errors and 2 downloads of equal bytes.

## Required

The standard set on every response: frame-ancestors 'none' (with X-Frame-Options DENY for older browsers), X-Content-Type-Options nosniff, Referrer-Policy no-referrer, and a Permissions-Policy that disables features the page does not use, with the journey unchanged.

## Reproduce

1. Run curl -sI https://cense-loan-desk.vercel.app/ : there is no x-frame-options, x-content-type-options, referrer-policy or permissions-policy line; strict-transport-security is present.
2. Why nobody is exposed today: open http://localhost:3100 and click 'Look around with example loans' (8 loans are saved). Serve a one-line page from a different site, for example http://127.0.0.1:8080/, containing <iframe src="http://localhost:3100/"></iframe>: the frame loads but shows the empty first-run screen, because the browser gives a cross-site frame its own storage.
3. Click any external link, for example studentaid.gov on the empty Loans screen: in the new tab, document.referrer is empty and window.opener is null.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEC-03"`.

## Fix

No separate code: these headers are the last five entries of the one /(.*) rule in SEC-01's next.config.mjs (frame-ancestors 'none' comes with its Content-Security-Policy):

{ key: "X-Content-Type-Options", value: "nosniff" },
{ key: "X-Frame-Options", value: "DENY" },
{ key: "Referrer-Policy", value: "no-referrer" },
{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },

Under SEC-02's static export, the same list sits in vercel.json in the same rule as the CSP. If you add these without SEC-01's CSP, X-Frame-Options DENY alone still refuses framing.

## Severity

No borrower is affected on any visit: a cross-site frame sees 0 of 8 saved loans because Chromium and WebKit partition storage, all 4 external links already send no referrer, assets carry correct MIME types and the page uses no powerful browser feature. The headers only guard against a future change undoing that, which is hardening.

## Verification

Confirmed by 1 of 1 skeptic (reproduce, in Chromium and WebKit, on the local build and live); P3 kept.

<details><summary>Dissent and notes</summary>

None. The skeptic reproduced every sub-claim, including the risk reasoning, which was the part most likely to be wrong.

Adopting SEC-01 closes this issue with no extra code, because the header block is shared. The skeptic added two facts that support P3: WebKit partitions storage too, which covers iPhone users, and vercel.app is on the Public Suffix List, so another Vercel deployment counts as cross-site and gets an empty partition. Access-Control-Allow-Origin * is Vercel's default on a public page with no credentials or cookies and needs no change. Not tested: Firefox, and the headers on Vercel itself (only on next start), so keep the post-deploy curl.

</details>

Merged from audit findings: `bp-baseline-headers`.
