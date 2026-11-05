# Roadmap

Work top to bottom, but land MONEY-04 and MONEY-05 with MONEY-06, and MONEY-15 with or before MONEY-04, as their issue files say. Priorities 1 to 5 correct dollar figures and dates that a typical borrower sees wrong today, and priority 6 stops everyday data loss. After that come fixes for misread inputs and recognizable groups of borrowers, then backups and damaged data, accessibility, findability, next steps after choosing a plan, and upkeep. Most items are small: 84 of the 109 issues are estimated at under an hour each, and none at more than a day.

Every issue has its own file in [`issues/`](issues/) with the measurement, steps to reproduce, the fix and how it was verified. Most have a test in [`tests/`](tests/) that fails today and starts passing once the issue is fixed. [`fixes/`](fixes/) holds a patch for 29 of the 30 P0 and P1 issues, each proven on a copy of the repo: 26 validated and 3 partial (a first step). It also holds unproven draft material for six other fixes. None is applied here. When an issue's test starts passing, remove its `knownIssue()` line and tick the issue off here.

## Top Priorities

**Priority 1: Price income-driven plans on the right income, including none** (Category: Money, Impact: High)

- [ ] [SCOPE-03](issues/SCOPE-03.md) P0/S: Income asked as gross pay, plans priced on AGI
- [ ] [MONEY-08](issues/MONEY-08.md) P0/S: Unpriced plans lose to priced ones when income is blank
- [ ] [MONEY-09](issues/MONEY-09.md) P1/S: $0 income cannot be entered
- [ ] [MONEY-11](issues/MONEY-11.md) P1/S: Dollar fields drop the decimal point
- [ ] [MONEY-10](issues/MONEY-10.md) P2/S: $0 IBR payment sends Payoff into a pick-a-plan loop

**Why:** IBR and RAP are priced from the income answer, and that answer goes wrong in four ways. The label asks for gross pay where the rules use adjusted gross income. A blank income drops IBR and RAP from the recommendation. A typed 0 is treated as blank. A pasted decimal point is dropped, so $52,000.50 is priced as $5,200,050. The borrowers hit hardest have the least money: they are told a $139 to $455 bill is their smallest option while a $0 or $10 payment is open to them. When IBR does come to exactly $0, Payoff treats it as no plan and sends the borrower back to Plans.

**Do:** Each fix is a small change, mostly in `page.tsx`, `calc.ts` and `ranking.ts`:
- Label the field as adjusted gross income, with a plain hint.
- Keep a blank income and a real $0 apart.
- Rank the unpriced IBR and RAP honestly when income is blank.
- Drop the cents after a decimal point instead of keeping them as digits, in the income and extra-payment fields.
- Treat a $0 IBR payment as a chosen plan in Payoff.

**Patches:** [`fixes/SCOPE-03.patch`](fixes/SCOPE-03.patch), [`fixes/MONEY-08.patch`](fixes/MONEY-08.patch), [`fixes/MONEY-09.patch`](fixes/MONEY-09.patch), [`fixes/MONEY-11.patch`](fixes/MONEY-11.patch)

**Done when:** the tests for SCOPE-03, MONEY-08, MONEY-09, MONEY-11 and MONEY-10 pass with their `knownIssue()` lines removed.

**Priority 2: Compare plans on what the borrower actually pays** (Category: Money, Impact: High)

- [ ] [MONEY-01](issues/MONEY-01.md) P0/M: Least-total pick compares unlike totals
- [ ] [MONEY-16](issues/MONEY-16.md) P2/M: Card and reason copy contradicts the numbers

**Why:** Plan comparisons count a forgiven balance as money the borrower paid. So an income-driven plan that takes less of their money is described as costing tens of thousands more, and the default recommendation can be the more expensive plan. Plan-card sentences then contradict the figures beside them.

**Do:** In `simulateIdr`, track the interest the borrower actually pays, and rank plans on what they pay plus a stated tax on any forgiven balance. Name any forgiven balance and the assumed tax in the reasons for the recommendation and in the assumptions note. Make each "pays $X more in total" the difference of the two totals on screen, and reword the plan-card claims that are not always true.

