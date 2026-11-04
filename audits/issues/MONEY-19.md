# MONEY-19: Records diff rounds changes away

**P3** · effort S · Money figures and eligibility

Records shows balance changes in whole dollars, so a 30-cent change reads '$2,257 → $2,257' and the borrower sees a change flagged with nothing visibly different.

| | |
|---|---|
| Who it hurts | A borrower using Records to catch a servicer error sees a change flagged with no visible difference, or a 1-cent move shown as a dollar, and has to download the spreadsheet to learn what actually moved. |
| Standard | none |
| Where | Records tab, the 'Changed since …' list on any snapshot card that has an older snapshot below it, at every width (measured at 1280x1000 on localhost:3100). Balance rows render through Money, which formats with money() at zero decimals (utils.ts:10), while diffSnapshots flags any balance move over half a cent (storage.ts:91). |
| Code | [`src/components/history/HistoryPanel.tsx:161`](../../src/components/history/HistoryPanel.tsx#L161), [`src/lib/storage.ts:91`](../../src/lib/storage.ts#L91), [`src/components/shared/ui.tsx:53`](../../src/components/shared/ui.tsx#L53), [`src/lib/utils.ts:10`](../../src/lib/utils.ts#L10), [`src/lib/utils.ts:19`](../../src/lib/utils.ts#L19) |
| Test | `money-edges.spec.mjs`: "MONEY-19 a balance change in Records shows the cents that changed, and Hide dollar amounts still blurs them" |

## Measured

Typed through the real form: balance $2,256.60, snapshot, edited to $2,256.90, snapshot. Storage holds 2256.6 and 2256.9, and the Records row reads '2024–25 subsidized balance $2,257 → $2,257'. The downloaded cense-loan-history-2026-11-02.xlsx is exact: its 'What changed' row has Before 2256.6, After 2256.9, Difference 0.3. Seeded pairs: a 98-cent move ($2,256.51 to $2,257.49) also reads '$2,257 → $2,257', and a 1-cent move ($2,256.49 to $2,256.50) reads '$2,256 → $2,257', so a cent can look like a dollar. moneyCents() is defined at utils.ts:19 and called nowhere.

## Required

A row listed under 'Changed since' shows the change ('$2,256.60 → $2,256.90'), with both figures still inside the .amt span so 'Hide dollar amounts' blurs them, as the comment on Money (ui.tsx:49-52) promises for every dollar figure.

## Reproduce

1. Open http://localhost:3100 in a fresh window, click 'Add my first loan', pick school year 2024–25, type 2256.60 in 'What you owe on it today' and click 'Save loan'.
2. Open Records and click 'Save today's snapshot'.
3. Open Your loans, click the loan row to expand it, click 'Edit', change the balance to 2256.90 and click 'Save changes'.
4. Open Records and click 'Save today's snapshot' again. The newer card's 'Changed since' row reads 'balance $2,257 → $2,257'.
5. Click 'Download as a spreadsheet': the 'What changed' sheet shows 2256.6, 2256.9 and 0.3.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-19"`.

## Fix

Give Money an opt-in cents mode and use it only for balance rows in the Records diff, so the figures stay inside the .amt span that 'Hide dollar amounts' blurs.
src/components/shared/ui.tsx:9 and :53:
```tsx
import { cn, money, moneyCents } from "@/lib/utils";

export function Money({ value, className, tabular = true, cents = false }: {
  value: number | null | undefined;
  className?: string;
  tabular?: boolean;
  cents?: boolean;
}) {
  return (
    <span className={cn("amt", tabular && "tnum", className)}>
      {cents ? moneyCents(value) : money(value)}
    </span>
  );
}
```
src/components/history/HistoryPanel.tsx:161-162:
```tsx
<Money value={d.before} cents /> →{" "}
<Money value={d.after} cents />
```
Leave the snapshot totals and every other whole-dollar figure as they are.

## Severity

Only borrowers whose balance moves by less than a dollar between two snapshots see it, which the verifier judged unusual between monthly servicer updates. The row still says the balance changed, the rounding is honest, and the downloaded spreadsheet shows the exact before, after and difference.

## Verification

Confirmed by 1 of 1 skeptic (reproduce); the skeptic corrected the fix

<details><summary>Dissent and notes</summary>

Fix: the skeptic rejected the filed fix as written. Rendering {moneyCents(d.before)} as bare text drops the .amt class, so with Hide dollar amounts on both figures stay readable (0 .amt spans, where the shipped row has 2 blurred at 5.88px); this report uses the skeptic's cents prop on Money instead. Numbers: the skeptic narrowed the filer's claim that rows miss the 'You owe' total in 42% of random portfolios. It holds only for balances entered with cents and grows with loan count: 24.8% at 2 loans, 40.5% at 4, 55.2% at 8, 41.4% over 1 to 10 loans, and 0 of 100,000 when balances are whole dollars. Severity: no disagreement; filer and skeptic both P3.

Fix choice: the skeptic's cents prop over the filer's bare moneyCents(), because only it keeps Hide dollar amounts covering the row. Checked on a scratch copy: the row reads '$2,256.60 → $2,256.90', both figures blur (2 spans, blur(5.88px), nothing readable), verify.mjs 180 of 180. Left open on purpose, from the same filing: whole-dollar figures do not always add up. Two $100.50 loans show rows of $101 and $101 under a 'You owe' of $201 (worst gap $3 over 1 to 10 loans), and the Standard card on the example loans shows $311 a month and $37,300 in total, while $311 x 120 = $37,320 because the true payment is $310.83. Each figure is honestly rounded and this fix leaves them alone. UX-02 and UX-11 also change HistoryPanel.tsx, on other lines.

</details>

Merged from audit findings: `money-records-diff-whole-dollars`.
