# AGENT-01: Read-only WebMCP calculator tools (optional)

**P3** · effort M · Agentic friendliness

The app offers no read-only WebMCP tools, so a browser agent helping a borrower has to work the forms to get plan and payoff figures; this is optional for now, since stable Chrome does not expose WebMCP yet.

| | |
|---|---|
| Who it hurts | No borrower is hurt today: a borrower's WebMCP-capable agent can already drive the screen and read the same figures, and a clean stable Chrome has no API to call, so tools would only let that agent get exact plan and payoff figures in one call without typing into the loan form. |
| Standard | WebMCP Draft Community Group Report, 2 November 2026, which states it is not on the W3C Standards Track; the declarative form attributes are not in its text. Chrome's Intent to Experiment lists an origin trial from M149 to M156 and shipping at M157, with 'No signal' from Gecko and WebKit. No WCAG or regulatory requirement applies. |
| Where | Whole page, every state and viewport, local build and live deployment, but only in browsers that expose WebMCP: Chrome for Testing 150 with no flag; stable Chrome 156.0.8078.76 only with --enable-experimental-web-platform-features; Chrome 146 and 147 only behind a flag. Chrome 131 and a clean stable Chrome 156 have no API. Nothing in src registers tools; the registration effect would sit right after the hydration effect at src/app/page.tsx:139-149. |
| Code | [`src/app/page.tsx:139-149`](../../src/app/page.tsx#L139-L149), [`src/components/plans/PlansPanel.tsx:153`](../../src/components/plans/PlansPanel.tsx#L153), [`src/lib/calc.ts:620-628`](../../src/lib/calc.ts#L620-L628), [`src/lib/ranking.ts:170`](../../src/lib/ranking.ts#L170), [`src/components/loans/LoanForm.tsx:221-226`](../../src/components/loans/LoanForm.tsx#L221-L226), [`README.md:154-158`](../../README.md#L154-L158) |
| Test | `seo-agentic.spec.mjs`: "AGENT-01 a browser agent can list read-only Loan Desk tools for plan and payoff figures" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. Draft materials for the fix are in [`fixes/AGENT-01/`](../fixes/AGENT-01/). |

## Measured

Today: aiReadinessScore 0, /.well-known/mcp.json returns 404, and toolname, registerTool and modelContext have 0 matches in the live HTML, all 7 JS files and src. API by browser, clean profiles: Chrome 131 none, even with the flag; Chrome 146 only with a flag, navigator.modelContext with clearContext, provideContext, registerTool and unregisterTool; Chrome 147 only with a flag, navigator with registerTool and unregisterTool; Chrome for Testing 150 with no flag, document and navigator (the same object) with executeTool, getTools, ontoolchange and registerTool; stable Chrome 156.0.8078.76 with no flag none, and with --enable-experimental-web-platform-features document.modelContext only, adding ontoolactivated and ontoolcancel. The filer's draft (estimate_repayment_plans and estimate_payoff) on a scratch copy of the repo: getTools lists both with readOnlyHint true; $166.67, March 2031, 40 months and $1,469.69 against the screen's $167, March 2031, 3 years 4 months and about $1,470, and a hand amortization using no app code gives the same; 11 further plan and portfolio pairs match the screen (for example the eight example loans on Standard with $100 extra: $310.83, November 2033, 37 months and $3,077.03 against $311, November 2033, 3 years 1 month and about $3,080). Storage unchanged, a saved sentinel loan absent from the output, 0 off-origin requests, and a rate of 0.0653 and a year of 0026 refused. Chrome for Testing 150 accepts only a JSON-string argument; stable 156 with the flag takes an object. Chrome 131 makes 11 requests with and without the draft, with no errors, and a clean stable 156 fetches no tools chunk. Cost: the tools chunk is 4,220 bytes (1,917 at gzip -9) and loads only where the API exists, but the always-loaded page chunk grows from 101,571 to 104,528 bytes (28,717 to 29,413 gzip) against an unmodified control build, for every visitor. Gaps in the draft: householdSize 999 is accepted and returns IBR $0 and RAP $10, and the date 2024-13-45 is accepted, because Chrome does not enforce inputSchema; Graduated's monthlyPayment (138.60 on the eight-loan set) has no 'to start' qualifier while the screen says 'Per month, to start'; Graduated's debt-free date is May 2041 on a 10-year plan, on both tool and screen. Declarative <form toolname> on the loan form: on the shipped build it registers with no parameters (3 of 3 runs in each of two browsers); on a build with field names the schema descriptions equal the labels, the inputs fill (12,000) and storage stays [] until Save, but the call stays pending in 6 of 6 runs, rejects with 'Tool execution cancelled, since tool definition was updated' when 'Add more detail' opens during the call (1 of 1), and after Save rejects because the site called preventDefault() on submit without respondWith() (2 of 2).

## Required

Nothing today. If tools are added: feature-detected with document.modelContext tried first, nothing fetched or run when the API is absent, numbers taken only from the agent, no read of saved loans and no storage writes, no request off the page, every input validated in code because the browser does not enforce inputSchema, and Graduated's figure labelled as a starting payment, as the screen does. Do not add /.well-known/mcp.json: there is no server to point at, and a real endpoint would receive loan data. Do not chase aiReadinessScore: the check states it cannot see tools registered from bundled JS.

## Reproduce

1. Open http://localhost:3100 (or https://cense-loan-desk.vercel.app/) in a clean stable Chrome, open DevTools and run document.modelContext ?? navigator.modelContext in the console: undefined, so there is nothing for an agent to call there today.
2. Open the same page in Chrome for Testing 150, where the API is on by default, and run (await document.modelContext.getTools()).map((t) => t.name). No Loan Desk tool can be listed: a Sources-panel search for registerTool, modelContext or toolname finds nothing in the page's HTML or JS.
3. Open /.well-known/mcp.json on either host: 404, which is correct for this app.
4. To compare the draft with the screen: click 'Look around with example loans', open the Plans tab, choose Standard as your plan, open Payoff and set the extra payment to $100. The screen reads $311 a month required, debt free in November 2033, 3 years 1 month sooner, about $3,080 less interest; the draft's estimate_payoff returns $310.83, November 2033, 37 months and $3,077.03.
Probes.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "AGENT-01"`.

## Fix

Nothing to ship today. Revisit when Chrome ships WebMCP (listed for M157; until then a clean stable Chrome has no API and this code would do nothing), and after MONEY-04 and MONEY-06, because the tools call the same estimatePlans and projectPayoff and would repeat those figures to an agent. Then copy the draft in `audits/fixes/AGENT-01/webmcp.ts` to src/lib/webmcp.ts with four changes.

1. Register it right after the hydration effect (src/app/page.tsx:149). The draft's registerLoanDeskTools already tries document.modelContext before navigator.modelContext; keep that order, since stable 156 has only the document one.
```tsx
// Tools for a browser agent, only where the browser has the API. See lib/webmcp.ts.
useEffect(() => {
  const d = document as unknown as { modelContext?: unknown };
  const n = navigator as unknown as { modelContext?: unknown };
  if (!d.modelContext && !n.modelContext) return;
  const ac = new AbortController();
  import("@/lib/webmcp").then((m) => m.registerLoanDeskTools(ac.signal)).catch(() => {});
  return () => ac.abort();
}, []);
```

2. Validate in code, because the browser does not enforce inputSchema:
```ts
// toProfile (i is the input); then use hh for householdSize
const hh = i.householdSize == null ? 1 : Number(i.householdSize);
if (!Number.isInteger(hh) || hh < 1 || hh > 12) throw new Error("householdSize must be a whole number from 1 to 12");
// toLoans, after the yyyy-mm-dd regex (i is the index)
const d = new Date(`${disbursementDate}T00:00:00Z`);
if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== disbursementDate)
  throw new Error(`loans[${i}].disbursementDate is not a real date`);
