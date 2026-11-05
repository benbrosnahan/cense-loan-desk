# PERF-03: Snapshot fade-in delay grows with the list

**P3** · effort S · Performance

Each older snapshot on the Records tab waits another 0.03s to fade in, so with 50 or more snapshots a borrower who jumps to the bottom sees blank space where their oldest records should be for seconds.

| | |
|---|---|
| Who it hurts | A long-time user who jumps to the bottom of Records to find their oldest dated balance, the evidence this page exists to keep, sees empty space there for about 1.5s with 50 snapshots and up to about 15s with 500, which can read as missing records; scrolling at a normal speed never shows it, and at 12 monthly snapshots the delay is only 0.33s. |
| Standard | None. |
| Where | Records tab with 50 or more snapshots, measured at 412x823, in the first seconds after the tab opens, when the borrower jumps to the end of the list. HistoryPanel.tsx:104 passes delay={0.03 * i} to FadeIn, which sets it as animation-delay (ui.tsx:497); .rise uses fill-mode both (globals.css:53), so each card sits at opacity 0 until its delay ends. The reduced-motion block shortens duration only (globals.css:144), so the delay applies there too. |
| Code | [`src/components/history/HistoryPanel.tsx:104`](../../src/components/history/HistoryPanel.tsx#L104), [`src/components/shared/ui.tsx:497`](../../src/components/shared/ui.tsx#L497), [`src/app/globals.css:53`](../../src/app/globals.css#L53), [`src/app/globals.css:144`](../../src/app/globals.css#L144) |
| Test | `perf.spec.mjs`: "PERF-03 every saved record is fully visible within a second of opening Records, however many there are" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Oldest card's computed animation-delay and opacity right after a real click on Records: 0.33s and 0 at 12 snapshots, 1.47s and 0 at 50, 14.97s and 0 at 500, exactly 0.03 x (n - 1). It reached opacity 1 at about 577ms, 1,708ms and 15,222ms (timings noisy on a shared machine; delays exact). Staying at the top: 0 blank cards in view at every size. Jumping to the end at +150ms: 3 blank cards in view until about 1.5s at 50 snapshots, and still 3 blank at 3s with 500. Constant-speed scrolling: the reveal moves down the page at about 6,533px/s at any list length; 0 blank frames at 2,000 to 6,000px/s, while at 8,000 and 12,000px/s 53 of 76 and 44 of 51 frames had blank cards at 50 snapshots (217 and 235 of 242 at 500). With prefers-reduced-motion at 50 snapshots the delay is still 1.47s (opacity 1 at about 1,481ms).

## Required

Every record is visible when the section opens, and the wait must not grow with the number of snapshots. With the delay capped at 0.3s, the oldest card reached opacity 1 at about 539ms with 50 snapshots and 560ms with 500, and every card was opaque at 1.5s.

## Reproduce

1. Open http://localhost:3100 and click 'Look around with example loans'.
2. In the DevTools console, write 50 snapshots and reload:
const loans = JSON.parse(localStorage.getItem('cense.loandesk.loans.v1'));
const total = loans.reduce((s, l) => s + l.balance, 0);
localStorage.setItem('cense.loandesk.snapshots.v1', JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ takenAt: new Date(Date.UTC(2010, 0, 1) + i * 7 * 864e5).toISOString(), loans, totalBalance: total }))));
location.reload();
3. Click the Records tab and press End (or drag the scrollbar to the bottom) straight away. The oldest cards at the bottom are blank for about 1.5s; with length: 500 they are still blank after 3s, and the last card's computed animation-delay is 14.97s.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "PERF-03"`.

## Fix

Cap the stagger at src/components/history/HistoryPanel.tsx:104:
<FadeIn key={snap.takenAt} delay={Math.min(0.03 * i, 0.3)}>
The newest cards keep today's stagger; from the eleventh card on, every card starts at 0.3s, so the whole list is visible about half a second after the tab opens at any length (measured with the cap: oldest card opaque at about 539ms with 50 snapshots and 560ms with 500).

## Severity

It needs 50 or more saved snapshots, which takes years of regular saving, and shows only when the borrower jumps to the bottom (End key, scrollbar drag, find-in-page) or flings faster than about 6,500px/s in the first seconds; nothing is lost and the cards appear on their own.

## Verification

Confirmed by 1 of 1 skeptic (reproduce); severity unchanged at P3.

<details><summary>Dissent and notes</summary>

No disagreement on the defect, severity or fix. The skeptic narrowed the impact: the first view is never blank, and because the reveal moves down the page at about 6,533px/s at any list length, a borrower scrolling slower than that never meets a blank card; only a jump (End key, scrollbar drag, find-in-page) or a very hard fling does, and the list length then sets how long the blank lasts. The filed impact ('appears blank for seconds') holds only for those jumps. The skeptic also found that reduced-motion users keep the full delay, which the finding did not cover.

Only one fix was proposed, and it meets the requirement on its own. Optional: the reduced-motion block (globals.css:140-149) shortens animation-duration but not animation-delay, so reduced-motion users wait the full delay today; adding animation-delay: 0s !important there would show their cards at once. PlansPanel.tsx:404 uses the same 0.03s stagger, but over at most the six plans in PLAN_ORDER, so it stays short and needs no change.

</details>

Merged from audit findings: `resilience-snapshot-stagger-delay`.