**Patches:** [`fixes/MONEY-01.patch`](fixes/MONEY-01.patch)

**Done when:** the tests for MONEY-01 and MONEY-16 pass with their `knownIssue()` lines removed.

**Priority 3: Fix Graduated's step schedule** (Category: Money, Impact: High)

- [ ] [MONEY-04](issues/MONEY-04.md) P0/M: Graduated breaks the 3x cap and hides its peak

**Why:** Graduated's starting payment is up to 56% too low, because its step schedule breaks the rule that no payment may be more than three times another. The card never shows how high the payment climbs. Borrowers who choose on the monthly number, as the app invites, choose on a wrong one.

**Do:** Solve the starting payment from a five-step schedule within the 3x cap. Show the last step's payment on the card beside the first. Ship this with priority 4's Payoff change, or hide Graduated's Payoff date until then.

**Patches:** [`fixes/MONEY-04.patch`](fixes/MONEY-04.patch)

**Done when:** the MONEY-04 test passes with its `knownIssue()` line removed.

**Priority 4: Make Payoff follow each plan's real schedule** (Category: Money, Impact: High)

- [ ] [MONEY-06](issues/MONEY-06.md) P0/M: Payoff ignores the chosen plan's schedule and forgiveness
- [ ] [MONEY-07](issues/MONEY-07.md) P1/M: Plans and Payoff price multi-rate portfolios differently
- [ ] [MONEY-20](issues/MONEY-20.md) P3/S: Payoff start month off by one

**Why:** Payoff runs every plan as one flat payment for up to 50 years, so Graduated borrowers are told their 10-year plan never ends. For the same reason, some IBR and RAP borrowers are given debt-free dates past their forgiveness date, and extra payments appear to save years they do not save. On top of that:
- With loans at different rates, Plans and Payoff give two end dates and two interest totals for the same plan, because Plans uses one blended rate.
- The Payoff note says payments start this month, but the dates assume next month.

**Do:** Pass the chosen plan's payment schedule and term into the payoff engine, in the same change as MONEY-05 and with MONEY-04. Price the fixed plans loan by loan in Plans, and split Payoff's payment by each loan's own installment, so both tabs show the same figure. Make the note about the first payment match the dates it explains.

**Patches:** [`fixes/MONEY-06.patch`](fixes/MONEY-06.patch), [`fixes/MONEY-07.patch`](fixes/MONEY-07.patch)

**Done when:** the tests for MONEY-06, MONEY-07 and MONEY-20 pass with their `knownIssue()` lines removed.

**Priority 5: Start from where the borrower already is** (Category: Money, Impact: High)

- [ ] [SCOPE-06](issues/SCOPE-06.md) P0/M: Repayment clock assumed to start this month
- [ ] [SCOPE-07](issues/SCOPE-07.md) P1/M: Payments already credited toward forgiveness ignored
- [ ] [MONEY-13](issues/MONEY-13.md) P1/M: Pre-2014 IBR borrowers priced as new borrowers

**Why:** Every repayment term restarts this month, and no qualifying payments already made are counted. A borrower four years into Standard sees $372 instead of their $555 bill, and a debt-free date four years late. A borrower with 120 months of IBR credit is told forgiveness is ten years further away than it is. Loans from before July 2014 also get the wrong IBR terms.

**Do:** Today, say in the assumptions note and in Payoff that every plan starts this month, and add a notice on the Standard card when the typed bill is higher than its estimate. Then ask whether the borrower is repaying on Standard now, and work out the months already used from their bill. Ask how many qualifying payments already count, and price only the payments still owed. Decide whether IBR uses 10% over 20 years or 15% over 25 from the loan dates.

**Patches:** [`fixes/SCOPE-06.patch`](fixes/SCOPE-06.patch), [`fixes/SCOPE-07.patch`](fixes/SCOPE-07.patch) (first step), [`fixes/MONEY-13.patch`](fixes/MONEY-13.patch)

**Done when:** the tests for SCOPE-06, SCOPE-07 and MONEY-13 pass with their `knownIssue()` lines removed.

**Priority 6: Never lose or expose a borrower's data without saying so** (Category: Data safety, Impact: High)

