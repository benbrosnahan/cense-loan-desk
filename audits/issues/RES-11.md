# RES-11: Half-typed loan form lost without warning

**P2** · effort M · Data safety and resilience

A half-filled loan form disappears without warning when the borrower taps another section, taps Edit on another loan, or reloads, so the balance, rate and date they typed are lost.

| | |
|---|---|
| Who it hurts | A borrower copying a loan's balance, rate and date from studentaid.gov loses them to one stray tap on the section bar, a tap on another loan's Edit, or a reload, and has to look them up and type them again. |
| Standard | None. WCAG 3.3.7 Redundant Entry does not cover a user who navigates away and comes back (its Understanding page excludes that case). The UX filing cites Nielsen's heuristic 5, error prevention. |
| Where | Loans tab: the Add a loan form, the Edit form and the first-run form, at any width (measured at 412x823 and 375x812) on the local production build; the live page chunk matches. The section-bar path needs at least one saved loan, because first run has no section bar. |
| Code | [`src/app/page.tsx:205-208`](../../src/app/page.tsx#L205-L208), [`src/app/page.tsx:605-608`](../../src/app/page.tsx#L605-L608), [`src/app/page.tsx:126-127`](../../src/app/page.tsx#L126-L127), [`src/app/page.tsx:139-149`](../../src/app/page.tsx#L139-L149), [`src/app/page.tsx:384-393`](../../src/app/page.tsx#L384-L393), [`src/app/page.tsx:568-579`](../../src/app/page.tsx#L568-L579), [`src/components/loans/LoanForm.tsx:83-115`](../../src/components/loans/LoanForm.tsx#L83-L115), [`src/components/loans/LoanForm.tsx:119-121`](../../src/components/loans/LoanForm.tsx#L119-L121) |
| Test | `resilience.spec.mjs`: "RES-11 a half-filled loan survives a section switch, a reload and Edit on another loan" |

## Measured

412x823 with 8 loans: typed 12,345.67 and 7.05 in Add a loan, then reloaded: no beforeunload dialog, form closed, sessionStorage empty, nothing new in localStorage, 8 loans stored. Same on the first-run form. Half-typed, then Plans and back: form closed, no dialog, no toast. At 375x812 the same with 5,500 typed, and an Edit form at 9,999 with Payoff and back also closes with the stored balance still 3,500. Half-edit of the first loan from 3,500 to 99,999, then Edit on the $4,500 row: the form shows 4,500, the first loan stays stored at 3500, and no toast appears; a half-typed Add followed by Edit on a row is lost the same way. The section bar stays on screen while typing, 26px above the form at 412. src contains no beforeunload listener and no sessionStorage use. Controls: a beforeunload listener injected for the test does raise its dialog on reload; switching to another browser tab and back, or freezing and resuming the page, keeps the values. A real phone tab discard was not run.

## Required

Typed loan details survive a section switch and a reload in the same tab, and Edit on another row keeps the open form with a message, so nothing typed disappears unless the borrower chooses Cancel.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Look around with example loans'.
2. In Your loans tap 'Add a loan', tap 2024–25, and type 12345.67 in 'What you owe on it today' and 7.05 in 'Interest rate'. Do not save.
3. Reload the page. There is no warning; the form and both numbers are gone.
4. Tap 'Add a loan' again, type a balance, tap Plans in the section bar, then Loans. The form is closed and nothing says the entry was dropped.
5. Tap the 'Freshman subsidized' row, tap Edit and change 3,500 to 99,999 without saving. Then tap the 'Sophomore subsidized' row and its Edit. The form now shows 4,500, and Freshman subsidized is still 3,500.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-11"`.

## Fix

Keep an in-progress loan as a draft in sessionStorage, keyed by the loan it belongs to, and let Page reopen the form from it. sessionStorage stays in this tab on this device and is gone when the tab closes; no request carries a typed value. In src/components/loans/LoanForm.tsx, next to isUndergrad:

const DRAFT_KEY = "cense.loandesk.draft.v1";
export type LoanDraft = { loanId: string | null; f: Record<string, string>; rateIsAuto: boolean };
export function readDraft(): LoanDraft | null {
  try { return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) ?? "null"); } catch { return null; }
}
export function clearDraft() {
  try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
}

Rename the initializer at :83 to const [pristine] = useState(...), then:

const [draft] = useState(() => { const d = readDraft(); return d && d.loanId === (initial?.id ?? null) ? d : null; });
const [f, setF] = useState<typeof pristine>(() => (draft ? (draft.f as unknown as typeof pristine) : pristine));
// :119, so a typed rate is never treated as one the app filled in
const [rateIsAuto, setRateIsAuto] = useState(() => (draft ? draft.rateIsAuto : !initial && f.rate !== ""));
useEffect(() => {
  if (JSON.stringify(f) === JSON.stringify(pristine)) { clearDraft(); return; }
  try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ loanId: initial?.id ?? null, f, rateIsAuto })); } catch {}
  const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = true; };
  window.addEventListener("beforeunload", guard);
  return () => window.removeEventListener("beforeunload", guard);
}, [f, rateIsAuto, pristine, initial]);

In src/app/page.tsx:
- Hydrate effect (:139-149): const saved = loanStore.load() ?? []; setLoans(saved); then const d = readDraft(); if (d) { const owner = d.loanId ? saved.find((l) => l.id === d.loanId) : null; if (owner) setEditing(owner); else if (d.loanId) clearDraft(); else setAdding(true); }
- goTo (:207-208): if (!readDraft()) { setAdding(false); setEditing(null); }
- onEdit (:605-608): if (readDraft()) { say("Save or cancel the loan you have open first"); return; }
- Call clearDraft() at the start of saveLoan, in both onCancel handlers (:391 and :574-577), in clearLoans, and in deleteLoan when it removes the loan being edited.

The beforeunload guard adds a 'Leave site?' prompt on desktop, which matters when the tab is closed, because closing the tab also wipes the draft. iOS Safari never fires beforeunload, so on iPhones the draft is the only protection.

## Severity

Any borrower entering or editing a loan who leaves the form before saving loses that loan's typed figures: one tap on the section bar 26px above the form, an Edit on another row, or a reload while copying numbers from studentaid.gov is enough. No saved loan or figure changes and only one loan's entries are lost, so it is a bounded defect rather than silent loss of saved data.

## Verification

Confirmed by 3 of 3 skeptics across 2 filings (reproduce and standards on the resilience filing, reproduce on the UX filing); all three found the filed fixes incomplete and built corrected versions.

<details><summary>Dissent and notes</summary>

Severity: the UX filer and its skeptic rated P3 because stored data is intact and only unsaved keystrokes are lost; the resilience filer and both its skeptics rated P2 because three required fields go with one tap or a reload. P2 is used. Impact wording: 'a phone may discard the background tab' is inferred, not measured. Switching to another browser tab and back kept the values, and so did freezing and resuming the page, so loss needs a tap, a reload or a real discard; the reload result stands in for the discard. Label slip: the filing's 'loan 2' at $4,500 is the third row (2023–24 subsidized); row 2 is $2,396. Filed fixes were incomplete. 'Restore it on mount' does nothing after a reload, because the form is mounted only when adding or editing is set and both start empty (page.tsx:126-127). Keeping adding set in goTo does not keep the form across a section switch, because it renders only on the Loans tab (page.tsx:548, 568). One unkeyed draft slot put loan 1's 99,999 and 4.99% into a new Add form. Restoring values without rateIsAuto labels a typed rate as the published one and the next year chip replaces it (typed 5.25 became 6.39; typed 7.05 became 4.99). Without a clear on Save, Cancel and Clear every loan, typed figures would outlive 'Clear my data', against the copy at page.tsx:658-661. A kept form turns Edit on another row into a dead tap unless a message says why. The reproduce skeptic did not build the beforeunload listener; the standards skeptic did.

Fix choice: the standards skeptic's build, which folds in every correction: the draft is keyed by loan id (reproduce skeptic), carries rateIsAuto (standards and UX skeptics), is reopened by Page's hydrate effect (both resilience skeptics) and is cleared on every exit, and Edit on another row is refused with a message. Not run on iOS or through a real tab discard. The UX skeptic's in-memory draftRef in page.tsx is smaller but loses the draft on reload. Interactions: if UX-10 adds a popstate handler, give it the same if (!readDraft()) guard, as the measured bed does; with RES-10, send the blocked-Edit message through sayKeepingUndo so it does not end an open Undo; RES-04's fuller 'Clear my data' should also call clearDraft(). Not covered by any build: 'Add my own' on the example banner (page.tsx:440-445) calls startAdding, which mounts a blank Add form whose first effect would clear an open edit draft, so give it the same readDraft() check.

</details>

Merged from audit findings: `resilience-form-draft-lost`, `ux-unsaved-form-dropped-on-tab`.
