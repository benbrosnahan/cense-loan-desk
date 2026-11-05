# RES-03: Failed save still says Saved

**P1** · effort S · Data safety and resilience

When the browser blocks site storage, every save still says 'Saved' and nothing warns the borrower, so the loans and dated records entered in that visit are gone on reload.

| | |
|---|---|
| Who it hurts | A borrower whose browser blocks site data enters loans and dated records, is told each one is saved, and loses all of it at the next reload or tab close. A lost dated snapshot, the proof the Records feature exists to keep, cannot be recreated under its original date. |
| Standard | None: no WCAG criterion covers a false save confirmation (4.1.3 governs how a status message is exposed, not whether it is true). The harm is the rubric's 'loses their data without being told'. |
| Where | Every save while the browser refuses storage: 'Save loan', 'Save and add another' and Edit on Your loans, and 'Save today's snapshot' on Records, at every width (measured at 390, 412 and 1280 wide), in Chrome 146 under its own block-site-data setting and with --disable-local-storage, under WebKit's block-all storage policy, and on the live site. Code: storage.ts:27-34 swallows the error and returns nothing; page.tsx:151-159 ignore the outcome; page.tsx:242, :246 and :276 toast 'Saved' regardless; page.tsx:419-420 ('is saved in this browser') and HistoryPanel.tsx:79-80 ('stores every loan ... on this device') stay on screen. |
| Code | [`src/lib/storage.ts:27-34`](../../src/lib/storage.ts#L27-L34), [`src/app/page.tsx:151-159`](../../src/app/page.tsx#L151-L159), [`src/app/page.tsx:242`](../../src/app/page.tsx#L242), [`src/app/page.tsx:246`](../../src/app/page.tsx#L246), [`src/app/page.tsx:276`](../../src/app/page.tsx#L276), [`src/app/page.tsx:419-420`](../../src/app/page.tsx#L419-L420), [`src/app/page.tsx:862`](../../src/app/page.tsx#L862), [`src/components/shared/ui.tsx:565-569`](../../src/components/shared/ui.tsx#L565-L569) |
| Test | `data-safety.spec.mjs`: "RES-03 when the browser refuses to save, the page never says "Saved" and keeps a warning on screen" |
| Fix proof | Validated: [`fixes/RES-03.patch`](../fixes/RES-03.patch). storage.ts write() now reports whether the browser accepted the write, and the page tracks failing keys one by one. While any key fails, a red alert under the header says the browser is not saving and a reload will erase the data, the first-run card says entries stay on this page, and a save toast whose key failed reads 'Kept for this visit only. Not saved.' instead of 'Saved'. An independent review found it sound, with the notes below. |
| Before applying | Word the alert by which key failed: when only dated records fail, say they are too large to save here and suggest deleting old ones or saving a backup, not changing site-data settings. If RES-05 lands, name the backup file as the copy that can be loaded back after the reload a settings change needs. |
| Overlaps | Changes the same lines as [`fixes/RES-01.patch`](../fixes/RES-01.patch), [`fixes/RES-04.patch`](../fixes/RES-04.patch) and [`fixes/RES-05.patch`](../fixes/RES-05.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Shipped build, no script shim:
- Chrome 146 with its block-all-site-data setting (profile preference cookies = 2): reading window.localStorage, and sessionStorage, throws SecurityError 'Access is denied for this document'. The app boots; toasts 'Saved My real loan', 'Saved Second loan', 'Changes saved' and 'Snapshot saved'; hero 'YOU OWE $7,001 across 1 loan'; tab badge Records1; 0 role=alert; 0 console errors; the first-run card says 'What you type is saved in this browser and goes nowhere else.' After reload the first-run screen is back and the loans and the snapshot are gone. A line-by-line diff of the visible text with working and with blocked storage, on first run, Loans and Records: zero differing lines.
- Chrome --disable-local-storage (localStorage is null) and WebKit's block-all policy (SecurityError 'The operation is insecure'): same result. Same on the live site in one pass (GET requests only).
- Script shims (setItem throws QuotaExceededError, the getter throws, localStorage is null): same result; the stored value is null.
- Controls: working storage keeps everything across a reload and a new tab. Chrome incognito and a WebKit non-persistent store write successfully, so private windows do not trigger this. Data saved before a block survives it (a $5,000 loan kept; the $7,000 loan typed while blocked lost). Both spreadsheet downloads still work from memory while blocked (17,825-byte .xlsx).
- Full quota, reached with no shim: about 5.24 million characters; an 8-loan snapshot is 1,688 to 1,719 characters, so 3,047 to 3,099 snapshots fill it, about 8.5 years of daily snapshots. At quota: toast 'Snapshot saved', badge Records3100, 3,099 stored; older loans and snapshots survive a reload and the first-run screen does not return.
Filed fixes, built in scratch copies: both show a warning at load before anything is typed, but in page flow it had scrolled above the viewport at each later save (top -151 px after 'Save and add another' and -157 px after a snapshot in one build; bottom edge -141 to -811 px across three saves in another), while the toast still said 'Saved' (dx filing) or showed nothing (resilience filing). The dx filing's single flag let a later loan save clear a standing snapshot failure, and its literal <Notice role="alert"> fails tsc (TS2322).

## Required

'Saved' appears only after a successful write. When a write fails, a warning that stays available says the data is not being kept and what to do, the save message says it was kept for this visit only, and the first-run card stops promising 'is saved in this browser'. One key saving must not clear another key's failure.

## Reproduce

1. In Chrome, open chrome://settings/content/siteData and choose 'Don't allow sites to save data on your device' (the probes set the same thing with the profile preference profile.default_content_setting_values.cookies = 2), or start Chrome with --disable-local-storage.
2. Open the app. It loads normally, with no warning.
3. Click 'Add my first loan', enter a balance, rate and date, and click Save loan. Toast: 'Saved <loan name>'.
4. Open Records and click 'Save today's snapshot'. Toast: 'Snapshot saved'; the tab reads Records 1.
5. Reload. The first-run screen is back; the loan and the snapshot are gone, and nothing ever said they were not saved.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-03"`.

## Fix

Report the write outcome, track it per key, show a warning while any write is failing, and stop the toast claiming 'Saved' while writes fail.

```ts
// storage.ts:27-34. loanStore.save and the others already return what write returns.
function write(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // the UI keeps working from memory, and page.tsx warns
  }
}

// ui.tsx:565-569, ToastState: add
/** The message says the data reached storage. */
claimsSaved?: boolean;

// page.tsx, after the state at line 134
// One entry per key, so a loan save that works cannot hide a snapshot save that failed.
const failed = useRef(new Set<string>());
const [saveFailed, setSaveFailed] = useState(false);
const track = (key: string, ok: boolean) => {
  if (ok !== failed.current.has(key)) return; // unchanged: no extra render per slider tick
  if (ok) failed.current.delete(key); else failed.current.add(key);
  setSaveFailed(failed.current.size > 0);
};

// page.tsx:151-159
useEffect(() => { if (hydrated) track("loans", loanStore.save(loans)); }, [loans, hydrated]);
useEffect(() => { if (hydrated) track("profile", profileStore.save(profile)); }, [profile, hydrated]);
useEffect(() => { if (hydrated) track("snapshots", snapshotStore.save(snapshots)); }, [snapshots, hydrated]);

// page.tsx, after say (line 180). Use it at lines 242, 246 and 276 only.
const saySaved = useCallback(
  (message: string, action?: ToastState["action"]) =>
    setToast({ message, action, claimsSaved: true }),
  []
);

// page.tsx, directly after </header> (line 352)
{saveFailed && (
  <div role="alert" className="no-print mx-auto mt-3 max-w-3xl px-4 sm:px-6">
    <Notice tone="danger" title="This browser is not saving what you enter">
      Reloading or closing this page will erase it. To keep your loans here, allow
      site data for this page in your browser settings. A spreadsheet download keeps
      a copy, but it cannot be loaded back in.
    </Notice>
  </div>
)}

// page.tsx:419-420
All of it. There is no account and no server. What you type{" "}
{saveFailed ? "stays on this page" : "is saved in this browser"} and goes nowhere else.

// page.tsx:862
<Toast
  toast={saveFailed && toast?.claimsSaved
    ? { ...toast, message: "Kept for this visit only. Not saved." }
    : toast}
  onDismiss={() => setToast(null)}
/>
```

The toast is rewritten when it renders, so it also covers the first failure, which is only known after the save effect runs. Toasts that make no save claim ('Example loans loaded', 'Standard is now your plan', Removed and Cleared with Undo) are unchanged. Because the page still writes once at load, blocked storage shows the warning before anything is typed. Notice is already imported in page.tsx.

## Severity

Borrowers whose browser blocks site data (Chrome's block setting, local storage switched off, WebKit's block-all policy) are told every loan and snapshot is saved and lose all of it at the next reload or tab close, every time, with no warning. That is data loss without being told, limited to an uncommon environment, so P1; the other trigger, a full quota, takes about 3,100 snapshots and then loses only the write that does not fit.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), with no script shim under Chrome's own block-site-data setting and --disable-local-storage, under WebKit's block-all policy, and on the live site; severity votes P0 2, P1 3, P2 1.

<details><summary>Dissent and notes</summary>

Severity: the resilience filing's standards and reproduce skeptics kept P0 under the audit's 'silent data loss' with no reach condition; its impact skeptic and the dx filing's standards and reproduce skeptics rated P1; the dx impact skeptic rated P2 (only what was typed while blocked is lost, loans can be retyped from studentaid.gov, the exports work, and it found no current public figure for how many people block site data; mid-2000s figures put cookie blocking at about 1% or under). This report rates P1: data loss without being told, limited to an uncommon environment. Scope corrections, agreed by every skeptic who checked: 'storage full' is effectively unreachable (about 3,100 snapshots on an origin only this app uses) and then loses only the write that does not fit, so 'everything is gone' holds only for blocked storage; the always-throwing setItem mode is a shim, while real blocks throw at the localStorage getter or leave it null, inside the same try with the same outcome; private windows write successfully, so they are outside this finding. The quota measured 5,242,308 characters by a bisection that stops within 1,024 (Chrome and WebKit) and 5,242,880 exactly, key included (one skeptic). 'Everything you type stays in this browser' (the footer) stays true as a privacy statement; the false lines are page.tsx:419-420 and HistoryPanel.tsx:79-80. Fix: the resilience filing's fix was accepted as is by its standards skeptic. Its reproduce skeptic kept hiding the toast but moved the warning to a fixed bottom bar with 96 px of scroll padding (in view at every step, 65 px tall, overlapping an Undo toast while one is up), because an in-flow warning plus a hidden toast leaves nothing on screen at a failed save. Its impact skeptic rewrote the toast text instead, gated on an explicit claimsSaved flag, because the filed gate (!toast?.action) also hid 'Example loans loaded' and 'Standard is now your plan'. All three dx skeptics rejected the dx filing's single flag (a loan save cleared a standing snapshot failure, and at quota the alert stuck after 'Clear saved records') and its <Notice role="alert">, which does not compile. The dx impact skeptic set the toast text at the click ('Added for this visit only'), which misses the first failure; the dx standards skeptic rewrote the queued toast from inside the save effect.

Fix choice: write() returning a boolean and per-key tracking (all six skeptics), with the early return in track so the profile save on every slider tick costs no extra render (30 Page passes over 30 ticks; without the early return the filed fix took 60, though total time was only 3.0 against 2.2 ms, noisy). The claimsSaved toast rewrite and the placement after the header come from the resilience impact skeptic. The warning copy and the first-run line come from the dx impact skeptic, because that copy says a reload also erases the data, names the real remedy and does not promise a restore the app cannot do; the resilience impact copy ('gone when this tab closes', 'or use Download as a spreadsheet') understated both. saySaved takes the same optional Undo as say so RES-01's toast keeps its button; that pairing was not built. If the author wants the warning on screen at every moment, use the reproduce skeptic's fixed bottom bar (fixed inset-x-0 bottom-0 z-40, with document scroll-padding-bottom 96px while it shows) instead of the in-flow placement.
Known limits, both only near a full quota: the first failed snapshot still paints 'Snapshot saved' briefly before the rewrite (one frame, measured at 364 to 415 ms on the heavy Records view, noisy), and while the snapshot key is failing a loan edit that did save also reads 'Not saved'. HistoryPanel.tsx:79-80 still says a snapshot is stored 'on this device'; pass saveFailed in if the author wants it reworded. The fix only sees writes that throw: private windows and later eviction, where writes succeed and the data still goes, belong to RES-05.
Order: RES-02's re-read reads the failed ref and adds a guard to these same three save effects, so ship this first or together. Keep RES-02's load-time write (do not adopt values at load), or this warning moves from page load to the first save.
Not tested: iOS Safari, Firefox and Android WebView. Android WebView leaves DOM storage off unless the host app turns it on, so a newsletter app's in-app browser could make this common; no skeptic could test that, and prevalence cannot be measured (no analytics by design).

</details>

Merged from audit findings: `resilience-save-failure-silent`, `dx-write-failure-silent`.