- [ ] [RES-01](issues/RES-01.md) P1/S: Editing example loans then adding one deletes the edits
- [ ] [RES-02](issues/RES-02.md) P1/S: A second open tab silently overwrites the first
- [ ] [RES-03](issues/RES-03.md) P1/S: Failed save still says Saved
- [ ] [RES-04](issues/RES-04.md) P1/S: "Clear my data" leaves income and records behind

**Why:** Four everyday paths lose or expose data without warning:
- Typing over the example loans and then adding one more deletes every row typed.
- A second open tab overwrites what the first saved.
- Blocked storage pretends to save.
- "Clear my data" leaves income and plan answers behind for the next person on that browser, and dated records too if "Clear every loan" was pressed first.

**Do:** Each fix is a small change, mostly in `page.tsx` and `storage.ts`:
- Keep any example row the borrower has edited.
- Re-read storage when another tab writes, and never save back a value this tab only read.
- Warn while saves are failing.
- Make Clear erase everything it says it does.

**Patches:** [`fixes/RES-01.patch`](fixes/RES-01.patch), [`fixes/RES-03.patch`](fixes/RES-03.patch), [`fixes/RES-04.patch`](fixes/RES-04.patch)

**Done when:** the tests for RES-01, RES-02, RES-03 and RES-04 pass with their `knownIssue()` lines removed.

**Priority 7: Catch misread dates and numbers in the loan form** (Category: Money, Impact: Medium)

- [ ] [MONEY-12](issues/MONEY-12.md) P1/S: Two-digit year saves as year 0026 and flips eligibility
- [ ] [A11Y-14](issues/A11Y-14.md) P2/S: Field names, units and required state
- [ ] [RES-14](issues/RES-14.md) P3/S: Implausible values accepted silently
- [ ] [UX-16](issues/UX-16.md) P3/S: Form messages point the wrong way
- [ ] [MONEY-22](issues/MONEY-22.md) P3/S: 0% rate rejected

**Why:** The loan form misreads input it should catch:
- A short date such as 09/15/26 is saved as the year 26, which reopens plans that are closed to the borrower.
- A rate typed as 0.0653 is saved, with no warning on most loan types, so a $12,000 loan shows a $100 payment instead of $136.
- The error messages point the wrong way and quote a rate range the check does not use.

**Do:** Reject years no loan can have. Flag implausible rates and balances with a hint that never blocks saving. Expose the % and $ units and the required fields to screen readers. Make every error message match its check.

**Patches:** [`fixes/MONEY-12.patch`](fixes/MONEY-12.patch)

**Done when:** the tests for MONEY-12, A11Y-14, RES-14, UX-16 and MONEY-22 pass with their `knownIssue()` lines removed.

**Priority 8: Apply the remaining plan rules exactly** (Category: Money, Impact: Medium)

- [ ] [MONEY-03](issues/MONEY-03.md) P1/S: $50 minimum payment missing
- [ ] [MONEY-05](issues/MONEY-05.md) P1/S: IBR compounds unpaid interest
- [ ] [MONEY-21](issues/MONEY-21.md) P1/S: Households over 8 priced as 8
- [ ] [MONEY-14](issues/MONEY-14.md) P2/S: IBR $5 and $10 rounding rule missing
- [ ] [MONEY-15](issues/MONEY-15.md) P2/S: Extended opens at exactly $30,000
- [ ] [MONEY-17](issues/MONEY-17.md) P2/S: Rate table goes stale in July 2027

**Why:** Each rule is small, but each one gives a recognizable group a wrong figure:
- Balances under about $4,400 ignore the $50 minimum payment.
- IBR charges interest on unpaid interest, which the rules do not allow while a borrower stays on IBR.
- Households larger than 8 are priced as 8.
- IBR skips its $5 and $10 rounding.
- Extended opens at exactly $30,000.
- The suggested rate goes stale in July 2027.

**Do:** Make one change per rule, each with its own test. The changes are in `calc.ts`, `plans.ts`, `seed.ts`, `verify.mjs` and the household-size select. Each issue file cites the regulation or official table behind its rule.

