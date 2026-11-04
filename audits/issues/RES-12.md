# RES-12: Machine-translated pages show stale figures and crash

**P1** · effort M · Data safety and resilience

When a borrower uses browser translation, changing a plan or extra payment leaves the previous plan's dates, payments and names on screen, or crashes the app to an error page with no way back.

| | |
|---|---|
| Who it hurts | After switching to IBR, a borrower reading in another language still sees Standard's December 2036 debt-free date and $311 payment and can conclude that IBR's lower payment costs no extra time, when it runs to February 2042. A button that names Standard saves RAP, and the first extra-payment tap replaces the app with an error page that has no button. |
| Standard | None. The mechanism is facebook/react#11538: a page translator replaces text nodes that React still holds. The issue was closed on 2025-12-20 as not fixable in React, and the closing comment recommends app-side workarounds (spans, string interpolation or keys, or translate="no"). |
| Where | After a browser's page translation has run: simulated with the edit Chrome's translator makes (each text node swapped for <font><font>), and reproduced with Google's own translate script in Spanish, Vietnamese and Chinese. Measured at 375x812, with key cases repeated at 1440x900, on the local production build. Payoff: the eyebrow, the headline and the sentence under it, the chart legend, the 'Gone by' dates, the snowball-cost notice, the order reasons and 'One thing that undoes all of this'. Plans: the top pick's amount and button. Also the summary line under YOU OWE, the loan rows, the first Records save, and the add-loan form's rate hint and validation messages. src/app has no error.tsx, so any of these errors unmounts the whole page. |
| Code | [`src/components/ranking/RankingPanel.tsx:170-173`](../../src/components/ranking/RankingPanel.tsx#L170-L173), [`src/components/ranking/RankingPanel.tsx:176-187`](../../src/components/ranking/RankingPanel.tsx#L176-L187), [`src/components/ranking/RankingPanel.tsx:188-221`](../../src/components/ranking/RankingPanel.tsx#L188-L221), [`src/components/ranking/RankingPanel.tsx:333-341`](../../src/components/ranking/RankingPanel.tsx#L333-L341), [`src/components/ranking/RankingPanel.tsx:419-435`](../../src/components/ranking/RankingPanel.tsx#L419-L435), [`src/components/ranking/RankingPanel.tsx:476-483`](../../src/components/ranking/RankingPanel.tsx#L476-L483), [`src/components/ranking/RankingPanel.tsx:484-488`](../../src/components/ranking/RankingPanel.tsx#L484-L488), [`src/components/ranking/RankingPanel.tsx:497-504`](../../src/components/ranking/RankingPanel.tsx#L497-L504) |
| Test | `resilience.spec.mjs`: "RES-12 a translated page shows the same figures as the untranslated one and never crashes" |

## Measured

Local production build, 375x812. With the simulated translator applied once before each action, 20 of 53 single actions crash, 27 leave stale text and 6 are clean; the untranslated control has 0 differences. Payoff, Standard to IBR in 'Try a different repayment plan' at $0 extra: the card shows 'ON STANDARD · $234 A MONTH REQUIRED', 'Debt free in December 2036' and 'That is 10 yr 1 mo', and the summary says '$234 a month on Standard'; the control shows IBR, February 2042, 15 yr 3 mo and 'on IBR' (Standard is $311). Preset $100 to $200: '3 years 1 month sooner' and 'done Nov 2033' against a true 4 years 8 months and Apr 2032, and all 8 'Gone by' dates keep their $100 values. Plans, income typed after translation: the heading says RAP, the button says 'Use Standard as my plan', and clicking it saves 'rap'. A rate edited from 4.99 to 6.8 still lists 4.99%, and after a removal the summary still says 8 loans (true: 7). With Google's real script (element.js, the library Chrome's built-in translation loads), production was wrong in 15 of 15 runs across Spanish, Vietnamese and Chinese (6 crashed, 9 stale) and in 9 of 9 actions in a second Spanish set (8 stale, 1 crash). The real script also leaves dollar figures stale, because it copies inline amounts into its reordered sentence: after the IBR switch the eyebrow reads 'EN ESTÁNDAR · SE REQUIEREN $311 AL MES $234', and after $100 to $200 the interest saved reads 3.080 dólares where the true figure is $4,600. Crashes: every extra-payment change off $0 or back to None (15 of 33 extra-amount changes, including the first slider step), 'Smallest balance first', Graduated in the plan switcher, clearing income on IBR, the first 'Save today's snapshot', Grad PLUS after picking a school year, and fixing a validation error in the add-loan form. Each throws NotFoundError from removeChild or insertBefore and leaves only 'Application error: a client-side exception has occurred' with 0 controls. The tapped amount is saved before the crash, so a reload shows its answer, and the next change that flips a branch crashes again.

