# PERF-01: Display font ships unused weights

**P3** · effort S · Performance

The headline font downloads every weight from 200 to 800 although the app only ever draws it bold, so first-time visitors on slow connections fetch 18.8 KB of unused font and see the page about 100ms later.

| | |
|---|---|
| Who it hurts | Every first-time visitor on a slow connection, often a borrower on a phone, downloads 18.8 KB of font weights the page never draws and sees the page about 100ms later; repeat visitors load the font from cache and are not affected. |
| Standard | None. The Core Web Vitals LCP 'good' line is 2.5s and LCP is already under it (medians 2,400ms today and 2,298ms with the fix on slow 4G plus 4x CPU), so this is an improvement, not a failure. |
| Where | Every cold (uncached) load of the one route, at every viewport, on localhost:3100 and the live site. The display font is preloaded, so on a slow link its extra bytes compete with the JavaScript for bandwidth. Repeat visits load it from cache. The font is configured at src/app/layout.tsx:8. |
| Code | [`src/app/layout.tsx:8`](../../src/app/layout.tsx#L8) |
| Test | `perf.spec.mjs`: "PERF-01 a first visit downloads only the font weights the page draws" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

The Bricolage Grotesque file (9d5a263311222317-s.p.woff2) is 41,236 B on localhost:3100, on a scratch build of HEAD and on the live site: a variable font with a wght axis of 200 to 800 (default 800) whose gvar variation table alone is 15,102 B. A computed-style census over 15 states at 2 viewports finds every text node in the display font at font-weight 700 and none at any other weight; the five audited states carry 43 to 159 characters of display text. A scratch build with weight: "700" serves a 22,400 B file (-18,836 B, -45.7%; all woff2 71,140 -> 52,304 B) that is still preloaded, with the same 268 glyphs, OpenType features and fallback metrics. Cold-load A/B over HTTP/2 with Lighthouse slow 4G (188,744 B/s down, 562.5ms latency) plus 4x CPU, 412px, cold cache, 12 rotated runs per arm plus an A/A arm: LCP median 2,400 -> 2,298ms (-102ms; A/A -4ms), first real content 2,396 -> 2,293ms, last JavaScript response 2,266.5 -> 2,164.5ms. The LCP ranges (2,380-2,412 vs 2,288-2,320ms) do not overlap, and the byte saving alone predicts 99.8ms at this bandwidth. The lead's 6-run A/B gave 2,388 -> 2,288ms. The LCP element in all 36 runs is the header H1 'Loan Desk'. Timings come from a shared, noisy machine; the A/A arm stayed within 4ms.

## Required

No font file larger than the design uses, with rendering unchanged. The 700-only build meets this: page heights are identical in all 10 state and viewport pairs, 0 line breaks change, the largest text-width change is 0.70px (the hero line at 1280; 0.41px at 375), and 0.10 to 0.33% of pixels differ at glyph edges against an A/A of 0.000%, which is not visible side by side.

## Reproduce

1. Open http://localhost:3100 in Chrome with DevTools on the Network tab, tick 'Disable cache', filter to Font, and reload.
2. The display font 9d5a263311222317-s.p.woff2 is 41,236 B; Instrument Sans (26d0ba92e140f0dc-s.p.woff2) is 29,904 B.
3. In Elements, inspect the header 'Loan Desk', any section heading or the Payoff headline: the computed font-weight is 700 every time.
4. Apply the fix, build, and repeat step 1: the display font is 22,400 B.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "PERF-01"`.

## Fix

In src/app/layout.tsx:8, load only the weight the design draws:
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-display",
  display: "swap",
});
Leave Instrument Sans (layout.tsx:13) variable: it really draws 400, 600 and 700. A scratch build with this change compiles with no warnings, keeps the preload and the fallback metrics (ascent 88.21%, descent 25.61%, size-adjust 105.43%), and serves a 22,400 B bold file.

## Severity

Only first-time visitors on slow connections are affected, by about 100ms on a load whose LCP is already under 2.5s, and no figure, date or answer changes; repeat visits load the font from cache. That is polish under this rubric.

## Verification

Confirmed by 1 of 1 skeptic (reproduce); severity unchanged at P3.

<details><summary>Dissent and notes</summary>

No disagreement on the defect, severity or fix. Corrections adopted from the skeptic: today's woff2 total is 71,140 B, not 72 KB (the 55 KB test threshold still separates before and after); the largest text-width change is 0.70px at 1280, not 0.28px; the LCP element is the header 'Loan Desk' H1, not the hero; and the test idea's reason was wrong, because a 700-only face renders a lighter request bold instead of synthesizing it, which is why the guard is still worth having. Headline timings use the skeptic's 12-run A/B with an A/A arm (-102ms); the lead's 6-run A/B (-100ms) agrees.

Only one fix was proposed. The skeptic checked the live site's file size but did not A/B the live site's load. If a later design needs a second display weight, measure before choosing: two static files can outweigh the 41,236 B variable file.

</details>

Merged from audit findings: `perf-bricolage-variable`.
