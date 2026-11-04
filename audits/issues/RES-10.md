# RES-10: Undo holds only one action

**P2** · effort S · Data safety and resilience

Undo only covers the latest action, so a borrower who removes a second loan, clears loans after clearing records, or picks a plan within the 7-second window can no longer bring back what they removed first.

| | |
|---|---|
| Who it hurts | A borrower who removes the wrong loan and then another, or clears records and loans and then changes their mind, gets back only the last thing: the first loan has to be retyped from studentaid.gov, and the dated records kept as proof of past balances cannot be recreated. |
| Standard | None. No WCAG criterion sets how many steps Undo must cover, and a toast that replaces the previous one is a common pattern. The UX filing cites Nielsen's heuristic 3, user control and freedom. |
| Where | Loans tab: Remove inside an expanded loan row, and Keep a copy > Clear my data (Clear saved records, Clear every loan), with the Undo toast at the bottom of the screen. Any width; measured at 412x823 and 375x812 on the local production build, and the live page chunk matches the local one. |
| Code | [`src/app/page.tsx:172`](../../src/app/page.tsx#L172), [`src/app/page.tsx:176-180`](../../src/app/page.tsx#L176-L180), [`src/app/page.tsx:250-259`](../../src/app/page.tsx#L250-L259), [`src/app/page.tsx:261-272`](../../src/app/page.tsx#L261-L272), [`src/app/page.tsx:274-277`](../../src/app/page.tsx#L274-L277), [`src/app/page.tsx:783-786`](../../src/app/page.tsx#L783-L786), [`src/components/shared/ui.tsx:565-569`](../../src/components/shared/ui.tsx#L565-L569) |
| Test | `resilience.spec.mjs`: "RES-10 one Undo brings back everything removed while it is offered" |

## Measured

Eight loans at 412x823, with touch emulation too: Remove A, Remove B, Undo leaves 7 stored, A restored false, B restored true, and A is still missing after a reload. Three removals bring back only the last. Remove A, then tap 'Use IBR as my plan' within the window: the toast becomes 'IBR is now your plan' with no Undo, and A stays gone. Remove A, then 'Save today's snapshot': the Undo is gone. Clear saved records (2 snapshots), Clear every loan, Undo: 8 loans back byte-exact, 0 of 2 snapshots. Remove A, Clear every loan, Undo: 7 stored, A gone. At 375x812: 8 loans, Remove, Remove, Undo gives 7, and a reload still shows 'Your 7 loans'. Controls: one Remove then Undo, or Clear saved records then Undo on its own, restores byte-exact. The toast lasts 7,002 to 7,010 ms (page.tsx:172 sets 7000) and its text states no duration. A double click on Remove removes only one loan.

## Required

While an Undo is offered, it restores everything removed or cleared since that Undo first appeared, in the original order, and a message about something that changed no loan or record, such as a plan choice, does not withdraw it.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Look around with example loans' (8 loans, $28,101). The probes seed the same eight loans under the names '2022–23 subsidized' and so on.
2. In Your loans, tap the 'Freshman subsidized' row, then Remove. The toast says 'Removed Freshman subsidized' with Undo.
3. Within 7 seconds tap the 'Freshman unsubsidized' row, then Remove. At 375px wide, scroll a little first, because the toast covers the next row's Remove button.
4. Tap Undo. The heading reads 'Your 7 loans' and Freshman subsidized is gone, also after a reload.
5. Remove another loan, tap Plans and, within 7 seconds, tap a plan's 'Use … as my plan' button. The toast becomes '… is now your plan' and the Undo is gone.
6. Open Records and tap 'Save today's snapshot'. Back in Loans, open Keep a copy > Clear my data, tap 'Clear saved records', then 'Clear every loan', then Undo. The loans come back; the snapshot does not.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-10"`.

## Fix

Chain the restores that already exist instead of replacing them, newest first, so one Undo replays every restore since the toast opened and lands byte-exact on the original list. In src/app/page.tsx, next to deleteLoan:

// Undo reverses everything since the toast appeared, newest first.
const undoAction = (run: () => void): ToastState["action"] => {
  const prior = toast?.action;
  return { label: prior ? "Undo all" : "Undo", run: () => { run(); prior?.run(); } };
};
// A message about something that changed no loan or record keeps the open Undo.
const sayKeepingUndo = (message: string, fallback?: ToastState["action"]) =>
  setToast((cur) => ({ message, action: cur?.action ? { ...cur.action, label: "Undo remove" } : fallback }));

Then:
- deleteLoan (:255-258), keeping `if (editing?.id === id) setEditing(null);`: say(`Removed ${gone?.nickname ?? "loan"}`, undoAction(() => setLoans(before)));
- clearLoans (:265): say("All loans cleared", undoAction(() => setLoans(before)));
- clearSnapshots (:271): say("Records cleared", undoAction(() => setSnapshots(before)));
- plan choice (:785): sayKeepingUndo(`${PLAN_META[id].name} is now your plan`);

saveLoan and saveSnapshot keep plain say(), so a saved edit or a new snapshot still ends the Undo: replaying an older list after them would erase that save. No change to ui.tsx and no new dependency.

## Severity

It hits borrowers who make a second change inside the 7-second Undo window: a second removal, Clear every loan after Clear saved records, a plan choice or a saved snapshot. After that the first removal cannot be undone, so the loan has to be retyped from studentaid.gov and cleared dated records are gone for good. It takes two deliberate actions within 7 seconds and every toast names what it removed, so it is uncommon and the borrower is told about each removal: a real but bounded defect.

## Verification

Confirmed by 3 of 3 skeptics across 2 filings (reproduce and standards on the resilience filing, reproduce on the UX filing); all three rejected the filed fixes and built corrected ones on scratch copies.

<details><summary>Dissent and notes</summary>

Severity: the resilience filer and its reproduce skeptic rated P2. Its standards skeptic lowered it to P3: two deliberate removals are needed inside the window, the plan path needs 2.6 phone screens of scrolling within 7 seconds, the toast is honest about what it restores, and the cost is retyping. The UX filer and its skeptic rated P3, but that filing covered only the double removal. P2 is kept because the merged issue includes the records path, where dated snapshots are lost for good, and because a plan choice or a saved snapshot also cancels a pending Undo. Measurement corrections: the UX filing's 6.75 s and 6.78 s toast life did not reproduce (7,002 to 7,010 ms; the timer is 7000 ms), and the filed 'required' line refers to a window the toast advertises, but the toast states none. Filed fixes, rejected by every skeptic who built them: the resilience fix (a ref of removed loans plus a say() guard) dropped `if (editing?.id === id) setEditing(null)`, so Edit A, Remove A, Save, Undo gave 9 loans with a duplicate id and You owe $31,601 against a true $28,101. Its guard swallowed 'IBR is now your plan' and the export error, Clear saved records then Save today's snapshot then Undo erased the new snapshot, Clear every loan then add a loan then Undo erased the new loan, appended restores swapped the two 2022–23 rows, a stale ref later announced 'Removed 2 loans' for one removal, and records still did not come back. The UX fix (an undoBase ref cleared only in the timeout) restored a list from before a saved edit: a balance saved at 9,999 reverted to 3,500 in two scripted scenarios. Fix shape: the standards skeptic would store the lists to restore on the toast itself and add a note() that leaves an open Undo in place, which keeps the plan confirmation off screen; the reproduce skeptic's chained restores are used here.

That bed also carries hash routing for UX-10, a toast pause for A11Y-04 and export messages for RES-08, which belong to those issues. It was chosen over the standards skeptic's version, which also passed its checks but changes the shared ToastState type and keeps 'IBR is now your plan' off screen while an Undo is open, and over the UX skeptic's undoBase ref, which fixes only the double removal. Cautions: undoAction chains whatever action the open toast holds, so if RES-08 adds a 'Try again' action to the toast, mark undo actions (for example with an undo flag) and chain only those. 'Undo remove' is the label even when the open Undo is for cleared records, so reword it if that reads oddly. At 320px 'Undo remove' wraps inside the button but fits. Related: A11Y-04 (the 7-second timer never pauses for focus or hover), A11Y-13 (at 375px the toast covers the next row's Remove, so tests must scroll first) and RES-15 (a long nickname pushes Undo off screen).

</details>

Merged from audit findings: `resilience-undo-single-slot`, `ux-undo-single-level`.
