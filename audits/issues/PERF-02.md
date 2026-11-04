# PERF-02: Slider rebuilds Intl formatters and doubles simulations

**P3** · effort S · Performance

Every move of the extra-payment slider builds dozens of new number and date formatters and runs the payoff simulation twice as often as needed, so the slider and the figures under it lag for borrowers with many loans on slow phones.

| | |
|---|---|
| Who it hurts | A borrower with many loans on a cheap phone sees the slider, and the debt-free date and savings it drives, lag behind their finger during a drag; most borrowers would not notice. |
| Standard | None. 16.7ms per frame is the budget for smooth continuous input; INP's 'good' line is 200ms and the worst measured slider interaction is 40ms, so this is smoothness, not a failure. |
| Where | Payoff tab with a repayment plan chosen, while dragging or arrow-keying the slider beside 'Extra each month', at every viewport; the cost grows with the number of loans. On each move money(), monthYearFromNow() and shortMonthYearFromNow() build a new formatter per call (utils.ts:12, :89, :99), and RankingPanel recomputes main and base (RankingPanel.tsx:105, :110) although compareStrategies has just run the same simulation that main needs (ranking.ts:204-205 vs :171) and base only changes when extra crosses $0. |
| Code | [`src/lib/utils.ts:12`](../../src/lib/utils.ts#L12), [`src/lib/utils.ts:88`](../../src/lib/utils.ts#L88), [`src/lib/utils.ts:89`](../../src/lib/utils.ts#L89), [`src/lib/utils.ts:98`](../../src/lib/utils.ts#L98), [`src/lib/utils.ts:99`](../../src/lib/utils.ts#L99), [`src/components/ranking/RankingPanel.tsx:105`](../../src/components/ranking/RankingPanel.tsx#L105), [`src/components/ranking/RankingPanel.tsx:110`](../../src/components/ranking/RankingPanel.tsx#L110), [`src/lib/ranking.ts:171`](../../src/lib/ranking.ts#L171) |
| Test | `perf.spec.mjs`: "PERF-02 with 60 loans on a slow phone, each move of the extra-payment slider fits in one frame and shows the same figures as a fresh page" |

## Measured

Constructor spies on the shipped build, stable over 30 moves: per move 26 new Intl.NumberFormat plus 26 toLocaleDateString calls at 8 loans (52), 44 + 43 at 25 loans, 79 + 78 at 60 loans (157); the fixed build makes 0. V8 coverage: simulate() (ranking.ts:77) runs 4 times per move on shipped and 2 with the fix. CPU profile at 4x: utils.ts is 25.8 to 27.2% of busy time at 8 loans and 33.5 to 34.7% at 60, the largest JavaScript cost, and 2 to 3% after the fix. Main-thread task time per move, shipped -> corrected fix, 3 interleaved reps of keyboard moves: 8 loans 11.7 -> 7.5ms at 4x and 23.4 -> 14.8ms at 8x; 25 loans 16.1 -> 9.7 and 33.4 -> 19.1ms; 60 loans 27.1 -> 13.1 and 53.5 -> 26.9ms (-36% to -52%). Mouse drag at 60 loans, 8x: frames over 33ms 56-61 -> 2-3. The lead's A/B of the filed fix agrees (8 loans 14.5 -> 9.2ms at 4x; 60 loans 61.0 -> 29.3ms at 8x), as does the skeptic's A/B of it (-34% to -53%). Worst slider interaction in the collected inp.json at 60 loans, 4x: 40 and 32ms. Timings come from a shared, noisy machine; the interleaved deltas held across reps and changes in machine load.

## Required

Each move fits one 16.7ms frame on a low-end phone at realistic loan counts, with the same text on screen. The corrected fix meets the frame budget at 4x through 60 loans (13.1ms) and at 8x for 8 loans (14.8ms). Text parity: the filed fix matched the shipped page in 168 of 168 combinations (3 portfolios including a $0-required case and a post-cutoff case, 7 plan values, extras 0/25/100/5000, both payoff orders) and in an 11-step live slider and toggle sequence; the corrected fix matched in 167 of 168 on the first pass, the one difference being a harness race on the shipped side that matched in 8 of 8 rechecks, and in 11 of 11 live steps. Month labels must not change when the time zone changes with the tab open.

## Reproduce

1. Open http://localhost:3100 in Chrome and click 'Look around with example loans' (8 loans).
2. Open the Plans tab and click 'Use Standard as my plan'.
3. Open the Payoff tab.
4. In DevTools Performance set CPU to 4x slowdown, start recording, and drag the slider beside 'Extra each month' from $0 toward $500 (or focus it and press the Right arrow ten times).
5. Each input task takes about 12 to 15ms; the profile shows money(), monthYearFromNow() and shortMonthYearFromNow() in utils.ts, building formatters, as the largest JavaScript cost, and simulate() running under both compareStrategies and projectPayoff (V8 coverage counts 4 runs per move). With 60 loans (seeded by the probes) each move takes about 27 to 32ms at 4x.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "PERF-02"`.

## Fix

Two changes, measured together as the corrected fix.

1. src/components/ranking/RankingPanel.tsx, replacing lines 105-116: reuse the simulation compareStrategies already ran, and recompute base only when extra crosses $0.
const main = comparison ? comparison[strategy] : null;
const hasExtra = extra > 0;
const base = useMemo(
  () => (required !== null && hasExtra ? projectPayoff(loans, strategy, required, 0) : null),
  [loans, strategy, required, hasExtra]
);
This is safe for the money: compareStrategies (ranking.ts:204-205) and projectPayoff (ranking.ts:171) call the same simulate() with the same clamped arguments behind the same null guard, and PayoffProjection is SimOutcome (ranking.ts:157).

2. src/lib/utils.ts: build each formatter once, on first use, and date the 15th instead of the 1st, so a formatter built before a time zone change still names the right month.
let usd: Intl.NumberFormat | undefined;
let monthYear: Intl.DateTimeFormat | undefined;
let shortMonthYear: Intl.DateTimeFormat | undefined;

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  usd ??= new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return usd.format(n);
}

export function monthYearFromNow(months: number, from: Date = new Date()): string {
  if (!isFinite(months) || months < 0) return "—";
  const d = new Date(from.getFullYear(), from.getMonth() + Math.round(months), 15);
  monthYear ??= new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  return monthYear.format(d);
}
// shortMonthYearFromNow (utils.ts:93-100): the same, with shortMonthYear and month: "short".

Leave moneyCents as it is (it has no callers, so it is tree-shaken) or delete it; do not add a module-level cents formatter. The build compiles ??= down to a null check, and lint and type checks pass.

## Severity

Only borrowers with many loans on slow phones feel it: at 4x CPU slowdown 8 loans fit a frame today (11.7 to 14.5ms per move) while 60 loans take 27 to 32ms, INP stays far under 200ms (worst slider interaction 40ms), and every figure stays correct, so this is smoothness polish.

## Verification

Confirmed by 1 of 1 skeptic (reproduce); severity unchanged at P3, fix corrected by the skeptic.

<details><summary>Dissent and notes</summary>

The skeptic confirmed the defect and P3 but rejected the filed utils.ts change as written. (1) Module-level Intl.DateTimeFormat objects keep the time zone they were built in, and the helpers format local midnight on the 1st, so after a time zone change eastward with the tab open (New York to London, Los Angeles to Tokyo, Honolulu to Auckland) every month label reads one month early: 'You would finish in November 2033' became 'October 2033' and 'Gone by Aug 2028' became 'Jul 2028'. Shipped code does not drift, so the filed claim of identical output fails in this case. (2) Building all four formatters at import adds +25.5ms of main-thread task time and +16ms LCP at 4x on a cold first run, on a screen that formats nothing today. (3) USD_CENTS pulls the unused moneyCents back into the page chunk (101,621 -> 101,732 B); utils.ts:21 is not part of the problem. Also corrected: the date construction lines are utils.ts:88 and :98; the test needs a toLocaleDateString spy; and the lead's '59 -> 3 frames' depends on a 33.4ms cut-off (at 33.0ms the skeptic's drags count 64-70 -> 16-20, because many frames land exactly on two vsyncs). The fix above is the skeptic's corrected version, which the skeptic built and measured.

Fix choice: the skeptic's corrected utils.ts change over the filed module-level constants, because it keeps the same slider saving (-36% to -52%) without the time zone drift, the first-run cost or the extra bytes: it builds 0 formatters on the first-run screen (first-run A/B task time +1.7ms, LCP -8ms, within noise), 0 per move, and kept its labels in all 4 time zone changes. The RankingPanel change is the lead's, unchanged; it is what halves the simulate() runs. Out of scope: calc.ts:480 has its own per-call money() used by plan ranking on the Plans tab; the fixed build counts 0 NumberFormat constructions per slider move, so it is not on this path.

</details>

Merged from audit findings: `perf-intl-formatters`.
