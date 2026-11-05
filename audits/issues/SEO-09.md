# SEO-09: Federal tool link is stale

**P3** · effort S · SEO and findability

The Plans tab links to the federal 'Loan Simulator', a tool now called 'Repayment Calculator', so borrowers are redirected to a page with a different name, and the app credits that tool with a flat-income assumption its current documentation does not state.

| | |
|---|---|
| Who it hurts | A borrower told the 'Loan Simulator' is the authoritative model lands on a page called 'Repayment Calculator', a mismatch at the moment the app hands them to the official source, and the app vouches for its flat-income assumption by pointing at a tool whose own assumptions page does not say it. |
| Standard | None. Federal Student Aid's article on the tool (studentaid.gov/articles/repayment-calculator/) calls it the 'Repayment Calculator (formerly called Loan Simulator)'. |
| Where | Plans tab ('Plans' on phones, 'Repayment plans' from 640px wide) whenever at least one loan is saved, any viewport (measured at 390 and 1280px): the note below the plan cards that opens with the ASSUMPTIONS text and ends 'The federal Loan Simulator is the authoritative model.' |
| Code | [`src/components/plans/PlansPanel.tsx:483`](../../src/components/plans/PlansPanel.tsx#L483), [`src/components/plans/PlansPanel.tsx:487`](../../src/components/plans/PlansPanel.tsx#L487), [`src/data/plans.ts:279`](../../src/data/plans.ts#L279), [`src/lib/calc.ts:138-139`](../../src/lib/calc.ts#L138-L139), [`README.md:130`](../../README.md#L130) |
| Test | `seo-agentic.spec.mjs`: "SEO-09 the Plans note links the federal Repayment Calculator by its current name and address" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

On the Plans tab with saved loans at 390 and 1280px, the visible link reads 'Loan Simulator' and points at https://studentaid.gov/loan-simulator/. In a real browser that URL answers 301 to https://studentaid.gov/repayment-calculator/, which answers 200 with title 'Repayment Calculator | Federal Student Aid', H1 'Repayment Calculator' and 0 hits for 'loan simulator' in the visible text; the 19 hits in its HTML are internal ids such as fsa_Text_LoanSimulatorHeader. Federal Student Aid's article on the tool calls it 'Repayment Calculator (formerly called Loan Simulator)'. The Plans tab names the old tool twice: the link sentence, and ASSUMPTIONS at plans.ts:279, which says the app holds income flat 'like the federal Loan Simulator'. The tool's assumptions page (studentaid.gov/repayment-calculator/about, 1,346 words) has 0 hits for growth, raise, salary or increase and does not say income is held flat; it does say poverty guidelines change with estimates of inflation. Node fetch without following redirects: studentaid.gov 200, cense.beehiiv.com 200, /repayment-calculator/ 200, /loan-simulator/ 301. curl -sI with curl's default user agent fails against studentaid.gov 3 of 3 times (exit 92, HTTP/2 INTERNAL_ERROR; it times out with --http1.1); with a browser user agent it returns the 301.

## Required

The link uses the tool's current address and name (https://studentaid.gov/repayment-calculator/, 'Repayment Calculator'), and the app attributes an assumption to the federal tool only where the tool's own documentation states it.

## Reproduce

1. Open http://localhost:3100 and click 'Look around with example loans'.
2. Open the Plans tab ('Repayment plans' in a wider window) and scroll below the plan cards to the note ending 'The federal Loan Simulator is the authoritative model.'
3. Click 'Loan Simulator'. The new tab goes through a 301 and lands on studentaid.gov/repayment-calculator/, titled 'Repayment Calculator', with no mention of a Loan Simulator.
4. On that page, click 'Learn more about our assumptions': nothing there says income is held flat. Command line: curl -sI -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' https://studentaid.gov/loan-simulator/ shows the 301 (curl's default user agent is refused).

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-09"`.

## Fix

Point the link at the current address and name, and stop crediting the federal tool with an assumption its documentation does not state. Five strings in four files, no dependency:
1. src/components/plans/PlansPanel.tsx:483 and :487:

  href="https://studentaid.gov/repayment-calculator/"
  ...
  Repayment Calculator

2. src/data/plans.ts:279, the end of ASSUMPTIONS:

  "... And they hold your income flat for the whole term, which almost never happens."

3. src/lib/calc.ts:138-139, the comment:

  * Deliberately conservative: income is held constant, and the UI says so.
  * Modelling raises would produce a friendlier number we could not defend.

4. README.md:130:

  - Income is held flat for the whole term.

## Severity

Every borrower with saved loans who opens the Plans tab sees the link, but it still works in one hop and lands on the right federal tool, whose own article says it was formerly called Loan Simulator, and no figure or eligibility answer changes. The flat-income comparison is undocumented rather than shown false, so this stays polish.

## Verification

Confirmed by 1 of 1 skeptics (single P3 verifier, reproduce lens), who followed the link in a real browser at 390 and 1280px, found Federal Student Aid's own rename notice, and built the corrected link.

<details><summary>Dissent and notes</summary>

None on severity: the filing lead and the verifier both rate it P3. Corrections adopted: (1) the filed reproduce command, curl -sI with the default user agent, fails against studentaid.gov and needs a browser user agent. (2) The filing said plans.ts:279 tells borrowers the estimates match the Loan Simulator; it says only that the app, like that tool, holds income flat. (3) Renaming that sentence would repeat a claim the tool's current assumptions page does not state, so the comparison is dropped rather than renamed. (4) The filed 'two-string change' is five strings in four files; effort stays S.

Fix choice: the verifier's corrected fix, taking its fallback branch. The verifier did not run the federal calculator, because that means submitting a federal form, so the flat-income comparison is unconfirmed rather than false; FSA's article says to enter a different income manually to explore other scenarios, which is suggestive but not proof. If the author re-checks the calculator and confirms it holds income flat, the comparison can come back under the new name. Even then the two models differ: simulateIdr (src/lib/calc.ts:142-158) applies one fixed monthly payment for the whole term, so the app also holds the 2026 poverty guidelines flat, while the tool's assumptions page says it raises them with estimated inflation. verify.mjs has no assertion on these strings, so the change breaks no existing check.

</details>

Merged from audit findings: `seo-stale-federal-tool-link`.