## Required

After any action on a translated page, every figure, date, plan name and button label matches an untranslated run of the same steps; no action unmounts the app; and any other render error shows a screen with a way back.

## Reproduce

1. In Chrome, open http://localhost:3100 with no saved data and click 'Look around with example loans'.
2. Open Plans and translate the page (right-click > 'Translate to Español'). Type 30000 in 'Yearly income, before tax'. The top pick's heading changes to RAP while its button still names Standard ('Utilizar Estándar como mi plan'), and tapping the button saves RAP.
3. Reload and show the page in English. In Plans, set the income to 52000 and tap 'Use Standard as my plan' on the Standard card, then open Payoff: 'On Standard · $311 a month required' and 'Debt free in December 2036'.
4. Translate the page again. Tap 'See how a different plan changes this' and choose IBR in 'Try a different repayment plan'. In English this shows IBR, $234, February 2042 and 15 years 3 months; translated, the card still says Estándar, $311, diciembre de 2036 and 10 años y 1 mes next to the new $234.
5. Tap the $25 preset under 'Extra each month'. The page turns into 'Application error: a client-side exception has occurred' with no buttons.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-12"`.

## Fix

Make every piece of text that can change something React replaces whole, instead of a text node it edits beside the translator's copy. Four parts, each measured on a scratch build; no dependency, nothing sent off the device.

1. For example:
RankingPanel.tsx:171  <span>{`On ${PLAN_META[selected!.id].name} · `}</span>
RankingPanel.tsx:185  <span key="date">{`Debt free in ${monthYearFromNow(main.months)}`}</span>
PlansPanel.tsx:373    {`Use ${PLAN_META[top.estimate.id].name} as my plan`}
HistoryPanel.tsx:81   {!sorted.length && <span> It becomes available once you have saved a snapshot.</span>}
PayoffRunway.tsx:169 keeps the base date: {`done ${shortMonthYearFromNow(monthsBase, now)}`}

2. For example:
<p key={`sub-${main.paidOff}-${extra}-${main.months}-${monthsSaved}-${roughly(interestSaved)}-${comparison.budget}-${base ? base.paidOff : "x"}`} className="mt-2 text-base leading-relaxed text-slate-700">
None of these blocks holds a focusable control. Buttons (the top pick, Disclosure) keep the template string from part 1 instead of a key, so a focused button is never replaced.

3. ui.tsx:266-284: key Field's two messages, so clearing a validation error swaps whole elements:
{error ? (<p key="error" id={...} role="alert" ...>...</p>) : (hint && <p key="hint" id={...} ...>{hint}</p>)}

4. Add src/app/error.tsx, a client component whose 'Try again' button calls reset(), as the backstop for any site still missed (the same file RES-07 proposes).

## Severity

