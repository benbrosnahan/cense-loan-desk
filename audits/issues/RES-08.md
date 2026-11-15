# RES-08: Spreadsheet download fails silently

**P2** · effort S · Data safety and resilience

When the spreadsheet code cannot load (offline, blocked, a 404, or after a 2-minute stall), both 'Download as a spreadsheet' buttons quietly return to their label, so a borrower trying to keep their copy outside the browser gets no file and no message.

| | |
|---|---|
| Who it hurts | A borrower with a dropped or blocked connection who taps Download to keep a copy of data that lives only in this browser gets no file and no explanation, and may leave without the copy the app tells them to keep outside the browser. |
| Standard | None in WCAG: SC 4.1.3 governs how a shown status message is exposed, and here none is shown; SC 3.3.1 covers input errors. Nielsen heuristics H1 (visibility of system status) and H9 (help users recognize and recover from errors) apply. |
| Where | Loans tab, 'Keep a copy' card, 'Download as a spreadsheet'; Records tab, 'Download as a spreadsheet'. Any viewport (measured at 320, 375, 390, 412 and 1280 wide). Only when the xlsx chunk (chunk 425, 2170a4aa.319f5df2f1849a13.js, 413,745 bytes, about 139 KB gzipped, plus 919.07c6b8536b715587.js) is not already in memory or the HTTP cache and its request fails. The chunk is fetched only on click (export.ts:76 is the only dynamic import in src), so Download is the only action in the app that needs the network. |
| Code | [`src/app/page.tsx:279-286`](../../src/app/page.tsx#L279-L286), [`src/app/page.tsx:631`](../../src/app/page.tsx#L631), [`src/app/page.tsx:643`](../../src/app/page.tsx#L643), [`src/components/history/HistoryPanel.tsx:42-49`](../../src/components/history/HistoryPanel.tsx#L42-L49), [`src/components/history/HistoryPanel.tsx:72`](../../src/components/history/HistoryPanel.tsx#L72), [`src/components/history/HistoryPanel.tsx:77`](../../src/components/history/HistoryPanel.tsx#L77), [`src/components/history/HistoryPanel.tsx:79-80`](../../src/components/history/HistoryPanel.tsx#L79-L80), [`src/lib/export.ts:75-78`](../../src/lib/export.ts#L75-L78) |
| Test | `data-safety.spec.mjs`: "RES-08 when a spreadsheet cannot be prepared, the borrower is told beside the button until they try again" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Shipped build, offline, blocked and HTTP 404 on the chunk, on both tabs (6 of 6 runs, real clicks): the label shows 'Preparing…' for 9 to 50 ms and returns to 'Download as a spreadsheet'; there is no role=status or role=alert text and no new visible text, 0 blobs and 0 downloads, and an unhandled 'ChunkLoadError: Loading chunk 425 failed.' appears only in the console. A stalled request holds 'Preparing…' (disabled) for 120,262 ms, webpack's chunk timeout, then reverts the same way. Both handlers are try/finally with no catch (page.tsx:281-285, HistoryPanel.tsx:44-48). A download the browser denies ends 'canceled' with no file, and the page sees no error, rejection, blur, focus or visibility event, so no page code can detect it. A successful download shows no message either; only the browser's own download UI reacts. Bounds: after one successful export, an export while offline works, even after a reload (the chunk is cached as immutable); clicking again after reconnecting downloads the file in the same page. An offline walk of all four tabs, the loan form and a snapshot made 0 requests and 0 errors. The filed toast fixes: a plain toast is gone after about 2.6 s with nothing left behind; Toast inserts its role=status region together with the text (ui.tsx:578), which Chrome reports as AXLiveRegionCreated rather than AXLiveRegionChanged; and with RES-10's single-slot guard the error never shows while an Undo toast is up. The inline fix below, built: the message shows in all 6 failure cases, is still there after 9 s and clears on retry, fires AXLiveRegionChanged, leaves no uncaught error, the retry produces the file, and full-page screenshots are byte-identical to shipped when nothing failed (Loans and Records at 412 and 1280).

## Required

When the spreadsheet cannot be built, the borrower is told on screen next to the button, in a live region that exists before the text. The message stays until the next attempt, says what to do (including a reload when the chunk itself is gone), and a second click works once the network is back. A denied download cannot be seen by the page, so nothing may claim that the file arrived.

## Reproduce

1. Open http://localhost:3100 in a fresh browser profile (nothing cached) and click 'Look around with example loans'.
2. After the page has loaded, go offline (DevTools > Network > Offline, or airplane mode on a phone).
3. On Loans, scroll to 'Keep a copy' and click 'Download as a spreadsheet'. The label flickers to 'Preparing…' and back. No file, no message; the console shows 'ChunkLoadError: Loading chunk 425 failed.'
4. Open Records, click 'Save today's snapshot', then 'Download as a spreadsheet': the same silence.
5. Go back online and click again: the file downloads. After that one success, repeating steps 2 and 3 (even after a reload) downloads the file, because the chunk is cached.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-08"`.

## Fix

Show the failure inline under each button row, in a live region that is always mounted, until the next attempt. No toast and no new prop.

src/lib/export.ts, after COL_WIDTHS (line 73):
```ts
export const EXPORT_FAILED =
  "Could not prepare the spreadsheet. Check your connection, or reload the page, and try again.";
```
src/app/page.tsx (import EXPORT_FAILED beside exportLoans at line 46):
```tsx
const [exportFailed, setExportFailed] = useState(false);

const doExport = async () => {
  setBusyExport(true);
  setExportFailed(false);
  try {
    await exportLoans(loans);
  } catch {
    setExportFailed(true);
  } finally {
    setBusyExport(false);
  }
};

// after the button row's closing </div> at line 643
<p role="status" className="mt-2 text-sm font-semibold text-slate-800 empty:mt-0">
  {exportFailed && EXPORT_FAILED}
</p>
```
src/components/history/HistoryPanel.tsx: the same catch in download() (lines 42-49) with a local `failed` state, and the same <p role="status"> after the button row's closing </div> at line 77. Do not preload the xlsx chunk.

## Severity

It hits a borrower whose first export in that browser happens while the connection is down, blocked or stalled, or after the chunk has gone; anyone who has exported once on that browser is unaffected because the chunk is cached, and pressing Download again once online works. No figure is wrong and no data is lost, but the silent button is the app's only copy outside the browser.

## Verification

Confirmed by 8 of 8 skeptics across 4 filings (reproduce and standards on each), with real clicks on the local production build; the live page chunk matches. All 8 kept P2.

<details><summary>Dissent and notes</summary>

Fix shape: all four filings proposed a toast. Skeptics measured the plain toast gone after about 2.6 s with nothing left behind, its live region created together with its text, and, with RES-10's single-slot guard, no error at all while an Undo toast is up. The resilience reproduce skeptic, the ux standards skeptic and the dx filing keep a toast but give it a Try again action, which keeps it up about 7 s (7,001 ms measured) and retried successfully. The standards skeptics on the resilience and perf filings replace it with an inline message, one a role="alert" paragraph mounted on failure (still up at 15 s), one an always-mounted role="status" paragraph. This report uses the always-mounted inline status. Success message: the resilience filing and its standards skeptic want 'Spreadsheet sent to your downloads. Check that it arrived.'; the ux standards skeptic measured the ux filing's 'Spreadsheet downloaded' appearing after the browser had denied the download, and argues that the browser's own download UI is the success status. It is left out of this fix. Preload: the resilience filing's optional import('xlsx') 'when Keep a copy opens' is dropped by both its skeptics, because the card at page.tsx:625 is always rendered and has no open event, and the chunk is about 139 KB gzipped, which export.ts:5-6 keeps off first load on purpose. Copy: the dx reproduce skeptic measured 3 retries failing while only a full reload worked when the chunk itself was gone, hence 'or reload the page'. Evidence: two skeptics call 'believes they hold a copy' a stretch, since what the borrower sees is a label flicker (37 ms in one run) and no browser download UI, and one calls 'the only backup' slightly strong, since Print one page sits beside the button and needs no chunk.

Fix choice: the perf standards skeptic's always-mounted inline status (built as verify-standards-perf/fix2.diff), with the dx reproduce skeptic's reload wording. It has no timer (A11Y-04), cannot end or be swallowed by an Undo toast (RES-10), does not depend on the Toast live-region fix (A11Y-02), adds no prop, and adds no pixels when nothing failed. Not fixed by any proposal: a stalled request still shows 'Preparing…' for about 120 s before the message, and focus lands on BODY after the failed click in every build (A11Y-03). The page cannot see a download the browser denies; if the author wants a success line, word it 'Spreadsheet sent to your downloads. Check that it arrived.' and set it with setToast((cur) => (cur?.action ? cur : { message })) so it leaves an open Undo alone, as the resilience standards skeptic built. The 404 case matters for a tab left open across a redeploy: the dx reproduce skeptic found the chunk names unchanged across its rebuilds and both served on live, but the perf standards skeptic's patched build renamed them (verify-standards-perf/export-failure.log line 15), so it depends on the change. DX-08's no-misused-promises rule flags exactly these two handlers (page.tsx:631:33, HistoryPanel.tsx:72:23). The file-name half of ux-export-failure-silent is RES-09, which edits export.ts:12-14; land the two together.

</details>

Merged from audit findings: `resilience-export-failure-silent`, `perf-export-silent-failure`, `ux-export-failure-silent`, `dx-export-failure-silent`.