```

3. Label Graduated the way PlansPanel.tsx:153 does ('Per month, to start'), in the plans map of estimate_repayment_plans:
```ts
...(e.id === "graduated"
  ? { startingMonthlyPayment: e.monthlyPayment, paymentStepsUp: true }
  : { monthlyPayment: e.monthlyPayment }),
```

4. In estimate_payoff, drop the non-null assertions and answer when there is no projection (projectPayoff returns null for a $0 required payment, ranking.ts:170), as RankingPanel does:
```ts
const base = projectPayoff(loans, "avalanche", required, 0);
const main = projectPayoff(loans, "avalanche", required, extra);
if (!base || !main) return reply({ requiredPayment: required, extraPerMonth: extra, reachesZero: false, debtFree: null });
```

Cost: a 1.9 KB gzip chunk fetched only where the API exists, plus about 0.7 KB gzip in the page chunk for every visitor. No new dependency, no request off the page, no storage read or write; the tools take numbers only from the agent, so nothing the borrower saved reaches it. Leave out the declarative <form toolname> and /.well-known/mcp.json.

## Severity

No borrower is affected today: a clean stable Chrome 156 has no WebMCP API, so tools would reach only the rare borrower running a flagged or test Chrome build with a WebMCP agent, and that agent can already read the same figures from the screen. It is an early, optional improvement with no wrong figure and no blocked journey.

## Verification

Confirmed by 1 of 1 skeptic (P3 review lens): API detection re-measured in five Chrome builds, the draft's figures checked against the screen and a hand amortization, and the declarative route probed; P3 kept.

<details><summary>Dissent and notes</summary>

None on the finding or on P3. The skeptic corrected the filing in six places, all adopted here. 'On by default' holds only for Chrome for Testing 150: a clean stable Chrome 156 has no API, so the draft reaches no stable user until the M157 ship target or an origin-trial token, neither of which the filing mentioned (the skeptic adds that it cannot rule out server-side field trials on a real profile). 'No cost when the API is absent' is not met, since about 0.7 KB gzip lands in the page chunk for everyone. The draft validates loans only, and Chrome does not enforce inputSchema. Graduated's figure lacks 'to start'. Detection must prefer document.modelContext, and tests must pass an object on 156 and a JSON string on 150. The declarative outcomes the filer read as run-to-run variation have causes: the call is pending while it waits for the person's submit, is cancelled when the form's fields change, and rejects after Save because LoanForm.tsx:224 calls preventDefault() with no respondWith(); 'hold' stays right, for that reason rather than 'the spec does not define it'. The filer's secondary source saying no mainstream agent consumes tools yet stays unverified; the skeptic found nothing naming a consumer either way, so it carries no weight here. The skeptic re-measured the score engine's three inputs rather than rerunning it.

Fix choice: one member, so the fix is the skeptic's corrected version (hold, then adopt the filer's draft with document.modelContext preferred, full input validation, Graduated labelled as a starting payment, and the cost stated honestly). Two additions of mine. (1) Sequencing after MONEY-04 and MONEY-06: the tools call the same engine, and the skeptic saw the Graduated debt-free date (May 2041 on a 10-year plan) on both tool and screen. MONEY-06's fix passes the plan's schedule into the Payoff engine as an optional last argument, so the tool must pass it the way the Payoff tab does or it keeps the flat projection. If the tools ship before MONEY-06, refuse plan 'graduated' in estimate_payoff. (2) The null guard in estimate_payoff: from reading the draft against src/lib/ranking.ts:170 and src/lib/calc.ts:627, then one check with the compiled engine, an income low enough that IBR's payment is $0 makes requiredPaymentForPlan return 0 and projectPayoff return null, so the draft's non-null assertions throw and the call fails instead of answering. No skeptic reviewed this addition. The declarative <form toolname> route stays out: on the shipped build it registers with no parameters because the loan form's inputs have no name attributes, and even with names the call waits on the person's submit and rejects after Save. Leave /.well-known/mcp.json at 404. Byte figures: the tools chunk is 1,917 bytes at gzip -9 (skeptic) and 1,893 at default gzip (bundle-sizes.json); the page-chunk growth (2,957 bytes raw, 696 gzip) comes from the skeptic's control build and is not saved to a file. Effort M assumes the draft is reused; the time goes into validation, the Graduated fields and a test across the two API shapes. Neither tie-break drop (seo-title-description-miss-intent, agentic-no-structured-data-or-discovery) is a member of this issue.

</details>

Merged from audit findings: `agentic-webmcp-tools`.