**Patches:** [`fixes/MONEY-03.patch`](fixes/MONEY-03.patch), [`fixes/MONEY-05.patch`](fixes/MONEY-05.patch), [`fixes/MONEY-21.patch`](fixes/MONEY-21.patch)

**Done when:** the tests for MONEY-03, MONEY-05, MONEY-21, MONEY-14, MONEY-15 and MONEY-17 pass with their `knownIssue()` lines removed.

**Priority 9: Price Public Service Loan Forgiveness honestly** (Category: Money, Impact: Medium)

- [ ] [MONEY-02](issues/MONEY-02.md) P1/M: PSLF path not priced
- [ ] [SCOPE-01](issues/SCOPE-01.md) P1/S: PSLF promised without the full-time rule

**Why:** The 120-payment path is never priced, so public-service borrowers compare 20- and 30-year totals that can be tens of thousands of dollars off. Part-time workers are promised cancellation they cannot get, because the 30-hour full-time rule is never mentioned.

**Do:** For public-service borrowers, price IBR and RAP over the next 120 payments, and build the PSLF sentences on that figure. This builds on priority 2, so land the two together. Add the full-time rule everywhere PSLF is promised.

**Patches:** [`fixes/MONEY-02.patch`](fixes/MONEY-02.patch), [`fixes/SCOPE-01.patch`](fixes/SCOPE-01.patch)

**Done when:** the tests for MONEY-02 and SCOPE-01 pass with their `knownIssue()` lines removed.

**Priority 10: Say which loans and plans the answers cover** (Category: Eligibility, Impact: Medium)

- [ ] [SCOPE-04](issues/SCOPE-04.md) P1/S: FFEL, Perkins, private and consolidation loans entered as Direct types
- [ ] [MONEY-23](issues/MONEY-23.md) P1/S: Plan count omits PAYE and ICR
- [ ] [MONEY-24](issues/MONEY-24.md) P2/S: SAVE, PAYE and ICR 2028 transition not mentioned
- [ ] [UX-20](issues/UX-20.md) P2/S: No sources or "rules checked" date on screen

**Why:** Borrowers are not told the limits of the answers:
- The loan form offers only Direct loans and never says so, so borrowers with FFEL or Perkins loans, and many with consolidation loans, get answers that do not apply to them.
- The plan count leaves out PAYE and ICR.
- Nothing mentions that SAVE has ended or that PAYE and ICR end by July 2028.
- No screen says when the rules were last checked.

**Do:** These are copy changes only:
- Name the loan types covered, both on the form and next to each answer.
- Name PAYE and ICR and the date they end.
- Add a dated "rules last checked" line that links to the regulations.

**Patches:** [`fixes/SCOPE-04.patch`](fixes/SCOPE-04.patch) (first step), [`fixes/MONEY-23.patch`](fixes/MONEY-23.patch)

**Done when:** the tests for SCOPE-04, MONEY-23, MONEY-24 and UX-20 pass with their `knownIssue()` lines removed.

**Priority 11: Price married and defaulted borrowers correctly** (Category: Eligibility, Impact: Medium)

- [ ] [SCOPE-02](issues/SCOPE-02.md) P1/M: Married borrowers cannot be priced correctly
- [ ] [SCOPE-05](issues/SCOPE-05.md) P1/M: Defaulted loans shown plans and dates that do not apply

**Why:** Married borrowers who file jointly cannot be priced correctly: IBR or RAP is off by up to $71 a month, or by far more when both spouses borrowed, and the recommended plan can flip. Borrowers in default are steered to Standard, Graduated or Extended, plans they cannot use until the loan is out of default.

**Do:** Add a joint-filing answer and the spouse's federal loan balance. Count the spouse in IBR family size, split IBR and RAP by the borrower's share of the couple's loans, and ask for combined AGI. When the servicer is the Default Resolution Group, close every plan but IBR and RAP, and explain rehabilitation.

**Patches:** [`fixes/SCOPE-02.patch`](fixes/SCOPE-02.patch), [`fixes/SCOPE-05.patch`](fixes/SCOPE-05.patch)

