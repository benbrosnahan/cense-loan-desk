# MONEY-24: SAVE, PAYE and ICR 2028 transition not mentioned

**P2** · effort S · Money figures and eligibility

The app never mentions that SAVE has ended or that PAYE and ICR end by July 1, 2028, so a borrower choosing a plan here is not told a 90-day servicer deadline is running or which plan they land on if they do nothing.

| | |
|---|---|
| Who it hurts | A borrower leaving SAVE who uses this page to pick a plan gets no word that a 90-plus-30-day clock is running, that doing nothing puts them on Standard (or Tiered Standard), or that their SAVE-forbearance months earned no PSLF credit; 'Use IBR as my plan' can also read as having switched (UX-01). PAYE and ICR enrollees are never told they must move by July 1, 2028 or be placed on RAP. |
| Standard | 34 CFR 685.209(c)(7)(i), (iii)(A); studentaid.gov SAVE FAQ (Oct. 2026) and IDR court-actions page (Sept. 29, 2026), after the March 10, 2026 court order |
| Where | Every state, every tab, every width: measured at 375px and 1440px with every aria-expanded disclosure opened on Loans, Plans, Payoff and Records and with the add-loan form open. The warning belongs at the top of the Plans tab, before 'Where we would start'. |
| Code | [`src/components/plans/PlansPanel.tsx:321`](../../src/components/plans/PlansPanel.tsx#L321), [`src/app/page.tsx:550`](../../src/app/page.tsx#L550), [`src/data/plans.ts:170`](../../src/data/plans.ts#L170), [`src/data/plans.ts:182`](../../src/data/plans.ts#L182), [`src/data/plans.ts:242`](../../src/data/plans.ts#L242), [`src/data/plans.ts:255`](../../src/data/plans.ts#L255), [`src/components/loans/LoanForm.tsx:511`](../../src/components/loans/LoanForm.tsx#L511), [`src/lib/calc.ts:299`](../../src/lib/calc.ts#L299) |
| Test | `money-edges.spec.mjs`: "MONEY-24 the Plans tab says SAVE has ended, about the 90-day window, the default plan and the 2028 end of PAYE and ICR" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

No user-facing text mentions SAVE, PAYE, forbearance, a 2028 deadline, or what happens to a borrower with older loans who does not choose. Skeptic rerun of 8 scenarios at 375 and 1440px (16 runs: 2015-18 undergrad loans with no plan, going for forgiveness at a nonprofit, IBR picked, and no income; a 2012-13 grad borrower on PAYE; older loans plus one paid out 2026-08-17; Parent PLUS only; the empty state with the add-loan form open), every aria-expanded control opened, innerText and textContent: 0 matches for SAVE, REPAYE, 'Saving on a Valuable Education', PAYE, 'Pay As You Earn', forbearance, deadline, 'final notice' and 'court'. ICR appears only in the Parent PLUS note. '2028' appears only as a payoff-table year ('Nov 2028 $28,288') once a plan is picked. With only older loans, 'automatic' has 0 matches; only the post-cutoff Tiered Standard card says what happens by default (plans.ts:170, 182). The only older-loan text naming Standard (calc.ts:299) describes availability, not the default. In source, '2028' is only in code comments (plans.ts:242, 245) and ICR only in the Parent PLUS notes (plans.ts:255, LoanForm.tsx:511). The local and live page bundles have 0 SAVE, 0 PAYE and 0 '2028'. A second skeptic's whole-body scan (10 runs: the empty state and 4 portfolios at 375 and 1440px) and the finder's 4 scenarios at 375px agree.

## Required

ED's SAVE FAQ (Oct. 2026) and court-actions page (Sept. 29, 2026): a court order ended SAVE in March 2026; servicers began sending notices on July 1, 2026 and will notify every SAVE borrower before the end of 2026; the borrower has 90 days from the notice, then a final 30-day notice; with no choice they are put on Standard, or on Tiered Standard if a loan made on or after July 1, 2026 has entered repayment. SAVE-forbearance months earn no PSLF or IDR credit, though PSLF months can be bought back once the borrower has 120 months of qualifying employment. PAYE and ICR end no later than July 1, 2028; under 685.209(c)(7)(i) and (iii)(A) a PAYE or ICR borrower must choose another plan before then or ED places them on RAP, or on IBR for loans RAP cannot take. A page people use to choose a plan should say this where they choose, and say that choosing a plan on the page does not enroll them.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Look around with example loans' (8 loans, all paid out 2022-25).
2. Visit Loans, Plans, Payoff and Records and open every expandable section.
3. Search the page for SAVE, PAYE, ICR, forbearance, deadline and 'automatically': nothing matches.
4. On Plans, answer 'Going for forgiveness' and 'Nonprofit' with income 65,000: still nothing about SAVE, a deadline or the default plan.
5. For contrast, a portfolio with a loan paid out on or after July 1, 2026 (for example one added with the 2026–27 shortcut) gets the Tiered Standard card's 'This is what you get automatically if you never pick a plan.'

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-24"`.

## Fix

Add one warning at the top of the Plans tab for any portfolio with a loan that is not Parent PLUS. (1) src/data/plans.ts: `export const IDR_TRANSITION_NOTE = "A court ended the SAVE plan in March 2026. If you were on SAVE, your servicer's notice gives you 90 days to choose a new plan, then a final 30-day notice. Do nothing and you are put on the Standard plan, or on Tiered Standard if a loan made on or after July 1, 2026 has entered repayment. Months in the SAVE forbearance count toward neither PSLF nor IDR forgiveness, though you may be able to buy back PSLF months once you have 120 months of qualifying employment. PAYE and ICR end by July 1, 2028: choose another plan before then or ED moves you to RAP, or to IBR for any loan RAP does not cover. Choosing a plan on this page does not enroll you. Apply at studentaid.gov.";`. (2) src/components/plans/PlansPanel.tsx: add IDR_TRANSITION_NOTE to the @/data/plans import and render it as a sibling just before line 321, not inside that block (it renders only for postCutoff or parentPlus): `{loans.some((l) => l.kind !== "parent_plus") && (<Notice tone="warn" title="On SAVE, PAYE or ICR now?">{IDR_TRANSITION_NOTE}</Notice>)}`. The default plan is stated in words rather than computed from ctx.postCutoff, because ED's Tiered Standard default also needs the new loan to be in repayment, which the app does not collect.

## Severity

Borrowers leaving SAVE, and those on PAYE or ICR, are a recognizable group choosing a plan right now, and the page says nothing about their deadline or default plan. No figure, date or eligibility answer on the page is wrong, so this is a missing warning (a meaningful missed opportunity) rather than a wrong output.

## Verification

Confirmed by 2 of 2 skeptics (standards, reproduce); both kept P2.

<details><summary>Dissent and notes</summary>

None on the defect or P2. Corrections applied: (1) The filed fix put the note inside the PlansPanel.tsx:321 block, which renders only when ctx.postCutoff || ctx.parentPlus, so a SAVE borrower with only older loans, the main audience, would never see it; it now renders as a sibling before that block. (2) The filed fix chose 'Tiered Standard' or 'the Standard plan' from ctx.postCutoff, but ED's Tiered Standard default also requires the new loan to have entered repayment, which the app does not track, so the rule is stated in words. (3) 'Moved to RAP' left out the IBR fallback in 685.209(c)(7)(iii)(A)(2). (4) The note now mentions PSLF buyback, so PSLF borrowers do not read the forbearance months as lost for good. (5) The '7 million' figure is in none of the evidence ('million' appears 0 times on the three ED pages) and is dropped. (6) The finder's 4 'automatic' matches count the two Tiered Standard sentences twice; there are 2. (7) The filed test's page-wide 'Standard plan' and '90 days' assertions pass today. The standards skeptic adds that 685.209(c)(7) and ED's FAQ put no disclosure duty on a third-party calculator, so this is a content gap, not a compliance failure.

Overlaps MONEY-23, whose fix adds a PAYE and ICR note: if both ship, append MONEY-23's SUNSETTING_PLANS_NOTE inside this notice (when the portfolio has older own loans) and drop the separate 'Two plans not shown' notice, so July 1, 2028 is explained once. The last two sentences also cover part of UX-01 (choosing a plan reads as enrolling). At 375px the full text is long: consider keeping the first two sentences visible and putting the rest in the existing Disclosure component so 'Where we would start' is not pushed far down. Optionally stop showing the SAVE sentences once the servicer windows have closed (the skeptic suggests after mid-2027) and the whole notice after July 1, 2028; both are on-device date checks. A Loans-tab pointer at page.tsx:550 would need its own condition, because that block renders only for post-cutoff portfolios.

</details>

Merged from audit findings: `gap-save-2028-transition-silent`.
