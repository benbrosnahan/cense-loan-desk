# MONEY-09: $0 income cannot be entered

**P1** · effort S · Money figures and eligibility

Typing 0 in the income field is silently treated as blank, so a borrower with no income can never see the $0 IBR or $10 RAP payment and keeps being steered to a plan with a real monthly bill.

| | |
|---|---|
| Who it hurts | Borrowers with no income now, who most need the $0 or $10 answer, type their true income, see what looks like an accepted 0 and get no change, so the page keeps recommending a $163 to $341 monthly bill on a $30,000 loan unless they type a false $1. |
| Standard | 34 CFR 685.209(b)(4) and (f)(2)(i): the IBR payment is $0 at zero income; 685.209(b)(2)(i), (f)(5) and (g)(3)(ii): RAP's $10 minimum. Nielsen heuristic 1 (visibility of system status): a typed value is dropped with no feedback. |
| Where | Plans tab, 'Yearly income, before tax' (#income) and the IBR and RAP cards, any portfolio without a Parent PLUS loan, at 1280x1000 and at 375x812 with touch, on localhost:3100 and live. Code: page.tsx:735-737 renders a stored 0 as an empty field, page.tsx:739 shows a grey '0' placeholder, and calc.ts:228 treats 0 as 'not supplied', the design recorded at types/index.ts:111. |
| Code | [`src/types/index.ts:111`](../../src/types/index.ts#L111), [`src/types/index.ts:112`](../../src/types/index.ts#L112), [`src/lib/calc.ts:228`](../../src/lib/calc.ts#L228), [`src/app/page.tsx:725`](../../src/app/page.tsx#L725), [`src/app/page.tsx:735`](../../src/app/page.tsx#L735), [`src/app/page.tsx:739`](../../src/app/page.tsx#L739), [`src/app/page.tsx:743`](../../src/app/page.tsx#L743), [`src/components/plans/PlansPanel.tsx:132`](../../src/components/plans/PlansPanel.tsx#L132) |
| Test | `money-core.spec.mjs`: "MONEY-09 typing 0 as income prices IBR at $0 and RAP at $10, and the 0 stays visible after a reload" |
| Fix proof | Validated: [`fixes/MONEY-09.patch`](../fixes/MONEY-09.patch). Adds an optional incomeKnown flag to the profile, set when the income field holds a digit. buildContext treats income 0 with the flag as a real $0 (IBR $0, RAP $10), and blank stays 'not supplied'. The field shows a typed 0 instead of blanking it, the '0' placeholder that made blank look like $0 is removed, and the hint and the IBR/RAP card copy say a non-earner can enter 0. An independent review found it sound, with the notes below. |
| Before applying | Apply MONEY-10's fix with this one, or the new $0 IBR path ends in the pick-a-plan loop. Combine the hint with SCOPE-03's AGI wording, and when merging MONEY-11, keep setting incomeKnown from whether the text holds a digit and keep the visible 0. |
| Overlaps | Changes the same lines as [`fixes/MONEY-11.patch`](../fixes/MONEY-11.patch), [`fixes/SCOPE-02.patch`](../fixes/SCOPE-02.patch), [`fixes/SCOPE-03.patch`](../fixes/SCOPE-03.patch) and [`fixes/SCOPE-06.patch`](../fixes/SCOPE-06.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Legacy $30,000 loan at 6.53%. Typing 0 in #income (also 00, $0, 0.00 and 000,000), at 1280x1000 and at 375x812 with touch: the input value goes back to '', stored income is 0, focus stays in the field and the grey placeholder '0' (4.51:1) still shows, so the box looks as if it took the answer; there is no alert and no aria-invalid. The IBR and RAP cards keep 'Add my income' and offer no 'Use … as my plan' button, and in all 5 goal and employer combinations tried the cards and 'Where we would start' read exactly as with a blank field: Graduated $163 to start (lowest payment) or Standard $341 (default goal, least total, forgiveness); a post-cutoff $18,000 loan gives Tiered Standard $205. The IBR card's 'Add my income' button focuses the same field, whose hint says 'Leave blank if you are not earning yet. We will skip the plans priced off income.' Typing 1 instead gives IBR $0 and RAP $10 ($3,600 in total); the pick becomes IBR for the lowest-payment and forgiveness goals and RAP for the default goal and least total, and RAP at $10 for the post-cutoff loan. Engine: income 0 gives hasIncome false and no IBR or RAP price; with hasIncome forced true, income 0 matches income $1 for all 4 goals and households 1 to 8 with 0 mismatches; by hand, max(0, 0 - 23,940) = 0 gives IBR $0, and 120 / 12 gives RAP $10. With income $25,000 and IBR chosen, select-all and typing 0 blanks the field, the card shows '✓ Your plan' with no number and the summary drops 'a month on IBR'. The live bundle holds the same hasIncome:t.income>0 and placeholder.

## Required

A typed 0 is a real answer: IBR at $0 (34 CFR 685.209(b)(4), (f)(2)(i)) and RAP at its $10 minimum (685.209(b)(2)(i), (f)(5), (g)(3)(ii)), the figures the app already gives at income $1. Blank keeps meaning 'not supplied'. A typed 0 stays visible, survives a reload and looks different from blank, and text with no digit stays blank.

## Reproduce

1. Open http://localhost:3100 in a fresh profile, click 'Add my first loan', pick the '2024–25' school year (the rate fills to 6.53%), enter $30,000 and click 'Save loan'.
2. Open Plans and type 0 in 'Yearly income, before tax'. The box still shows a grey 0, but IBR and RAP keep 'Add my income' and the hero still recommends Standard at $341 a month.
3. Clear the box and type 1: IBR shows $0 a month and RAP $10.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-09"`.

## Fix

Keep blank and 0 apart with a flag, and stop hiding a typed 0. types/index.ts:111-112: add `incomeKnown?: boolean;` to Profile and reword the comment to 'income 0 without incomeKnown = not supplied; with it, a real $0'. calc.ts:228:
```ts
hasIncome: profile.income > 0 || profile.incomeKnown === true,
```
page.tsx:734-747:
```tsx
value={profile.income > 0 || profile.incomeKnown ? profile.income.toLocaleString("en-US") : ""}
onChange={(e) => {
  const raw = formatWholeDollars(e.target.value);
  setProfile((p) => ({ ...p, income: parseNumber(raw), incomeKnown: raw !== "" }));
}}
```
Delete `placeholder="0"` at page.tsx:739 so blank no longer looks like $0. Hint at page.tsx:725: 'Not earning right now? Enter 0 to see what you would pay today. Leave blank to skip the plans priced off income.' Card copy at PlansPanel.tsx:132-133: 'Add your yearly income, or 0 if you are not earning, and we will work out the payment.' formatWholeDollars keeps digits only, so '$', 'abc' or '-' leave the field blank, and clearing the box returns to 'not supplied'. No storage change: profileStore.load (storage.ts:47) merges a saved profile over DEFAULT_PROFILE, so an old saved income of 0 without the flag stays blank.

## Severity

It hits borrowers with no income right now, a recognizable group that includes people already in repayment who lost work: their true answer is dropped without feedback, IBR and RAP keep saying 'Add my income', and the only way through is a false $1, so the pricing journey dead-ends for them. It is not P0 because no IBR or RAP figure shown is wrong; the false claims in the hero at blank income are MONEY-08.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 3 of 3 skeptics (reproduce, standards, impact)

<details><summary>Dissent and notes</summary>

Fix: the member proposed `income: number | null` with a stored 0 mapped to null on every load. All three skeptics built it and found that it does not compile (TS18047 and TS2345 at calc.ts:197 and :203), wipes a typed 0 on each reload, turns '$', 'abc', 'n/a', '-' or '.' into income $0, and keeps the '0' placeholder; their corrected null version passed 21 of 21 browser checks. This report uses the flag from ux-no-income-recommendation-wrong instead (see notes). Severity: all three kept P1; the standards skeptic called P2 defensible, because the number of $0-income users cannot be measured and the hint discloses the skip. Citation: (g)(1)(iii)(A) covers only payments under (f)(1)-(3), and RAP's $10 needs (b)(2)(i), (f)(5) and (g)(3)(ii). Precision: IBR is 'Our pick' at income $1 only for the lowest-payment and forgiveness goals, with RAP the pick at the default goal; 'cannot reach it' holds only for a truthful entry, since a false $1 works and survives a reload; and the hero lines in the member's 5-ui.log read null because that probe's selector missed the uppercased label, so the skeptics measured the hero separately. Hint wording is a judgment call: 'Not earning? Enter 0' on its own could pull students who will earn soon toward a $0 total, because income is held flat for the whole term.

Why the flag: it gives the same behavior with fewer moving parts (no profile key bump or migration, no null checks in calc.ts, income stays a number), and two skeptics of ux-no-income-recommendation-wrong built it: tsc clean, verify.mjs 180 of 180, next build OK, a typed 0 prices IBR $0 and RAP $10 and survives a reload, a saved profile without the flag stays blank, and clearing the box returns to unpriced. If the author prefers a single field, the tested alternative from this member's skeptics is `income: number | null`, DEFAULT_PROFILE income null, `(profile.income ?? 0)` at calc.ts:197 and :203, `hasIncome: profile.income !== null`, and the profile key bumped to cense.loandesk.profile.v3 with a one-time v2 migration (income 0 to null) that removes the v2 key; that is about 50 lines in 4 files (effort M), and leaving DEFAULT_PROFILE.income at 0 in it would show every new visitor IBR $0 and RAP $10. An 'I am not earning right now' button is optional; a typed 0 alone worked. Ship with the Payoff dead-end fix (money-zero-ibr-payoff-loop, ux-payoff-pick-a-plan-loop): ranking.ts:170 and :199 return null for a $0 required payment, so 'Use IBR as my plan' at $0 leaves Payoff on 'Pick a repayment plan'; that already happens at income $1 today, and this fix sends every non-earner there. Any decimal-income fix (money-dollar-fields-strip-decimal, resilience-decimal-income-extra) edits the same onChange and must keep setting incomeKnown from whether the text has a digit, or it brings this defect back. MONEY-08's guard still matters for anyone who leaves the field blank.

</details>

Merged from audit findings: `money-zero-income-cannot-be-entered`.