**Done when:** the tests for SCOPE-02 and SCOPE-05 pass with their `knownIssue()` lines removed.

**Priority 12: Give borrowers a backup they can restore** (Category: Data safety, Impact: Medium)

- [ ] [RES-05](issues/RES-05.md) P1/M: No backup or restore: the browser holds the only copy
- [ ] [RES-06](issues/RES-06.md) P2/S: "On your device" is really "in this browser"
- [ ] [RES-08](issues/RES-08.md) P2/S: Spreadsheet download fails silently
- [ ] [RES-09](issues/RES-09.md) P2/S: Export file name uses the UTC date

**Why:** Borrowers have no backup to restore, and their data is easy to lose track of:
- Safari removes site data after weeks without a visit, and clearing site data or changing phone empties the app.
- Each browser, in-app browser and iOS 26 Home Screen icon keeps its own separate copy, with no hint that the others exist.
- The spreadsheet download fails silently when its code cannot load.
- Exported files are named by the UTC date, so an evening download in the US is named for tomorrow.

**Do:** Add a backup file that the browser writes and reads on the device, with no server involved. Say on the start screen that loans stay in the browser they were entered in. Show a message when an export fails. Name exported files by the local date.

**Patches:** [`fixes/RES-05.patch`](fixes/RES-05.patch)

**Done when:** the tests for RES-05, RES-06, RES-08 and RES-09 pass with their `knownIssue()` lines removed.

**Priority 13: Keep the app working when it is translated or its data is damaged** (Category: Data safety, Impact: Medium)

- [ ] [RES-12](issues/RES-12.md) P1/M: Machine-translated pages show stale figures and crash
- [ ] [RES-07](issues/RES-07.md) P2/M: Malformed storage locks the borrower out
- [ ] [RES-13](issues/RES-13.md) P3/S: Blank pulsing skeleton when JavaScript fails

**Why:** Three failures leave the borrower stuck:
- With browser translation on, changing plan leaves the previous plan's dates and payments on screen, or crashes the app.
- Some malformed saved records, which today come only from storage changed outside the app, lock the borrower out on every visit.
- A failed script load leaves pulsing gray bars on screen forever.

**Do:** Render changing text as whole elements that React replaces, rather than text it edits in place. Check saved data when it loads. Add an error page with a way back. Show a reload hint when loading stalls.

**Patches:** [`fixes/RES-12.patch`](fixes/RES-12.patch)

**Done when:** the tests for RES-12, RES-07 and RES-13 pass with their `knownIssue()` lines removed.

**Priority 14: Fix reflow and make saves and Undo accessible** (Category: Accessibility, Impact: High)

- [ ] [A11Y-01](issues/A11Y-01.md) P1/S: Header forces sideways scrolling at 320px
- [ ] [A11Y-02](issues/A11Y-02.md) P1/S: Toast status region is not announced
- [ ] [A11Y-04](issues/A11Y-04.md) P2/S: Undo expires at 7 seconds and never pauses
- [ ] [A11Y-13](issues/A11Y-13.md) P3/S: Toast covers focus and swallows taps
- [ ] [RES-10](issues/RES-10.md) P2/S: Undo holds only one action
- [ ] [RES-15](issues/RES-15.md) P3/S: Long unbroken nickname breaks layout and hides Undo

**Why:** Two failures break WCAG in the core flow. Below 361 px wide, including a 1280 px screen at 400% zoom, every section with loans scrolls sideways. Desktop screen readers likely never announce "Saved", "Removed" or the offer to undo. Undo has problems of its own:
- It disappears after 7 seconds.
- The toast can cover the control in focus.
- It only reaches the latest action.
- A loan name with about 36 or more characters and no space can push it off screen.

**Do:** Let the header wrap below 360 px, and take 2 px off its gap so it fits at 360. Keep the status region on the page, empty between messages. Give Undo no deadline and a close button, and let one Undo restore every removal since the toast opened. Make the two Clear buttons ask first instead of offering Undo.

**Patches:** [`fixes/A11Y-01.patch`](fixes/A11Y-01.patch), [`fixes/A11Y-02.patch`](fixes/A11Y-02.patch)

