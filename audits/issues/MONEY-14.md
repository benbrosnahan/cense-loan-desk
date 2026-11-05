# MONEY-14: IBR $5 and $10 rounding rule missing

**P2** · effort S · Money figures and eligibility

IBR skips the federal rule that turns a payment under $5 into $0 and one from $5 to $10 into $10, so borrowers earning just above 150% of the poverty line see an IBR figure up to $5 a month off.

| | |
|---|---|
| Who it hurts | A low-income borrower just above 150% of the poverty line sees an IBR payment up to $5 a month off, either a small bill where the servicer will bill $0 or $5 to $9 where it will bill $10, with the 20-year total off by up to $1,200. |
| Standard | 34 CFR 685.209(g)(1)(iii)(A) and (B) |
| Where | Repayment plans tab: the IBR card's monthly figure and 20-year total, and the required payment Payoff uses once IBR is chosen. Any viewport, local build and live site. Pre-July-2026 portfolios with income $1 to $1,199 above 150% of the poverty line for the household size (household 1: $23,941 to $25,139; household 4: $49,501 to $50,699), plus small balances where the 10-year Standard cap puts the payment under $10. |
| Code | [`src/lib/calc.ts:437`](../../src/lib/calc.ts#L437), [`src/lib/calc.ts:199`](../../src/lib/calc.ts#L199), [`verify.mjs:269`](../../verify.mjs#L269) |
| Test | `money-edges.spec.mjs`: "MONEY-14 IBR applies the $5 and $10 rule: a calculated payment under $5 is $0 and one from $5 to $10 is $10" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

$40,000 balance, household 1: income $24,000 app $0.50 (shown '$1'), rule $0; $24,539 app $4.99 (shown '$5'), rule $0; $24,540 app $5.00 (shown '$5'), rule $10; $24,900 app $8.00 (shown '$8'), rule $10; from $25,140 up they match. Household 4 at $50,400: app $7.50 (shown '$8'), rule $10. Sweeping income by $1 for households 1 to 6, the app differs from the rule on the $1,199 of income directly above 150% of poverty at each size, worst gap $5.00 a month; across households 1 to 12, 14,388 of 17,052 near-band incomes differ. The card's 20-year total moves with it: $1,200 shown against $2,400 under the rule at $24,540, and $1,198 against $0 at $24,539. Where the 10-year cap binds, the capped amount also skips the rule: $500 at 6% with income $24,900 shows $5.55 where the rule gives $10. No top pick or badge changed across 51,840 in-band scenarios. Same figures on localhost:3100, seeded and typed, and on one live load ($8 at $24,900). No (g)(1) handling or note exists in src, verify.mjs or README.md.

## Required

34 CFR 685.209(g)(1)(iii): when the monthly amount calculated under (f)(1) through (3) (for new-borrower IBR, (f)(2): the lesser of 10% of discretionary income divided by 12 and the 10-year Standard payment) is (A) less than $5, the payment is $0; (B) $5 or more but less than $10, the payment is $10.

## Reproduce

1. Open http://localhost:3100 with no saved data.
2. Your loans > Add a loan: tap 2022-23, put 40000 in 'What you owe on it today' and 6.53 in 'Interest rate', then Save loan.
3. Open Repayment plans and set 'Yearly income, before tax' to 24540 and 'People in your household' to 1.
4. The IBR card reads 'Per month $5' and 'In total, over 20 yr $1,200'; the rule gives $10 and $2,400.
5. Change income to 24000: the card shows $1 (rule $0). Income 24900: $8 (rule $10). Household 4 with income 50400: $8 (rule $10).

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "MONEY-14"`.

## Fix

Apply the rule to the capped (f)(2) amount at src/lib/calc.ts:437 and leave ibrMonthly (calc.ts:199) alone:

const cap = amortizedPayment(balance, rate, 10);
// 34 CFR 685.209(g)(1)(iii) adjusts the (f)(2) lesser-of amount:
// under $5 is $0; $5 up to $10 is $10.
const capped = Math.min(ibrMonthly(profile), cap);
const pay = capped < 5 ? 0 : capped < 10 ? 10 : capped;

The band edges compute exactly in floating point (the raw amount is 5 at $600 and 10 at $1,200 above the line), so no tolerance is needed. Tested on a scratch copy: 0 mismatches on the 17,052-income sweep and on the 59,143-cell small-balance grid, verify.mjs 180 of 180. Land it with or after MONEY-03 and together with MONEY-10 (see notes).

## Severity

Only borrowers whose income is within $1,199 above 150% of the poverty line for their household size are affected (for one person, $23,941 to $25,139), though every time they look. The gap is at most $5 a month ($1,200 over 20 years) and changed no top pick or badge across 51,840 in-band scenarios, so it is a real but bounded wrong figure.

## Verification

Confirmed by 2 of 2 skeptics (standards, reproduce); both kept P2.

<details><summary>Dissent and notes</summary>

Fix placement: the standards skeptic moved the rule after the 10-year cap because (g)(1)(iii) adjusts the (f)(2) lesser-of amount, and showed that the filed version (inside ibrMonthly at calc.ts:199) stays wrong where the cap binds, in 9,360 of 59,143 small-balance grid cells with balances up to $1,025. The reproduce skeptic would keep the filed placement and leave capped amounts to the $50-floor work, because with today's unfloored cap the after-cap version turns a $300 balance's $3.33 into $0, when the true cap, the 10-year Standard payment, is at least $50 under 685.208(b)(1)(ii). This issue follows the standards correction; see notes for the sequencing that removes the reproduce skeptic's case. Severity: both skeptics noted that the audit brief's P0 line literally covers any wrong dollar figure, and both kept P2 because the gap is capped at $5 a month and changes no recommendation.

Why after the cap: it is the order the regulation states, it is the same one-line size, and once MONEY-03 changes calc.ts:436 to the $50-floored 10-year Standard payment the cap is at least $50 (or the whole remaining balance), so rounding before or after it gives the same payment and the $300 case resolves to the rule's answer. Ship this with or after MONEY-03 so no small balance shows $0 in between. Ship it together with MONEY-10: the fix turns raw payments under $5 into $0, and today a $0 IBR payment makes compareStrategies return null, so Payoff shows the 'Pick a repayment plan' card with IBR already selected (RankingPanel.tsx:154); the fix widens that by $600 of income at each household size. MONEY-13 edits the same line; combined, the first line reads const capped = Math.min(ibrMonthly(profile, ibrShare), cap);. The filing's impact line understated one thing: the 20-year total on the card is off by up to $1,200, not only the monthly figure.

</details>

Merged from audit findings: `money-ibr-5-10-band`.
