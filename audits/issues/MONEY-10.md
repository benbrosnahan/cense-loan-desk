# MONEY-10: $0 IBR payment sends Payoff into a pick-a-plan loop

**P2** · effort S · Money figures and eligibility

When IBR prices at exactly $0, Payoff treats the chosen plan as no plan and tells the borrower to pick one, so the lowest-income borrowers loop between Plans and Payoff and never get the extra-payment control.

| | |
|---|---|
| Who it hurts | Low-income borrowers who follow the app's own recommendation are told to pick the plan they just picked, loop between Plans and Payoff, and never see the true statement that a $0 payment does not clear the balance and the rest is forgiven at the end of the term, nor the Extra control for their plan; some may switch to a plan with a real payment just to get past the screen (plausible, not measured). |
| Standard | No external standard. It breaks the app's own rule that the payoff projection is withheld only when no plan is chosen (README.md:56-58, src/components/ranking/RankingPanel.tsx:8-10, src/lib/ranking.ts:190-192) and contradicts its plan text that a $0 IBR payment is real and still counts (src/data/plans.ts:148, :154). Nielsen heuristics 1 and 9 apply as judgement only. |
| Where | Payoff tab at every width (320 to 1440) and on the live site, once IBR is chosen at a $0 payment: typed income above $0 and at or under 150% of the poverty line, all loans paid out before July 1, 2026, no Parent PLUS loan. Reached from the Plans tab's 'See your debt-free date' card, or from Payoff's own 'Try a different repayment plan' switcher by choosing 'IBR, $0 a month'. |
| Code | [`src/lib/ranking.ts:170`](../../src/lib/ranking.ts#L170), [`src/lib/ranking.ts:199`](../../src/lib/ranking.ts#L199), [`src/components/ranking/RankingPanel.tsx:101-109`](../../src/components/ranking/RankingPanel.tsx#L101-L109), [`src/components/ranking/RankingPanel.tsx:136`](../../src/components/ranking/RankingPanel.tsx#L136), [`src/components/ranking/RankingPanel.tsx:139`](../../src/components/ranking/RankingPanel.tsx#L139), [`src/components/ranking/RankingPanel.tsx:154`](../../src/components/ranking/RankingPanel.tsx#L154), [`src/components/ranking/RankingPanel.tsx:157`](../../src/components/ranking/RankingPanel.tsx#L157), [`src/components/ranking/RankingPanel.tsx:189-195`](../../src/components/ranking/RankingPanel.tsx#L189-L195) |
| Test | `money-core.spec.mjs`: "MONEY-10 a $0 IBR payment is a real plan: Payoff projects it and offers the extra-payment control" |

## Measured

Real clicks from an empty first run (example loans, goal 'Lowest monthly payment', income 20000 typed, 'Use IBR as my plan'): summary '$0 a month on IBR', '✓ This is my plan' pressed, stored selectedPlan 'ibr', next step 'See your debt-free date'. Payoff then shows the H2 'Pick a repayment plan to see your debt-free date' ('We are not going to guess at it') and a 'Choose a plan' button that returns to Plans with IBR still chosen; three full cycles changed nothing. The Extra field, slider, presets and plan switcher are absent, and a stored extra of $100, $500 or $5,000 shows no projection. Same at 320, 375, 768, 1024 and 1440 and on the live site. One dollar of income higher, $23,941 ($0.0083 a month, also shown as '$0'), the same plan gets 'On IBR · $0 a month required', 'This payment does not clear the balance', the 'never reach zero ... forgiven at the end of the term' text, the Extra field and the switcher; a household of 4 flips the same way at $49,500 and $49,501. IBR is exactly $0 at incomes up to $23,940 (1 person), $32,460 (2), $40,980 (3), $49,500 (4) and $83,580 (8), and it was the only plan at exactly $0 across 4,320 estimates. At $20,000 the app's own top pick is IBR at $0 in 10 of 16 goal and employer combinations (every 'Lowest monthly payment' and forgiveness combination, plus 'not sure' with a nonprofit or government employer). Second way in: with Standard chosen, picking 'IBR, $0 a month' in Payoff's switcher swaps the card to the same H2, removes the switcher and drops focus to the page body. Still working in this state: the 'Where should extra money go?' card and the 'Save a dated record' step. Cause: ranking.ts:170 and :199 return null when requiredPayment <= 0, a leftover from when 0 meant 'no plan' (the comment at verify.mjs:437 still says so). RankingPanel now passes null for no plan and skips the engine (RankingPanel.tsx:102, :107), so only a real $0 plan reaches the guard.

## Required

A chosen plan whose required payment is $0 is a real answer. Payoff shows the panel a borrower $1 of income higher already gets, today 'On IBR · $0 a month required', 'This payment does not clear the balance', the existing 'never reach zero ... forgiven at the end of the term' text, the Extra field and the plan switcher, and the screen-reader summary says the same as the visible text. With no plan chosen, Payoff still says 'Pick a repayment plan'.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Look around with example loans'.
2. Open Plans, choose 'Lowest monthly payment', type 20000 in 'Yearly income, before tax' and leave the household at 'Just me'. 'Where we would start' shows IBR at $0 a month.
3. Click 'Use IBR as my plan', then 'Go to payoff' on the 'See your debt-free date' card.
4. The heading reads 'Pick a repayment plan to see your debt-free date' and there is no 'Extra each month' field.
5. Click 'Choose a plan': IBR is still marked as your plan, and 'Go to payoff' brings back the same heading.
6. Control: change the income to 23941 and open Payoff again. It shows 'This payment does not clear the balance' with the Extra field.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-10"`.

## Fix

Three small edits in one commit. Built and tested together in scratch beds: tsc and next build clean, node verify.mjs 182 of 182, no console errors, no overflow at 375px.

1. src/lib/ranking.ts:170 and :199. $0 is a real required payment; 'no plan' already arrives as null and never calls these functions (RankingPanel.tsx:102, :107).
  if (!loans.length || requiredPayment < 0) return null;

2. verify.mjs:437-438 pins the old behaviour, so step 1 alone fails the harness (179 of 180). Replace both lines with:
  // No plan selected: the caller passes null and never calls this. Exactly $0 is
  // a real answer (IBR at or under 150% of poverty), so it must project.
  const zero = ranking.compareStrategies(port, 0, 100);
  ok("$0 required still projects the extra", !!zero && zero.requiredPayment === 0 && zero.budget === 100);
  ok("$0 required and no extra never clears", ranking.compareStrategies(port, 0, 0)?.budgetTooLow === true);
  ok("negative required payment yields null", ranking.compareStrategies(port, -1, 100) === null);
Then change '180 assertions' to '182 assertions' at README.md:90.

3. src/components/ranking/RankingPanel.tsx, in summary, before the return at line 136, and add base to the dependency array at line 139. Without it a screen reader on a $0 plan hears 'Paying the required amount only, you are debt free in ...' while the page says the balance never reaches zero:
  if (extra > 0 && base && !base.paidOff)
    return `On the required payment alone this balance would never reach zero. With ${money(extra)} extra it is gone in ${monthYearFromNow(main.months)}.`;

No new copy or branch is needed: the existing text at RankingPanel.tsx:189-195 is already right for $0, and the no-plan, unpriced and closed-plan states keep 'Pick a repayment plan'.

## Severity

Every borrower whose IBR payment is exactly $0 (income up to $23,940 for one person or $49,500 for four, no loan paid out on or after July 1, 2026, no Parent PLUS loan) and who chooses IBR, which the app itself recommends to them in 10 of 16 goal and employer combinations at $20,000, hits a closed loop every time on step 3 of the page's sequence. No figure is wrong and the payoff-order card and Records step still work, so it stays below P0.

Proposed P1; independent severity judges said P2; final P2.

## Verification

Confirmed by 9 of 9 skeptic votes across 3 filings (reproduce, standards and impact on each); 7 kept P1, 2 impact votes said P2.

<details><summary>Dissent and notes</summary>

Severity: the impact skeptics on money-zero-ibr-payoff-loop and resilience-zero-payment-payoff-dead-end rate it P2. No figure is wrong and nothing is lost; the order card and the Records step still work; Plans still shows the $0 payment, the 20-year term and the forgiven balance; and on typical balances the restored Extra control gives no date until the extra passes the monthly interest (the first date appears at $140 to $170 a month on the fixtures). The other seven votes kept P1 as a closed loop in the page's stated sequence on the app's own recommended path. Fix: every filed fix needed correcting. The guard change alone turns verify.mjs red at line 438 and spreads the false screen-reader sentence to $0 borrowers; moving that assertion to -1 alone still passes with the bug in place (180 of 180). ux-payoff-pick-a-plan-loop's 'requiredPayment + extra <= 0' does not compile (TS2304, TS2448, TS2454); its branch order sends every closed plan to 'Add your income' because closed plans also have monthlyPayment null (calc.ts:287, :312, :327); its button links to #income, which is not mounted on Payoff; its closure sentence ('after July 1, 2026') is false for Extended, Parent PLUS and Tiered Standard closures; and its 'Extra money still helps' copy is not supported ($100 a month on $28,101 at 5.92% never clears and $43,182 is still forgiven). Scope: the same filing counted two more states (income cleared after choosing an income-driven plan, and the chosen plan closed by a later loan); its three skeptics found both have working exits and rate them P2 or P3 alone. Filed wording: the $0 range is 'at or under' $23,940, not 'under', and 'cannot see what even $25 extra would do' overstates the loss, because $25 still never clears on typical balances.

Chosen fix: the < 0 guard plus the harness and screen-reader edits, which all nine skeptics converged on and tested. It reuses the panel the app already shows a borrower $1 of income higher, adds no screen state, and the guard change alone left 45 other plan, income and extra states identical to shipped; the screen-reader edit changes only announcements that were already false. The screen-reader edit also fixes a false announcement that already ships whenever only the extra clears the balance, for example Graduated plus $100 announcing 'Paying the required amount only, you are debt free in May 2041'; no other issue tracks it. Order: land this with or after MONEY-06, otherwise $0 borrowers who type $140 to $190 extra see a debt-free date past IBR's 20-year forgiveness, as $1-a-month borrowers already do. MONEY-06 rewrites the not-cleared copy and the screen-reader summary at RankingPanel.tsx:128-138 into 'Forgiven in {month}' wording; this fix still applies on top of it unchanged, because it only stops $0 being read as no plan, and its screen-reader line should follow MONEY-06's wording if that lands first. Land it before or with MONEY-09, whose fix sends every borrower who types a $0 income to an exact $0 IBR payment. Income 0 with IBR chosen still shows the Pick heading because IBR is unpriced there (MONEY-09). Not measured: how many borrowers reach this state (no analytics by design); the screen-reader check read the aria-live text, not a real screen reader.

</details>

Merged from audit findings: `money-zero-ibr-payoff-loop`, `ux-payoff-pick-a-plan-loop`, `resilience-zero-payment-payoff-dead-end`.
