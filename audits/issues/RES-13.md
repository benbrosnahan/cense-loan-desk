# RES-13: Blank pulsing skeleton when JavaScript fails

**P3** · effort S · Data safety and resilience

If any of the app's script files fails to load, the page shows two pulsing grey bars forever with no text, so the borrower is never told to reload.

| | |
|---|---|
| Who it hurts | A borrower on a flaky phone connection or a filtering network whose script download fails sees a pulsing page with no words and no hint that a reload would fix it. |
| Standard | none |
| Where | Before the app's first render, at any width (measured at 375x812), whenever one of the six script chunks under /_next/static/chunks/ fails to arrive. Local build and live deployment. JavaScript turned off is covered by the noscript message; a chunk that fails is not. |
| Code | [`src/app/page.tsx:294-303`](../../src/app/page.tsx#L294-L303), [`src/app/page.tsx:139-149`](../../src/app/page.tsx#L139-L149), [`src/app/layout.tsx:48-53`](../../src/app/layout.tsx#L48-L53), [`src/app/globals.css:38-67`](../../src/app/globals.css#L38-L67), [`src/app/globals.css:140-149`](../../src/app/globals.css#L140-L149) |
| Test | `resilience.spec.mjs`: "RES-13 when the app cannot start, the borrower is told to reload" |

## Measured

With all six script chunks aborted, or any one of them alone (page, webpack runtime, main-app, fd9d1056, 117 or 137), the page at 375x812 has empty visible text at every sample (3s, 6s and 20s for all chunks or the page chunk; 6s and 12s for each single chunk) while two .animate-pulse bars keep running (pulse, infinite, 2s). No page error is thrown; the console shows only 'Failed to load resource: net::ERR_FAILED'. The live deployment does the same (one load, status 200, 6 chunks blocked: empty text, 2 pulses). The noscript line at layout.tsx:48-53 is in the HTML but only shows with JavaScript off. The hydrated flag is set only by the effect at page.tsx:139-149, which never runs if a chunk fails. A page chunk that stalls 12s and then arrives recovers (blank at 6s, app rendered by 15s), so only a failed chunk is stuck. The proposed fix, injected as equivalent CSS: the line is at opacity 0 at 2s and 7.5s and at 1 at 9s, the same with reduced motion, and gone on a healthy load.

## Required

When the app has not started after a few seconds, a visible line tells the borrower what to do (reload), and it works with no script running.

## Reproduce

1. Open http://localhost:3100 in Chrome with DevTools on the Network panel and reload once.
2. Right-click the page-….js request under /_next/static/chunks/ and choose 'Block request URL' (or block the whole /_next/static/chunks/ pattern in Network request blocking).
3. Reload. The page shows two pulsing grey bars and no text, and nothing changes after 20 seconds. The console shows only 'Failed to load resource: net::ERR_FAILED'.
4. Remove the block and reload: the app renders.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-13"`.

## Fix

Add a line under the skeleton that fades in after 8 seconds using CSS alone, so it appears even when no script ever runs.

src/app/page.tsx, after the second skeleton block at :299:
```tsx
<div className="mt-8 h-44 animate-pulse rounded-3xl bg-slate-200/70" />
<p className="mt-6 text-sm text-slate-700 opacity-0 [animation:reveal_0s_8s_forwards]">
  Still loading. If this stays, reload the page.
</p>
```

src/app/globals.css, beside the rise and unfold keyframes (:42-67):
```css
/* Start-up fallback line. CSS only, so it shows even if no script runs. */
@keyframes reveal {
  to {
    opacity: 1;
  }
}
```

On a healthy load React replaces the skeleton long before 8 seconds, so nobody else sees the line. The reduced-motion rule at globals.css:140-149 shortens animation-duration but not animation-delay, so the line still appears at 8 seconds there. No script, no dependency, nothing sent anywhere.

## Severity

Only visitors whose browser fails to fetch one of the six script chunks, through a dropped connection or a filtering network, see it, and that is uncommon. Their saved loans stay in localStorage and no figure is shown wrong, so the harm is a dead screen with no instructions, not a wrong answer or lost data.

## Verification

Confirmed by 1 of 1 skeptic (P3 review lens), reproduced on the local build with every chunk blocked alone and all together, and once on the live deployment.

<details><summary>Dissent and notes</summary>

None on the defect, severity or fix. The skeptic corrected the filed test ('expect the text to be visible'): it would pass before 8 seconds too, because Playwright's toBeVisible treats opacity 0 as visible, so the test here asserts computed opacity.

Fix choice: the filed CSS-only line, as the skeptic verified it (equivalent CSS injected into the served HTML, not a Tailwind rebuild). It needs no JavaScript, so it covers every failed-chunk case measured. Two harmless side effects: with JavaScript off the line appears after 8 seconds beside the noscript message, and because opacity does not remove text from the page, the line is in innerText and reachable by screen readers before it fades in. Coordinate with SEO-01, which deletes this early return, keeps a skeleton only for returning visitors and server-renders the first-run screen for everyone else: whichever lands second should move this line into the remaining skeleton. SEO-01's skeptics also proposed disabling the first-run buttons until hydration, which leaves them disabled when chunks fail, so the same delayed line belongs under those buttons.

</details>

Merged from audit findings: `resilience-js-failure-blank-skeleton`.
