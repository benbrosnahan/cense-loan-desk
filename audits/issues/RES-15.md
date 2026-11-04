# RES-15: Long unbroken nickname breaks layout and hides Undo

**P3** · effort S · Data safety and resilience

A loan name containing one long unbroken run of characters (about 36 or more at 320px) pushes the Undo button off-screen when that loan is removed and makes Payoff, Plans and Records scroll sideways, so a phone user cannot undo the removal.

| | |
|---|---|
| Who it hurts | A phone user who names a loan with a long unbroken string, such as a pasted account label, and then removes it cannot tap Undo and has to re-enter the loan; Payoff, Plans and Records also scroll sideways on a small screen. |
| Standard | none |
| Where | Phone widths 320 to 430px (measured at 320x640, 375 and 412). The toast after Remove on Loans; Payoff (the 'Your order' list and the 'One thing that undoes all of this' notice); Plans (the 'One date decided this' notice, only when the loan is dated on or after July 1, 2026); Records (the 'Changed since' list when a snapshot names the loan). |
| Code | [`src/components/shared/ui.tsx:585-588`](../../src/components/shared/ui.tsx#L585-L588), [`src/app/page.tsx:250-259`](../../src/app/page.tsx#L250-L259), [`src/components/loans/LoanForm.tsx:446-453`](../../src/components/loans/LoanForm.tsx#L446-L453), [`src/components/ranking/RankingPanel.tsx:467`](../../src/components/ranking/RankingPanel.tsx#L467), [`src/components/ranking/RankingPanel.tsx:502`](../../src/components/ranking/RankingPanel.tsx#L502), [`src/components/plans/PlansPanel.tsx:328-331`](../../src/components/plans/PlansPanel.tsx#L328-L331), [`src/components/history/HistoryPanel.tsx:138-140`](../../src/components/history/HistoryPanel.tsx#L138-L140) |
| Test | `resilience.spec.mjs`: "RES-15 a long loan name keeps Undo on screen and does not widen the page" |

## Measured

With the filed 60-character name (FedLoanServicingAccountNumber0123456789012345678901234567890) at 320x640, after Remove the toast ('Removed <name>', page.tsx:255) spans x -135 to 455 and Undo x 382 to 449, with 0px of Undo on screen. A 60-digit name typed through the form gives -137 to 458 and Undo 384 to 452, and a real tap at x=319 did not restore the loan; one Tab then Enter did reach the off-screen Undo and restored it. The first tested length at which Undo's centre cannot be hit is 36 characters at 320px (44 with touch emulation, where the layout viewport widens to 362px), 44 at 360 and 375px, and 50 at 390 to 430px. Names of 10, 13, 16, 19 (hyphenated) and 20 digits, and of 25 and 41 characters with spaces, keep Undo on screen and tappable. Sideways scroll at 320px, against a 41px baseline every loan tab shows with a short name: Payoff 235px; Plans 229px only when the loan is dated on or after July 1, 2026 (41px for 2024-09-01); Records 202px with a 60-digit name when a snapshot diff names the loan. At 375px: Payoff 180px, Plans 174px (post-cutoff). With 500 unbroken characters: Plans 3,834px, Payoff 3,949px, Records 3,760px (500 digits). On Payoff the name in 'Your order' is clipped by 366px. 500 characters with spaces: the toast is 464px of the 640px screen tall and Undo is reachable. Emoji names: Undo reachable.

## Required

Undo stays on screen and tappable at any name length, and a long name wraps instead of widening Payoff, Plans or Records past the 41px baseline at 320px (that baseline is A11Y-01's to fix).

## Reproduce

1. Set the browser to 320x640 (DevTools device toolbar) and open http://localhost:3100 with no saved data.
2. Click 'Add my first loan', tap '2026–27', type 4000 in 'What you owe on it today', open 'Add more detail', paste FedLoanServicingAccountNumber0123456789012345678901234567890 into Name, and click 'Save loan'.
3. Open Plans: the page scrolls sideways (229px), pushed by the name in the 'One date decided this' notice; with '2024–25' instead it stays at the 41px every tab shows at 320px. Open Payoff: it scrolls sideways (235px) from the name in 'One thing that undoes all of this', and the name in 'Your order' is cut off.
4. Back on Loans, open the loan's row and click Remove. The 'Removed …' toast runs off both edges and Undo sits at x 382 to 449, past the right edge. Tapping at the right edge does nothing before the toast closes. Pressing Tab then Enter does reach Undo.
5. Records, starting again with no saved data: add a loan with a short name and click 'Save today's snapshot' on Records; add a loan named with 60 digits (1234567890 six times) and save another snapshot. The 'Changed since' list names it and the page scrolls 202px sideways.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-15"`.

## Fix

Keep the toast inside the screen, let long names wrap anywhere, and cap new names.

1. src/components/shared/ui.tsx:585-588, the toast pill and its message. my-1.5 replaces py-1.5 because line-clamp clips at the padding box, so padding lets a sliver of a third line show:
```tsx
<div className="rise pointer-events-auto flex min-w-0 max-w-full items-center gap-1 rounded-full bg-slate-900 py-1.5 pl-5 pr-1.5 text-sm font-semibold text-white shadow-lift">
  <span className="my-1.5 pr-3 line-clamp-2 [overflow-wrap:anywhere]">{toast.message}</span>
```

2. Add [overflow-wrap:anywhere] where the name is printed. break-words is not enough: it does not shrink the min-content width, so the name at RankingPanel.tsx:467 stays on one line inside its flex-wrap row.
```tsx
// src/components/ranking/RankingPanel.tsx:467
<p className="text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">
// src/components/ranking/RankingPanel.tsx:502
<strong className="[overflow-wrap:anywhere]">
// src/components/plans/PlansPanel.tsx:328
<div className="mt-1.5 font-semibold [overflow-wrap:anywhere]">
// src/components/history/HistoryPanel.tsx:138
<span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
```

3. src/components/loans/LoanForm.tsx:446-453, cap new names:
```tsx
<input id="nickname" maxLength={60} ... />
```

Measured with these rules injected as CSS at 60 digits and 320px: Undo at x 230 to 298 and tappable; Plans, Payoff and Records back to the 41px baseline; the Payoff name wraps to 4 lines instead of being clipped. No dependency, nothing sent anywhere.

## Severity

Only borrowers who name a loan with a single unbroken run of about 36+ characters (44+ on a 375px phone) are affected; account numbers of 10 to 20 digits and long names with spaces are fine. A touch user who then removes that loan cannot tap Undo and has to re-enter it, but no figure is wrong and keyboard users can still reach Undo.

## Verification

Confirmed by 1 of 1 skeptic (P3 review lens), reproduced with the filed string and through the form at 320 to 430px; the skeptic narrowed the trigger and replaced the layout part of the fix.

<details><summary>Dissent and notes</summary>

The skeptic confirmed the defect and P3 but corrected three points. (1) Plans overflows only when the long-named loan is dated on or after July 1, 2026, because the name appears on Plans only in the cutoff notice at PlansPanel.tsx:328-331; the filing did not state that condition. (2) The filed impact, 'a borrower who pastes a long account number', is overstated: account numbers of 10 to 20 digits never lose Undo; it takes one unbroken run of about 36+ characters at 320px or 44+ at 375px, and keyboard users can still reach Undo. (3) The filed fix did not meet its own requirement: break-words at RankingPanel.tsx:467 had no effect (the name stayed on one line, clipped by 366px), Plans (233px) and Records (202px) still overflowed because PlansPanel.tsx:328 and HistoryPanel.tsx:138 were not touched, and keeping py-1.5 on the clamped toast message let a sliver of a third line show. The fix here is the skeptic's corrected version.

Fix choice: the skeptic's corrected fix over the filed one, for the three reasons in dissent. It was measured by injecting the rules as CSS into the production build, not by a rebuild. [overflow-wrap:anywhere] is a Tailwind arbitrary property and line-clamp-2 a core utility in the project's Tailwind 3.4 (package.json ^3.4.1); none of the edited classNames go through cn() or tailwind-merge. maxLength only limits new typing; names already saved keep their length, which the CSS handles. The Loans list already truncates the name (LoanList.tsx:53), so it is unaffected. The 41px baseline at 320px is A11Y-01 (the header). Related toast issues: A11Y-04 (Undo expires and never pauses) and A11Y-13 (the toast swallows taps beneath it).

</details>

Merged from audit findings: `resilience-long-nickname-undo-offscreen`.