**Done when:** the tests for A11Y-01, A11Y-02, A11Y-04, A11Y-13, RES-10 and RES-15 pass with their `knownIssue()` lines removed.

**Priority 15: Keep keyboard focus and page structure predictable** (Category: Accessibility, Impact: Medium)

- [ ] [A11Y-03](issues/A11Y-03.md) P2/M: Focus is lost to the page after common actions
- [ ] [A11Y-06](issues/A11Y-06.md) P2/S: Radio choices ignore arrow keys
- [ ] [A11Y-05](issues/A11Y-05.md) P3/S: Section change is not announced
- [ ] [A11Y-15](issues/A11Y-15.md) P3/S: Repeated controls share one name
- [ ] [A11Y-16](issues/A11Y-16.md) P3/S: aria-controls points at a missing id
- [ ] [A11Y-17](issues/A11Y-17.md) P3/S: Heading outline and H1
- [ ] [A11Y-18](issues/A11Y-18.md) P3/S: Chart tooltip ignores Escape

**Why:** Keyboard, screen-reader and magnifier users lose their place:
- After 19 of 37 common actions, keyboard focus falls to the page instead of a nearby control.
- Radio groups ignore the arrow keys and make every option a Tab stop, so Plans takes 8 Tab stops instead of 2.
- Section changes never name the new section.
- The heading outline is poor, every plan has a button with the same name, and controls point at panels that are not on the page.
- The hover box on the payoff chart cannot be closed with Escape and covers the axis labels.

**Do:** After each action, move focus to a nearby control, or to the heading of the new section after a Next card. Make the arrow keys move between radio options, with one Tab stop per group. Announce the new section by name. Fix the heading outline and the duplicate button names. Let Escape close the hover box on the payoff chart.

**Done when:** the tests for A11Y-03, A11Y-06, A11Y-05, A11Y-15, A11Y-16, A11Y-17 and A11Y-18 pass with their `knownIssue()` lines removed.

**Priority 16: Raise contrast and support high-contrast modes** (Category: Accessibility, Impact: Medium)

- [ ] [A11Y-07](issues/A11Y-07.md) P2/S: Input borders below 3:1
- [ ] [A11Y-08](issues/A11Y-08.md) P2/S: Slider track below 3:1
- [ ] [A11Y-10](issues/A11Y-10.md) P2/S: Two text colours below 4.5:1
- [ ] [A11Y-12](issues/A11Y-12.md) P2/S: Forced colors hides the selected state
- [ ] [DX-04](issues/DX-04.md) P3/S: slate-* means green; colour literals outside the config

**Why:** Input borders are 1.48:1 and the slider track 1.14:1, against a 3:1 minimum. Two text styles are below 4.5:1. With Windows Contrast Themes on, selected options look the same as unselected ones. The color names in the code hide which ones are the brand green, and the contrast check in the README covers text only, so these regressions are easy to repeat.

**Do:** Darken the shared input border, outline the slider track, and fix the two text colors. Add a forced-colors block for selected states. Rename the palette so each name says what the color is.

**Done when:** the tests for A11Y-07, A11Y-08, A11Y-10, A11Y-12 and DX-04 pass with their `knownIssue()` lines removed.

**Priority 17: Put the page's content in its HTML** (Category: SEO, Impact: High)

- [ ] [SEO-01](issues/SEO-01.md) P1/M: Server HTML is empty: prerender the first-run screen
- [ ] [SEO-02](issues/SEO-02.md) P2/S: Share card has no image or URL
- [ ] [SEO-05](issues/SEO-05.md) P3/S: No canonical, structured data or crawler policy
- [ ] [SEO-06](issues/SEO-06.md) P3/S: SVG-only favicon, no touch icon
- [ ] [SEO-07](issues/SEO-07.md) P3/S: Default 404 is a dead end
- [ ] [PERF-01](issues/PERF-01.md) P3/S: Display font ships unused weights

**Why:** The HTML has no body text until JavaScript runs. AI assistants and crawlers that read raw HTML see only the title and description, and first-time visitors on slow phones wait about 0.9 s longer to read anything. On top of that:
- Link previews have no image.
- There is no canonical URL and no structured data.
- A mistyped address shows a bare 404 with no link back to the app.