Borrowers who read the page through browser machine translation (measured with Chrome's translator; how many there are is unknown because the app has no analytics) see the wrong payoff date, plan name or dollar figure after almost every change on Payoff, Plans and Loans, and a button that saves a different plan than it names. Their first extra-payment tap crashes the app to a screen with no controls. That is P0-type harm and a dead-ended key journey, limited to one recognizable group, so P1. Nothing on screen mentions translation, so no level is dropped.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards and impact on each); two of them also reproduced it with Google's real translation script, not only the simulation.

<details><summary>Dissent and notes</summary>

Severity: the stale-figures filer and its three skeptics rated P0, and the crash filer and its three skeptics P1, under the audit leads' scale. This report's P0 needs a typical borrower, and only translated sessions are affected, so the issue is P1. Evidence corrections: the filer's 'no dollar amount went stale (0 of 27)' holds only for the simulation. With Google's real script, 6 of 8 stale actions in one set also showed a stale dollar figure ($311 where the truth is $234, $217, $274 or $314; interest saved $3,080 where it is $4,600 or $8,260; $1,030 where it is $1,850). 'Nothing on screen shows the text is out of date' overstates it slightly: the Done stat, the plan select and the chart axis do update, and with the real script the new figure trails the sentence as a stray number, but nothing says which figure is current. Crash counts: typing a new amount over a selected one goes stale instead of crashing, which gives 19 of 53 and 14 of 33; clearing the field first gives 20 and 15. The crash filing's 'the payoff answer is out of reach' overstates it: the tapped amount is saved, a reload shows that amount's answer, and repeating the same tap does nothing; what crashes again is the next move off $0, back to None or across the 'takes N longer' clause, while moves between non-zero presets go stale. Fix: the filed fix.diff passed the simulation but not the real script (7 of 15 runs and 3 of 9 actions still stale), and on its own it turns the strategy-switch crash into a silent wrong instruction, because 'One thing that undoes all of this' keeps naming the old target loan. It also misses Field, where 3 validation-recovery paths still crash. The filed prose gave PayoffRunway.tsx:169 monthsMain, which would print the with-extra date on the 'Required payment only' line; fix.diff itself correctly uses monthsBase. The filed Playwright test uses the one-for-one swap, which passes fix.diff while it is still broken. The standards skeptic on the stale-figures filing would use keys alone (keyed-blocks.diff, 36 lines in 6 files, clean in 9 of 9 real-script actions); the impact skeptic keeps fix.diff and adds keys. Citation: facebook/react#11538 covers the crash; the stale-text side is documented elsewhere (Martijn Hols, May 2024).

Fix choice: fix.diff plus the 11 keys plus the Field keys plus error.tsx. fix.diff covers every crash site measured on Payoff, Plans, Loans, Records and the add-loan form. The keys are needed because Google's script copies inline amounts and <strong> dates into its translated sentence, so a text-level update never reaches the copy users see. The Field keys close the 3 validation crashes fix.diff misses, and error.tsx turns anything left into a recoverable screen. keyed-blocks.diff alone is smaller and was clean in 9 of 9 real-script actions, but it leaves the crash sites outside those blocks: the snowball notice, the order reasons, the Records note, the rate hint and Field. Measured: fix.diff plus the 11 keys was clean in 15 of 15 real-script runs in Spanish, Vietnamese and Chinese with 0 crashes, and 8 of 8 under the offline clone model; untranslated text matched production in 16 of 16 steps, and the route chunk went from 37.2 to 37.6 kB. fix.diff plus the Field keys plus error.tsx (bedB) gave 0 of 7 crashes under a live translator model, with headlines matching the control. error.tsx alone (bedA) turned all 7 crashes into a 'Try again' screen that restores the app, but it lands on Loans or the first-run screen and drops a half-filled form, so it is a backstop, not the fix. The two halves were built in separate beds and never together: build them together and rerun both probe sets before shipping. Rejected: translate="no" removes translation from the people who need it, and patching Node.prototype.removeChild hides the crash but leaves stale translated text on screen. Not tested: Safari's and Edge's translators. error.tsx is also proposed in RES-07, so add it once.

</details>

Merged from audit findings: `gap-translate-stale-figures`, `gap-translate-crash-dead-end`.
