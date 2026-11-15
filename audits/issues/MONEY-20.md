# MONEY-20: Payoff start month off by one

**P3** · effort S · Money figures and eligibility

The Payoff note says payments start this month, but the dates assume the first payment is next month, so the debt-free date a borrower reads is one month later than the note implies.

| | |
|---|---|
| Who it hurts | A borrower who reads the note counts from this month and expects to finish a month earlier than the date shown; for a loan one payment clears, the page names next month when the money goes in this month. |
| Standard | none |
| Where | Payoff tab with a plan selected, at every width (measured at 1280x1000 on localhost:3100 on 2 November 2026): the 'What this assumes' line under the Done, Interest and Monthly figures, read against the headline date, the 'You would finish in' sentence, the Done figure and the chart legend. |
| Code | [`src/components/ranking/RankingPanel.tsx:334`](../../src/components/ranking/RankingPanel.tsx#L334), [`src/lib/ranking.ts:103`](../../src/lib/ranking.ts#L103), [`src/lib/utils.ts:88`](../../src/lib/utils.ts#L88) |
| Test | `money-edges.spec.mjs`: "MONEY-20 the Payoff note\'s first-payment month agrees with the debt-free date it shows" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

On 2 November 2026, a $100 loan at 6% on Standard with $200 extra is cleared by one payment, and the page says 'You would finish in December 2026', Done 'Dec 2026' and 'Gone by Dec 2026', while the note says 'What this assumes: payments start this month'. The engine reports 1 month, balances 100.00 then 0.00, and $0.50 of interest, so a full month accrues before the first payment (ranking.ts:103 accrues, then the loop pays), and monthYearFromNow(1) names next month (utils.ts:88). $30,000 at 6% on Standard with no extra: 'Debt free in November 2036', 120 months. Hand calendar with no app code: a first payment this month puts payment 120 in October 2036; a first payment next month puts payment 1 in December 2026 and payment 120 in November 2036. RankingPanel.tsx:334 is the only copy that makes this claim, and the same string ships in the live page chunk.

## Required

The note and the dates agree. The skeptic judged the engine's accrue-then-pay timing a fair model, so the note should say the first payment is next month.

## Reproduce

1. Open http://localhost:3100, click 'Add my first loan', pick a school year before 2026–27, type 100 in 'What you owe on it today' and 6 in 'Interest rate', and click 'Save loan'.
2. Open Repayment plans and click 'Use Standard as my plan'.
3. Open Payoff and click the $200 amount. The text reads 'You would finish in December 2026' (on 2 November 2026), Done shows Dec 2026, and the line below says 'What this assumes: payments start this month'; one payment made this month would finish this month.
4. Optional: a $30,000 loan at 6% with no extra reads 'Debt free in November 2036', which is 120 payments starting next month.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-20"`.

## Fix

Copy only, no engine change. src/components/ranking/RankingPanel.tsx:334:
```tsx
What this assumes: your first payment is next month, and your required
payment stays at <Money value={comparison.requiredPayment} />{" "}
the whole way.
```

## Severity

Every borrower who opens Payoff with a plan selected reads this note, every time, but it is off by exactly one month against dates that follow a fair accrue-then-pay model. No dollar figure or plan choice depends on it, so it is a wording fix rather than a statement anyone would act on.

## Verification

Confirmed by 1 of 1 skeptic (reproduce)

<details><summary>Dissent and notes</summary>

No disagreement on severity or fix: the skeptic kept P3 and the filed copy change. The skeptic noted that the filer's 'every date on the tab reads one month later' is slightly strong, because the 'Gone by' lines stay literally true if read as 'paid off by the start of that month'; 'You would finish in December 2026' after a single payment cannot be read that way.

Fix choice: change the note, not the engine. Labelling the first payment as this month would move every date and interest figure, and the skeptic judged the accrue-then-pay timing fair. Checked on a scratch copy: the note reads 'your first payment is next month', dates are unchanged, verify.mjs 180 of 180. Other issues edit the same paragraph: MONEY-06 rewrites its Graduated and income-driven clauses (RankingPanel.tsx:334-340), and SCOPE-06 adds a school-or-grace sentence at RankingPanel.tsx:334 that its filer wants worded to match this fix, while two of its skeptics' drafts for plans.ts:278 say the first payment is 'due now'. Keep every copy saying next month. If SCOPE-06's first-payment-month question lands, derive this line from that answer instead.

</details>

Merged from audit findings: `money-payoff-month-off-by-one`.