**Do:** Server-render the first-run screen. Saved data still loads only in the browser. Then:
- Add the share image, a canonical URL, a small JSON-LD block and PNG icons.
- Add a branded 404 page.
- Load only the bold weight of the headline font.

**Patches:** [`fixes/SEO-01.patch`](fixes/SEO-01.patch) (first step)

**Done when:** the tests for SEO-01, SEO-02, SEO-05, SEO-06, SEO-07 and PERF-01 pass with their `knownIssue()` lines removed.

**Priority 18: Tell borrowers what to do after choosing a plan** (Category: UX, Impact: Medium)

- [ ] [UX-01](issues/UX-01.md) P2/S: Choosing a plan reads as enrolling
- [ ] [UX-04](issues/UX-04.md) P2/S: Answering a question changes the pick off screen
- [ ] [UX-06](issues/UX-06.md) P2/S: One-way consolidation warning is buried
- [ ] [UX-03](issues/UX-03.md) P2/S: Next-step cards land mid-section
- [ ] [UX-05](issues/UX-05.md) P2/M: Plans cannot be compared on one screen
- [ ] [UX-12](issues/UX-12.md) P2/S: Servicer instruction for extra payments is buried
- [ ] [UX-13](issues/UX-13.md) P2/S: Late-fee notice reads as reassurance

**Why:** Plans, Payoff and the Loans tab mislead or hide the next step:
- "Standard is now your plan" sounds like an application was made.
- Answering a question changes the pick below the fold, with no sign on screen.
- The Next cards scroll to the tab bar, not the new section, so a phone user lands far from what they asked to see.
- The warning that consolidating closes the older plans sits 2,124 px below the pick, under a heading about plans the borrower cannot use.
- On a phone, plans cannot be compared side by side.
- The instruction that makes extra payments count is buried at the bottom of Payoff.
- The late-fee note on the Loans tab can read as permission to skip a payment, and borrowers already in default are never told what default costs them.

**Do:** Say that a choice here changes nothing at the servicer, and link to where to apply. Show and announce when the pick changes. Put the consolidation warning under the pick. Scroll the Next cards to the new section. Add a compact comparison table. Move the extra-payment instruction above the payoff order. Reword the late-fee note, and tell borrowers in default what default costs and how rehabilitation works.

**Done when:** the tests for UX-01, UX-04, UX-06, UX-03, UX-05, UX-12 and UX-13 pass with their `knownIssue()` lines removed.

**Priority 19: Test the money results before every deploy** (Category: Testing, Impact: Medium)

- [ ] [DX-01](issues/DX-01.md) P2/M: No CI, no npm test, no browser regression suite
- [ ] [DX-02](issues/DX-02.md) P2/M: verify.mjs misses bugs and can pass on stale output
- [ ] [DX-03](issues/DX-03.md) P3/S: README drift

**Why:** verify.mjs passes 180 of 180 assertions while borrowers see wrong totals. It checks payments and rule tables, not the simulated results, and nothing in the repo runs it before Vercel deploys. The README points to checks that are not in the repository.

**Do:** Run verify.mjs as a prebuild step, and check that Vercel has no build-command override that skips it, so one failing assertion stops the build. Add the result-level assertions drafted in `fixes/DX-02/`, but land each part of its known-bug block only with the money fix it tests, or every build fails. Keep this suite and `.github/workflows/audit.yml` running on every pull request, require its check on `main` with branch protection, and correct the README.

**Done when:** the tests for DX-01, DX-02 and DX-03 pass with their `knownIssue()` lines removed.

**Priority 20: Enforce the privacy promise and keep the platform patched** (Category: Security, Impact: Low)

- [ ] [SEC-01](issues/SEC-01.md) P2/S: Privacy promise is not enforced by a CSP
- [ ] [SEC-03](issues/SEC-03.md) P3/S: Baseline security headers missing
- [ ] [SEC-02](issues/SEC-02.md) P3/M: Next 14 is end of life: plan the exit, static export first
- [ ] [SEC-04](issues/SEC-04.md) P3/S: xlsx frozen on npm
- [ ] [SEC-05](issues/SEC-05.md) P3/S: Two lockfile updates clear production advisories
- [ ] [DX-08](issues/DX-08.md) P3/S: ESLint 8 end of life and weak rules
- [ ] [DX-10](issues/DX-10.md) P3/S: No Node version declared

