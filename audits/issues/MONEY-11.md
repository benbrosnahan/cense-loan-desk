# MONEY-11: Dollar fields drop the decimal point

**P1** · effort S · Money figures and eligibility

The income and extra-payment fields drop a typed or pasted decimal point and keep the cents as digits, so $52,000.50 income is priced as $5,200,050 and the borrower can be shown the wrong plan and payment.

| | |
|---|---|
| Who it hurts | A borrower who copies income with cents from a W-2 or pay stub is priced on 100 times their income, and for lowest-payment and public-service borrowers the top of the Plans tab quietly recommends a plausible wrong plan (Graduated $139 or Standard $311 instead of IBR $0) with only the field itself to give it away. |
| Standard | No external standard. The same app keeps cents on its loan form ('$2,256.40' reads 2,256.40, src/components/loans/LoanForm.tsx:337 and :344); README.md:187-188 ('Pasted values like $2,256.40 are cleaned rather than rejected') describes that loan form, so it is a comparison here, not a broken promise. |
| Where | Plans tab, 'Yearly income, before tax' (#income), and Payoff tab, 'Extra each month' (#extra), typed or pasted; measured at 1280 and 375 widths and on the live site. On iPhone the numeric keypad has no decimal key (inputmode numeric at page.tsx:731 and RankingPanel.tsx:240, per WebKit source), so there it is a paste problem; on Android the keys depend on the keyboard app. No real phone was tested. |
| Code | [`src/lib/utils.ts:112-117`](../../src/lib/utils.ts#L112-L117), [`src/app/page.tsx:728-748`](../../src/app/page.tsx#L728-L748), [`src/components/ranking/RankingPanel.tsx:98`](../../src/components/ranking/RankingPanel.tsx#L98), [`src/components/ranking/RankingPanel.tsx:237-249`](../../src/components/ranking/RankingPanel.tsx#L237-L249), [`src/components/shared/ui.tsx:301-340`](../../src/components/shared/ui.tsx#L301-L340), [`src/lib/utils.ts:120-127`](../../src/lib/utils.ts#L120-L127), [`src/components/loans/LoanForm.tsx:337`](../../src/components/loans/LoanForm.tsx#L337), [`src/components/loans/LoanForm.tsx:344`](../../src/components/loans/LoanForm.tsx#L344) |
| Test | `money-core.spec.mjs`: "MONEY-11 a decimal point in income or extra is read as cents, never as more digits" |

## Measured

Shipped build, 8-loan example portfolio ($28,101), real key presses and a real clipboard paste. Income control, typed 52000: RAP $217, IBR $234, Standard $311, top pick Standard. Income '$52,000.50', typed or pasted: field '5,200,050', stored 5200050, hero 'RAP $43,334 a month', RAP card 'Our pick ... Per month $43,334 ... In total, over 1 mo $28,240'. Typed key by key it reads 52,000, then the '.' vanishes (52,000), then 520,005, then 5,200,050. '52,000.00' gives 5,200,000 (RAP $43,333) and '52000.5' gives 520,005 (10x). The result is not always absurd: RAP moves about 200x because its bracket also changes, but IBR only goes from $234 to $311 (capped) and Standard and Graduated do not move. Across 208 goal, employer and income combinations the top pick changed in 108, always to a higher payment, and in 78 of those the new pick is under $1,000 a month and looks normal (median +$161 a month). Examples: $20,000.50 with goal 'Lowest monthly payment' shows 'Graduated $139' where 20000 gives 'IBR $0'; a nonprofit borrower going for forgiveness at $52,000.50 sees 'Standard $311' instead of 'RAP $217'. Extra, with Standard chosen: typed 12.50 gives field 1,250, stored 1250 and the headline '$1,250 extra a month gets you out 8 years 6 months sooner'; pasted 12.50 gives field 125 while the engine uses 12.5 and the headline says '$13 extra a month gets you out 7 months sooner', and this survives a reload; typed 100.50 gives field 5,000 (the cap) and '$5,000 extra a month gets you out 9 years 7 months sooner'. Control: the loan form's balance field (inputmode decimal, formatDollarsInput) reads '$2,256.40' and '$52,000.50' correctly. Same results at 375 and on the live site, where $20,000.50 became 2,000,050 and a nonprofit forgiveness pick moved from IBR $0 to Standard $311. Cause: #income runs formatWholeDollars (utils.ts:112-117), which strips the point before parsing (page.tsx:743-745); both fields rebuild their text from the stored number (page.tsx:734-738, RankingPanel.tsx:242), so a typed point vanishes and later digits append; on #extra parseNumber keeps the point (RankingPanel.tsx:246) while the display drops it, so field and engine disagree.

## Required

A decimal point is read as dollars and cents, never as more digits: $52,000.50 is used as $52,000 (RAP stays $217 and the pick stays Standard on the example loans) and 12.50 extra as $12. Once the field loses focus, the field, headline and engine show the same whole-dollar amount, and the $5,000 cap on Extra still holds.

## Reproduce

1. Open http://localhost:3100 with no saved data and click 'Look around with example loans'.
2. Open Plans and type 52000 in 'Yearly income, before tax'. 'Where we would start' shows Standard at $311 and the RAP card shows $217 a month.
3. Clear the field and type 52000.50, or paste $52,000.50. The field shows 5,200,050 and the RAP card reads 'Our pick', $43,334 a month, 'In total, over 1 mo $28,240'.
4. Clear the field, type 52000 again, click 'Use Standard as my plan', then 'Go to payoff'. Type 12.50 in 'Extra each month': the field shows 1,250 and the headline says '$1,250 extra a month gets you out 8 years 6 months sooner'. Paste 12.50 instead: the field shows 125 and the headline says '$13 extra'.
5. Control: on Loans click 'Add a loan' and paste $2,256.40 into 'What you owe on it today'. It reads 2,256.40.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-11"`.

## Fix

Replace both fields with one small whole-dollar input that shows the typed text only while focused and only while it still means the stored number. Deriving that during render, with no useEffect, keeps the cap, presets and slider in charge and adds no lint warnings. Tested in scratch beds: typed and pasted cents show while editing, store 52000 and 12, read 52,000 and 12 after blur, 7,500 caps at 5,000, a preset replaces the draft, verify.mjs 180 of 180.

// src/components/shared/ui.tsx: add formatDollarsInput and parseNumber to the "@/lib/utils" import on line 9
/** Whole dollars. A typed or pasted point shows while typing; the cents are dropped, never appended. */
export function WholeDollarInput({ value, onValueChange, max = Infinity, onBlur, ...rest }:
  Omit<React.ComponentProps<typeof AffixInput>, "value" | "onChange"> & {
    value: number; onValueChange: (n: number) => void; max?: number;
  }) {
  const [draft, setDraft] = useState("");
  const whole = (t: string) => Math.trunc(parseNumber(t));
  const settled = value ? value.toLocaleString("en-US") : "";
  return (
    <AffixInput {...rest}
      value={draft && whole(draft) === value ? draft : settled}
      onChange={(e) => { const t = formatDollarsInput(e.target.value); setDraft(t); onValueChange(Math.min(max, whole(t))); }}
      onBlur={(e) => { setDraft(""); onBlur?.(e); }} />
  );
}

// src/app/page.tsx:728-748, keeping id, prefix, inputMode, autoComplete, aria-describedby and placeholder
<WholeDollarInput id="income" ... value={profile.income} onValueChange={(n) => setProfile((p) => ({ ...p, income: n }))} />

// src/components/ranking/RankingPanel.tsx:237-249, same props kept
<WholeDollarInput id="extra" ... value={extra} max={EXTRA_MAX} onValueChange={onExtraChange} />

// src/components/ranking/RankingPanel.tsx:98, so an extra of 12.5 saved by the old field shows as 12 everywhere
const extra = Math.max(0, Math.min(EXTRA_MAX, Math.trunc(profile.extraPerMonth || 0)));

Then delete formatWholeDollars (src/lib/utils.ts:112-117), which has no other callers, drop it and parseNumber from the imports at page.tsx:47 and RankingPanel.tsx:23 and :28, and swap AffixInput for WholeDollarInput in both files' ui imports.

## Severity

Borrowers who type or paste income with cents, as it appears on a W-2 or pay stub, are priced on 100 times their income, and in 78 of 208 tested goal, employer and income combinations the top pick switches to a normal-looking wrong plan, such as Standard $311 instead of IBR $0. It needs a decimal point (an iPhone number pad has none) and the inflated income shows in the field, so it is a harm to a recognizable group rather than P0.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 8 of 8 skeptic votes across 3 filings (reproduce, standards and impact; the ux filing had reproduce and standards only); 6 rated P1 and 2 rated P2.

<details><summary>Dissent and notes</summary>

Severity: the impact skeptic on resilience-decimal-income-extra and the reproduce skeptic on ux-income-cents-100x (which kept that filing's P2) rate it P2: the inflated income is visible in the field beside the pick, retyping fixes it, the card says 'Rough answers are fine', income never reaches snapshots or exports, and an iPhone keypad cannot type a point. The standards skeptic on ux-income-cents-100x raised that filing to P1, and the reproduce skeptic on money-dollar-fields-strip-decimal said P0 is arguable for a nonprofit borrower going for forgiveness, whose hero shows Standard $311 instead of RAP $217 with nothing that looks off. Fix: no filed fix survived as written. The two useEffect versions break the $5,000 cap (typing 50000 shows 50,000 while the engine uses $5,000, and pasting 7,500 at the cap shows 7,500) and add react-hooks/exhaustive-deps warnings to a build that has none, and the cents-keeping one leaves the headline at '$13' while the field says 12.50. ux-income-cents-100x's split-at-the-dot change fixes paste only, because the controlled field still drops a typed point (typed 52000.75 still ends at 5,200,075 and typed 12.50 still gives 1,250). money-dollar-fields-strip-decimal asked for 12.50 to stay 12.50; this report chose whole dollars instead (see notes). ux-income-cents-100x's 'Extra 7500 silently becomes 5,000' is the deliberate cap, with field and headline agreeing, so a 'Capped at $5,000' hint is optional. Citation: the skeptics found README.md:187-188 is about the loan form, not these fields. Impact wording: '100x' holds for the income only (RAP about 200x, IBR 1.33x, Standard and Graduated unchanged), and 'far below the field' is wrong for the hero, which shares the screen with the field.

Chosen fix: the truncating, derived-draft field the ux-income-cents-100x skeptics built and tested, with the cap moved into the component. Whole dollars rather than cents because every figure on the page is shown in whole dollars, so nothing else has to change; keeping cents would also need a cents-aware headline at RankingPanel.tsx:131, :181 and :211 and in the chart legend at PayoffRunway.tsx:151. If the author prefers cents, the money-dollar-fields-strip-decimal skeptics' DollarInput with that headline helper is also tested (field, stored value and headline 12.50, 12.5 and '$12.50 extra', cap held, verify.mjs 180 of 180, First Load unchanged at 125 kB). inputMode stays numeric: a whole-dollar field needs no decimal key, and an iPhone user who cannot type the point loses nothing. Side effects seen on the tested variants: a lone typed 0 stays visible as '0' (shipped blanks it, and plans still treat 0 as no income, calc.ts:228); a point typed inside an existing number truncates it (a point after '52' in 52,000 gives 52); dropping cents changes a RAP figure only inside a sub-$1 window at a bracket edge ($50,000.49 priced at $208 with cents kept, $167 at $50,000). Incomes already saved as 5,200,050 stay wrong until retyped. Collision: the MONEY-09 ($0 income) fix rewrites the same onChange at page.tsx:734-747 around formatWholeDollars, which strips the point and would bring this bug back, and it adds an incomeKnown flag so a typed 0 is kept. Land the two together: let WholeDollarInput also report whether the text holds a digit (onValueChange(n, /\d/.test(t))), set income and incomeKnown from that at #income, and show '0' instead of a blank when incomeKnown is true; keep formatWholeDollars until that merge is done. Not tested: real iOS or Android keyboards, Safari and Firefox; how many borrowers enter cents cannot be measured here.

</details>

Merged from audit findings: `money-dollar-fields-strip-decimal`, `resilience-decimal-income-extra`, `ux-income-cents-100x`.
