# RES-01: Editing example loans then adding one deletes the edits

**P1** · effort S · Data safety and resilience

Typing your own numbers over the example loans and then adding a loan deletes every row you typed, with only a 'Saved' message and no Undo.

| | |
|---|---|
| Who it hurts | A borrower who is not near their login follows the first-run hint, types their real numbers over the examples, and loses every row they typed the moment they add one more loan, told only 'Saved'; they have to retype it all from studentaid.gov. A borrower with exactly eight loans who overtyped all eight can never clear the example banner without losing them. |
| Standard | No external standard is broken outright; this is the rubric's 'loses their data without being told'. Nielsen heuristic 5 (error prevention: nothing warns before the wipe) and heuristic 3 (user control and freedom: Remove and Clear offer Undo, this does not). |
| Where | Your loans after 'Look around with example loans', at every width (measured at 375, 412, 768, 1280 and 1440 wide) on the local production build; the live page chunk has the same logic. Trigger: edit any field of at least one example row, then save a new loan through 'Save loan', 'Save and add another' or the banner's 'Add my own', in the same visit or after a reload. Code: an edit keeps the seed- id (LoanForm.tsx:205), so isExample (page.tsx:81-82) stays true and page.tsx:222 throws the whole list away; page.tsx:242 and :246 toast only 'Saved'. The first-run hint at page.tsx:412-413 invites the edit, and the banner at page.tsx:435-438 states no consequence. |
| Code | [`src/app/page.tsx:81-82`](../../src/app/page.tsx#L81-L82), [`src/components/loans/LoanForm.tsx:205`](../../src/components/loans/LoanForm.tsx#L205), [`src/app/page.tsx:219-222`](../../src/app/page.tsx#L219-L222), [`src/app/page.tsx:242`](../../src/app/page.tsx#L242), [`src/app/page.tsx:246`](../../src/app/page.tsx#L246), [`src/app/page.tsx:306`](../../src/app/page.tsx#L306), [`src/app/page.tsx:412-413`](../../src/app/page.tsx#L412-L413), [`src/app/page.tsx:435-438`](../../src/app/page.tsx#L435-L438) |
| Test | `data-safety.spec.mjs`: "RES-01 edits typed over the example loans are still there after adding a loan of your own" |
| Fix proof | Validated: [`fixes/RES-01.patch`](../fixes/RES-01.patch). An example row now counts as an example only while every field still matches its seed, so adding a real loan removes only the untouched examples and keeps any row the borrower typed over. The save toast names how many examples were removed and offers Undo, which puts those examples back in their places and keeps the loan just saved and any added since. The banner counts the rows that are still examples (for example '7 of these 8 loans are still examples, not yours.'). An independent review found it sound, with the notes below. |
| Before applying | Land it with a fix for the kept example principal (for example, take the typed balance as the principal when an example is typed over), because once the banner is gone 'Interest added so far' shows interest nobody charged. |
| Overlaps | Changes the same lines as [`fixes/MONEY-21.patch`](../fixes/MONEY-21.patch) and [`fixes/RES-03.patch`](../fixes/RES-03.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Shipped build, real clicks and typing:
- Two example balances edited to $1,234 and $4,321: toast 'Changes saved', banner still shown. Saving one new $7,777 loan leaves only that loan; toast 'Saved 2024–25 subsidized', no Undo. The typed balances are in none of the four localStorage keys, before or after a reload.
- All 8 examples edited (stored total $111,108, ids still seed-*, banner still 'These are example loans, not yours.'), then a ninth added: stored loans ['MY NINTH LOAN'], toast 'Saved MY NINTH LOAN', no Undo. After reload: 'YOU OWE $4,000 across 1 loan with 1 servicer'.
- One edit is enough. The same wipe follows the banner's own 'Add my own', 'Save and add another', and edit-then-reload-then-add. An edit to only the name, servicer, type, first-borrowed amount or minimum payment is lost the same way. A snapshot saved earlier still holds the values, but Records has no way to restore them.
- The 'Saved ...' toast is the only message and the only live-region text; it disappears after 2.6 s (page.tsx:172). After 'Save and add another' on a phone the list heading is at least 1,463 px down the page, below the fold at every phone size tested.
- Controls: untouched examples are replaced by the first real loan, as README:202-203 documents; loans with non-seed ids are kept on add; Remove ('Removed Freshman subsidized' + Undo) and Clear offer Undo, so this is the one destructive path without it.
- Live: the deployed page chunk has the same saveLoan and differs from the local chunk only by a webpack module id.
Filed fixes, built in scratch copies: the ux filing's pristine() compares only balance, rate and date, so name, servicer, type, first-borrowed and minimum-payment edits were still dropped. The resilience filing's every(isPristine) banner disappears after one edit while 7 untouched examples still count toward You owe ($22,601 of $30,378 in one run, $25,705 of $38,050 in another).
The fix below, as tested: after one edit the banner reads '7 of these 8 loans are still examples, not yours.', also after a reload; the add keeps the edited row and toasts 'Saved 2025–26 subsidized. 7 examples removed' with Undo, which fits at 320, 375 and 412 wide; Undo restores storage byte for byte; all 8 edited plus a ninth keeps 9 loans ($115,108) with no Undo; next build passes and verify.mjs passes 180 of 180.

## Required

Rows the borrower edited survive adding a loan. Only untouched examples are replaced by the first real loan, as README:202-203 documents; that removal is named in the toast and can be undone, and the banner keeps labelling whatever is still example data. Undo alone is not enough: the next add would wipe the restored rows again.

## Reproduce

1. Open the app with no saved data and click 'Look around with example loans'. The amber banner reads 'These are example loans, not yours.'
2. Open 'Freshman subsidized', click Edit, change the balance to 1234 and click Save loan. Toast: 'Changes saved'. The banner is still there.
3. Click 'Add a loan' (or the banner's 'Add my own'), enter a balance of 7777, any rate and a disbursement date, and click Save loan.
4. The list now holds only the new loan, You owe reads $7,777, and the toast says only 'Saved <new loan name>' with no Undo. Reload: the $1,234 row is gone for good. 'Save and add another' in step 3 does the same.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-01"`.

## Fix

In src/app/page.tsx, decide per row whether it is still an untouched example, keep anything edited, name the removal and offer Undo, and let the banner count what is still example data.

```ts
// page.tsx:81-82, replacing isExample
// An example nobody has changed. An edit to any field makes the row the borrower's.
const isUntouchedExample = (l: Loan) => {
  const s = SEED_LOANS.find((x) => x.id === l.id);
  return !!s && (Object.keys(s) as (keyof Loan)[]).every((k) => s[k] === l[k]);
};

// saveLoan, page.tsx:219-222
const isNew = !loans.some((l) => l.id === loan.id);
const before = loans;
const removed = isNew ? loans.filter(isUntouchedExample).length : 0;
const undo = removed ? { label: "Undo", run: () => setLoans(before) } : undefined;
const removedNote = removed ? `. ${removed} example${removed === 1 ? "" : "s"} removed` : "";
setLoans((prev) => {
  // The first real loan replaces untouched examples. Anything edited stays.
  const current = isNew ? prev.filter((l) => !isUntouchedExample(l)) : prev;
  // rest of the updater unchanged

// page.tsx:242
say(`Saved ${loan.nickname}${removedNote}`, undo);
// page.tsx:246
say(isNew ? `Saved ${loan.nickname}${removedNote}` : "Changes saved", undo);

// page.tsx:306, replacing const example
const exampleCount = loans.filter(isUntouchedExample).length;
// page.tsx:435
{exampleCount > 0 && (
// page.tsx:438
{exampleCount === loans.length
  ? "These are example loans, not yours."
  : `${exampleCount} of these ${loans.length} loans ${exampleCount === 1 ? "is still an example" : "are still examples"}, not yours.`}
```

Undo restores the list as it was before the save, so it also takes back the loan just saved, the same way Remove and Clear restore earlier state. SEED_LOANS is already imported (page.tsx:25).

## Severity

Every borrower who takes the example route, types over at least one example as the first-run hint invites, and then adds a loan loses all the rows they typed, every time, told only 'Saved'. It is limited to that recognizable group (anyone who enters their own loans from the start, or adds before editing, loses nothing), so it is P1 rather than P0.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), with real clicks and typing on the local production build; the live page chunk was compared and carries the same logic.

<details><summary>Dissent and notes</summary>

Severity: all six skeptics kept P0 under the audit's scale, which lists silent data loss with no reach condition; the ux standards, ux impact and resilience impact skeptics placed it at the low end of P0, below the wrong-dollar findings (the cost is retyping, and no hidden figure is wrong), and the resilience impact skeptic named P1 as the fallback if 'silent' means unnoticeable. This report rates P1 under the stricter rubric because the loss needs the example route, an in-place edit and then an add. Visibility at the moment of saving was measured both ways: after 'Save loan' the ux reproduce and ux standards skeptics saw no loan row or total on screen at 375 and 1440 wide, and the resilience reproduce skeptic had the hero and every row off screen at 412x823 and 1280x800, while the ux impact and resilience impact skeptics had the hero and the one remaining row in view at 375 to 412 wide. All agree the app never says the rows were removed. Fix: all three ux skeptics rejected the ux filing's pristine() (balance, rate and date only) and its 'Example loans removed.' toast, which is false when an edited example stays; all three resilience skeptics rejected the resilience filing's every(isPristine) banner, which hid the banner after one edit while 7 examples still counted toward You owe, and its test, which checks the banner only after the add. Undo: the resilience impact skeptic would drop it, because only untouched rows can now be removed and restoring the earlier list also discards the loan just typed (if kept, it would restore only the dropped rows); the other five keep an Undo that restores the earlier list. The ux skeptics also named the kept rows in the toast ('kept the 1 you edited'), and the ux standards skeptic would add 'Adding your own removes any you have not edited.' to the banner; not adopted, because the counted banner labels what is still an example before the add. Three skeptics noted that 'swap in your own numbers later' could also mean adding loans rather than editing; the loss holds under either reading. The resilience filing cited final-checks F3 for the no-op round trip, but F3 used non-seed ids; the skeptics re-ran it on all eight seeds and the round trip is byte-identical.

Fix choice: the resilience filing's corrected fix, with the ux filing's field-by-field isUntouchedExample in place of its JSON.stringify comparison, because comparing fields does not depend on key order. Both predicates were built and tested on their own and agree on every row the app produces today (no-op edits of all eight seeds are byte-identical in storage), but this exact combination was not built as one patch.
Not fixed here, a separate defect this fix makes more visible: a balance typed over an example keeps the example's principal (one run: balance 10000 against principal 3500), so 'Interest added so far' and the export show interest nobody charged, and once the banner is gone it reads as fact. Related: UX-08 (example data can pass for real) and MONEY-18.
Optional, tested by the ux reproduce skeptic: an amber note 'Some of these started as example loans. Check each one, or remove it.' while any seed- id remains; it cannot be dismissed.
Residuals: a real loan identical to a seed and left untouched still counts as an example and is removed on add, now announced with a 7-second Undo (A11Y-04 covers that timer). Changing any SEED_LOANS value later makes stored examples count as edited and be kept, so give changed seeds new ids.
Coordination: if RES-03 lands, the two say() calls above become saySaved(..., undo). This Undo restores a copy of the list like the Remove and Clear Undos that RES-02 changes to merge; its cross-tab window is the same 7 seconds. Not tested: real iOS or Android browsers, or any WebKit engine (Chromium only, so iOS scroll position at the moment of saving is unmeasured); the logic has no width or browser branch.

</details>

Merged from audit findings: `ux-example-edits-wiped-on-add`, `resilience-example-edit-wipe`.