**Why:** Nothing in the app enforces "stays on this device": there is no Content-Security-Policy, no baseline security headers, and nothing in the build that fails if a change starts sending data elsewhere. Only the privacy tests in this suite would catch it, and they do not block a deploy. Next.js 14 no longer gets security fixes, ESLint 8 is end-of-life, and the repo declares no Node version. The `xlsx` package is stuck at 0.18.5 with two high advisories that npm will never clear, though the app never reads a spreadsheet. Two build-time packages also keep the production audit red. No borrower is exposed today.

**Do:** Ship a Content-Security-Policy that loads everything from the site itself and allows no network connections or form posts, with the baseline headers. Add the verify.mjs check that fails on any network call, third-party script or off-site address in the source. Deploy a static export now, then plan the move off Next.js 14 and ESLint 8. Pin the Node version. Keep `xlsx` at 0.18.5 and record in the README why it is safe. Clear the five build-time advisories in postcss and source-map-js with a lockfile-only update and a package.json override for the postcss copy inside Next.

**Done when:** the tests for SEC-01, SEC-03, SEC-02, SEC-04, SEC-05, DX-08 and DX-10 pass with their `knownIssue()` lines removed.

## Everything else

In severity order. Each is a separate change, and most have their own test. Pick them up between priorities.

- [ ] [MONEY-18](issues/MONEY-18.md) P2/M: Two different "interest added so far" figures
- [ ] [RES-11](issues/RES-11.md) P2/M: Half-typed loan form lost without warning
- [ ] [SEO-04](issues/SEO-04.md) P2/S: Cense site nav links the superseded tools
- [ ] [UX-02](issues/UX-02.md) P2/S: Records says "Nothing changed" when nobody checked
- [ ] [UX-07](issues/UX-07.md) P2/S: Hide amounts leaves figures readable
- [ ] [UX-08](issues/UX-08.md) P2/S: Example data can pass for real
- [ ] [UX-10](issues/UX-10.md) P2/S: Sections are not URLs: Back exits, reload resets
- [ ] [UX-11](issues/UX-11.md) P2/M: Saved records cannot be opened or deleted
- [ ] [AGENT-01](issues/AGENT-01.md) P3/M: Read-only WebMCP calculator tools (optional)
- [ ] [DX-05](issues/DX-05.md) P3/S: Dead code and needless exports
- [ ] [DX-06](issues/DX-06.md) P3/S: framer-motion installed but unused
- [ ] [DX-07](issues/DX-07.md) P3/S: Formatters and sums written more than once
- [ ] [DX-09](issues/DX-09.md) P3/S: noUncheckedIndexedAccess off
- [ ] [DX-11](issues/DX-11.md) P3/S: No license field in package.json
- [ ] [MONEY-19](issues/MONEY-19.md) P3/S: Records diff rounds changes away
- [ ] [PERF-02](issues/PERF-02.md) P3/S: Slider rebuilds Intl formatters and doubles simulations
- [ ] [PERF-03](issues/PERF-03.md) P3/S: Snapshot fade-in delay grows with the list
- [ ] [SEO-08](issues/SEO-08.md) P3/S: vercel.app host: decide the domain now
- [ ] [SEO-09](issues/SEO-09.md) P3/S: Federal tool link is stale
- [ ] [UX-09](issues/UX-09.md) P3/S: "Print one page" prints two
- [ ] [UX-17](issues/UX-17.md) P3/M: One thing has several names across tabs
- [ ] [UX-18](issues/UX-18.md) P3/S: Payoff order rows repeat stock sentences
- [ ] [UX-19](issues/UX-19.md) P3/S: Adding several loans costs avoidable taps
- [ ] [UX-21](issues/UX-21.md) P3/S: Loan rows repeat the type and hide the servicer on phones

