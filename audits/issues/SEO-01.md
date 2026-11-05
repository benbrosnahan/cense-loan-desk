# SEO-01: Server HTML is empty: prerender the first-run screen

**P1** · effort M · SEO and findability

The page's HTML has no body text until all its JavaScript runs, so AI assistants that read raw HTML get only the title and description, no page on the site gives any crawler the repayment rules, and a first-time borrower on a slow phone waits about 0.9s longer than necessary to read anything.

| | |
|---|---|
| Who it hurts | Borrowers who ask an AI assistant about the tool, or about a rule it handles such as whether one new loan closes IBR, get answers that cannot draw on or point to Loan Desk, and every first-time visitor on a slow phone sees about 1.5s of blank page and then 0.9 to 1.2s of wordless grey bars before learning what the page is; people already using the app are not affected. |
| Standard | Google Search Central, JavaScript SEO basics: not all bots can run JavaScript, so server-side rendering or prerendering is recommended (a recommendation, not a rule; Googlebot itself renders). Vercel/MERJ, 'The rise of the AI crawler' (2024-12-17, secondary source): GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot and PerplexityBot do not execute JavaScript. Core Web Vitals LCP 'good' line of 2.5s, used here only as a lab yardstick. No WCAG rule applies. |
| Where | First visit to / with no saved loans, at every viewport: the raw server response on http://localhost:3100 and https://cense-loan-desk.vercel.app, and the first paint on cold, slow phone connections (warm cache and returning visitors are not the problem). The rules exist only in the Plans tab after loans are saved. Cause: the early return at src/app/page.tsx:294-303. |
| Code | [`src/app/page.tsx:294-303`](../../src/app/page.tsx#L294-L303), [`src/app/page.tsx:131`](../../src/app/page.tsx#L131), [`src/app/page.tsx:151-167`](../../src/app/page.tsx#L151-L167), [`src/app/page.tsx:356-430`](../../src/app/page.tsx#L356-L430), [`src/app/page.tsx:357`](../../src/app/page.tsx#L357), [`src/app/page.tsx:370-380`](../../src/app/page.tsx#L370-L380), [`src/app/page.tsx:394-428`](../../src/app/page.tsx#L394-L428), [`src/app/page.tsx:839-859`](../../src/app/page.tsx#L839-L859) |
| Test | `seo-agentic.spec.mjs`: "SEO-01 a reader that runs no JavaScript gets the first-run screen and can follow links to the repayment rules" |
| Fix proof | Partial (first step only): [`fixes/SEO-01.patch`](../fixes/SEO-01.patch). Removes the early return that served only a loading skeleton, so the static HTML of / is now the first-run screen for every crawler, and for a first visit before the scripts load. A small inline script in <head> marks browsers that have saved loans, and CSS shows those borrowers the old loading bars until hydration, so they never see the first-run screen flash. The two first-run buttons stay disabled until the saved data has been read, and the JavaScript notice moves under them. Still to do: the issue's Step 2, a plain page such as /repayment-plans, linked from /, that states the rules (the July 1, 2026 cutoff, RAP, Tiered Standard, IBR, PSLF and Parent PLUS). Write it after the money P0s are fixed, so it does not repeat their errors. An independent review found it sound, with the notes below. |
| Before applying | It relies on the narrowed 'no HTML injection' guard in audits/tests/repo.spec.mjs, which this PR includes. Step 2, the /repayment-plans guide, is still needed before crawlers see any plan rule. |
| Overlaps | Changes the same lines as [`fixes/RES-05.patch`](../fixes/RES-05.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Server response: the raw HTML of / is 7,320 bytes on localhost:3100 and on live, identical apart from hashed names and buildId. Outside <noscript> it has 0 words, 0 headings, 0 <a href> and 0 buttons; the only body text is the 13-word notice 'Loan Desk needs JavaScript to run. Please enable it in your browser settings.' The head does carry the title, a 30-word meta description, 3 og: tags and 3 twitter: tags. Plain curl and the GPTBot, ClaudeBot, PerplexityBot, Googlebot and Slackbot user agents get byte-identical HTML (live hash 0f0c7983487b1523). A WebFetch of live returned the title only. GEO scan: contentParity 0, ssrWordCount 0, csrWordCount 236, serverContent 12/30. A rendering crawler (Googlebot smartphone at 412px) does see the first run: 249 words, H1 'Loan Desk', H2 'Every loan you have, on one screen.', and links to #main, studentaid.gov and cense.beehiiv.com. The cause is the early return at page.tsx:294-303: a scratch build that removes only that serves 253 words, 1 H1 and 3 anchors, and / stays static.

Rules: of the 11 facts the tool exists to get right (listed under required), raw HTML states 0 and the rendered first run states 1 (privacy); a build with only the gate removed still states 1. RAP, Repayment Assistance Plan, Tiered Standard, 'July 1, 2026', PSLF, Public Service Loan Forgiveness, IBR, Parent PLUS and calculator each appear 0 times in raw HTML and in the rendered first visit. They appear only after loans are saved and the Plans tab button is pressed (at 412px: RAP 3, Tiered Standard 2, July 1, 2026 2, IBR 3) and in the page's JavaScript chunk (RAP 13, Tiered Standard 9, July 1, 2026 12, PSLF 6). /repayment-plans, /plans, /rap, /robots.txt and /sitemap.xml return 404.

Speed: with Lighthouse's slow-4G values applied for real (562.5ms latency, 1.47 Mbps) plus 4x CPU, cold first visit at 412x823: first paint at 1,504-1,520ms shows only two pale grey bars; first text (FCP equals LCP) arrives at 2,376-2,408ms behind a local HTTP/2 front (median 2,384, 6 runs), 2,488-2,496ms on live (about 10ms under the 2.5s LCP line) and 2,616-2,636ms on :3100 over HTTP/1.1; the hero is fully visible at 2,601-2,869ms. No script runs long; the wait is the HTML, the CSS, then every JavaScript chunk. Lighthouse reads perf 99, SEO 100 and a simulated FCP of 753ms local and 779ms live, and gives the same FCP 752ms and LCP 2,252ms on the fixed build, so it can show neither the problem nor the gain. Timings come from a shared, noisy machine; frame and pass counts are the firmer evidence.

## Required

Body text, one H1 and real links in the server response of /, identical for every visitor and crawler, with no user-agent or server logic and / still static, and readable text at first paint for a first-time visitor. Measured on a scratch build of Step 1: 253 words (255 by a plain tag strip, 236 by raw textContent), 1 H1, 3 anchors, GEO parity 100 and serverContent 28/30, with / static at 37.3 kB and First Load JS 125 kB.

And, at a URL reached by a plain <a href>, server HTML that states the 11 facts the tool exists to get right: (1) one loan disbursed on or after July 1, 2026 closes Standard, Graduated, Extended and IBR for the whole portfolio, leaving RAP and Tiered Standard; (2) a new loan or a consolidation triggers that, and it runs one way; (3) Tiered Standard earns no PSLF credit in any tier; (4) the Tiered Standard terms and its $50 minimum; (5) the RAP formula; (6) the RAP interest waiver and principal match; (7) the IBR terms (10% above 150% of poverty and 20 years, or 15% and 25 years with loans from before July 2014); (8) Parent PLUS loans cannot use IBR or RAP; (9) no late fees, credit reporting at 90 days and default at 270 days; (10) the GAO servicer-accuracy finding; (11) no account, no server, nothing transmitted. A scratch build of both steps scores 11/11 on the corrected fact test (today 0/11), with the guide statically generated at 87.5 kB First Load JS.

## Reproduce

1. In a private window, open view-source:https://cense-loan-desk.vercel.app/ and search for 'Every loan you have': no match. The body holds only the noscript line and script tags: no <h1>, no <a href>.
2. In a terminal, curl -s https://cense-loan-desk.vercel.app/ | shasum and curl -s -A GPTBot https://cense-loan-desk.vercel.app/ | shasum print the same hash (ClaudeBot too).
3. In DevTools, run Command Menu > Disable JavaScript and reload: the notice plus grey bars that never resolve. Turn JavaScript back on.
4. Still in the private window (no saved loans): Network > Disable cache with a custom throttling profile of about 1,474 kbit/s down and 562 ms latency, Performance > CPU 4x slowdown, phone width, then reload. About 1.5s of blank cream, then two grey bars with no words, then the headline at about 2.4 to 2.5s.
5. On the first-run screen, use Find for RAP, Tiered Standard, PSLF and 'July 1, 2026': 0 hits. Click 'Look around with example loans': still 0. Click Plans: RAP, Tiered Standard and the cutoff appear, on the same URL, reached only by buttons. /repayment-plans, /robots.txt and /sitemap.xml return 404.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEO-01"`.

## Fix

Step 1: server-render the first-run screen. This closes the empty-HTML and slow-first-paint defects. Every edit below was built and checked in scratch builds, never in the repo.

src/lib/storage.ts:9
export const LOANS_KEY = "cense.loandesk.loans.v1";

src/app/layout.tsx (the noscript at lines 48-53 moves into page.tsx)
import { LOANS_KEY } from "@/lib/storage";
// Reads one key before first paint and sends nothing; the wrapper keeps the loan JSON off window.
const RETURNING_SCRIPT = `(function(){try{var l=localStorage.getItem(${JSON.stringify(LOANS_KEY)});if(l&&l!=="[]")document.documentElement.setAttribute("data-returning","")}catch(e){}})()`;
...
<html lang="en" suppressHydrationWarning>
  <head><script dangerouslySetInnerHTML={{ __html: RETURNING_SCRIPT }} /></head>

src/app/globals.css, outside any @layer:
.returning-skeleton{display:none}
html[data-returning] .returning-skeleton{display:block}
html[data-returning] .prerendered{display:none}

src/app/page.tsx: delete the early return at 294-303 but keep the hydrated state, because it guards the saves at 151-167 (without it, every load briefly writes [] over saved loans and snapshots). Wrap the returned JSX in a fragment:
<>
  {!hydrated && (
    <div aria-hidden className="returning-skeleton min-h-screen bg-page">{/* today's two pulsing bars */}</div>
  )}
  <main className={cn("min-h-screen bg-page pb-28", hideAmounts && "amounts-hidden", !hydrated && "prerendered")}>
    ...
    <Button disabled={!hydrated} onClick={startAdding}>Add my first loan</Button>
    <Button variant="secondary" disabled={!hydrated} onClick={...}>Look around with example loans</Button>
    ...
    <noscript><p className="mt-4 text-sm text-slate-700">Adding loans needs JavaScript. Please enable it in your browser settings.</p></noscript>
    ...
  </main>
</>

Measured on that build: the server response has 253 words, 1 H1 ('Loan Desk'; the hero stays H2) and 3 anchors in about 12.7 kB (gzip 2,391 to 4,251 bytes); / stays static at 37.3 kB with First Load JS 125 kB. First visit at 4x CPU, 1.6 Mbps and 150ms: FCP 1,464 to 556ms, hero fully visible 1,677 to 781ms, skeleton never shown. Returning visitor with 8 loans: first-run copy in 0 of about 145 sampled frames, dashboard 1,439 to 1,449ms (flat), loans byte-identical after reload, and [] never written. Stored [], corrupt JSON, null and blocked storage all end on the first-run screen with 0 errors; Clear every loan lands on the first-run screen; next dev logs 0 hydration warnings; window.l is undefined; and the example button showed 0 false 'Example loans loaded' toasts in 8 runs (8 of 8 without the disabled prop).

Costs to accept: the first-run buttons show at half opacity until hydration (about 870ms on the lab profile, about 3.7s at 6x CPU and 0.4 Mbps, about 20ms unthrottled), but they never start working later than today. Text now paints before the web fonts arrive, so at 320 and 360px wide the primary button moves about 30px roughly 200ms after the hero appears; the layout-shift API reads 0 because .rise masks it, and unmasked it measures about 0.017, under the 0.1 line.

Step 2: publish the rules. Step 1 alone leaves every plan term at 0, because the first-run copy names no plan. Add src/app/repayment-plans/page.tsx as a static server component with no client state and no user data, and link it with a plain <a href="/repayment-plans"> inside the !adding branch (page.tsx:394-428) and in the footer (page.tsx:839-859); next/link raised the First Load JS of / from 125 to 133-134 kB. State the 11 facts under required, sharing constants with the app so the two cannot silently diverge: POST_CUTOFF_WARNING (plans.ts:269-270) with the Parent PLUS sentence from plans.ts:257-258; the one-way rule, moved from PlansPanel.tsx:441-449 into a plans.ts constant both pages render; the $50 minimum from TIERED_STANDARD_MIN_PAYMENT (plans.ts:40), which no UI copy states today; each plan's PSLF status (Tiered Standard never, calc.ts:391-414); NO_LATE_FEES_NOTE; the GAO sentence, moved from HistoryPanel.tsx:59-61 into a constant; and PRIVACY_NOTE. Write fresh copy rather than printing PLAN_META pros and cons, PARENT_PLUS_NOTE or NOT_ADVICE verbatim: they describe figures the guide does not show, and several are wrong (MONEY-16). Add a visible byline and the date the author last checked the rules, and set metadataBase (SEO-02) so the guide's canonical is absolute.

## Severity

The rubric puts core content invisible to AI crawlers at P1, and that is measured on every request: the ChatGPT, Claude and Perplexity fetchers get 0 body words, and even Google's rendering crawler finds none of the plan rules anywhere on the site. No current user sees a wrong number; the cost falls on borrowers who never find the tool (unmeasurable here without analytics), plus about 0.9s of extra blank wait for every first-time visitor on a slow phone.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 11 of 11 skeptic votes across 4 members (standards, reproduce, impact); 5 votes kept P1 and 6 placed their member at P2.

<details><summary>Dissent and notes</summary>

Severity: 6 of 11 votes put their member at P2. The impact skeptics on seo-server-html-empty and agentic-crawlers-get-no-rules, and the standards and impact skeptics on seo-borrower-terms-uncrawlable, argued that Google renders JavaScript and already sees the first-run text, that no current user gets a wrong answer, that the same rule questions get correct, cited answers elsewhere, and that reach was never measured and cannot be without analytics. perf-skeleton-gate's two skeptics held P2 for the speed part alone, since live LCP is about 10ms under 2.5s. It stays P1 because this rubric names core content invisible to AI crawlers, which is measured on every request.

Corrections adopted from the skeptics: non-rendering readers get the title and head metadata, not only a JavaScript notice; link unfurlers are out of the impact, because they read head tags this fix does not change (the missing image is SEO-02); 303 words, 5 anchors, 16,136 bytes and 38 kB describe the whole seo-fix.patch, not the fix (253, 3, about 12.7 kB, 37.3 kB); the prototype guide states 6 of the 11 facts, not 8, because the original regexes matched across list items and matched $50,000, and adding the three facts first named reaches 9, not 11; its GEO 92 and 98 also relied on structured-data work the audit did not confirm, and Step 1 plus the guide alone measure 60 and 62; 'a rule cannot drift' was false, since the draft guide's cutoff paragraph and PSLF lines are hand-written; the rules are readable in the public GitHub repo, so the gap is this deployment, not the whole web; 'ICR 0 in every state' fails with a Parent PLUS loan; 'CLS 0.0000 in every run' came from a probe bug (desc() in perf-load.mjs throws on text-node shift sources), and perf-skeleton-gate's variant measures 0.0478 at 375x812; Lighthouse's 753ms FCP comes from leaving low-priority async chunks out of its simulation, not from simulating the skeleton; and the 0.9s figure is a lab result, with about 3.7s on a very slow profile and no real phone measured.

Fix choice: two members built the gate removal in different shapes. perf-skeleton-gate hides a permanent .first-run class under html[data-returning], so it must remove the attribute after hydration (its own first draft left a borrower who cleared every loan on a blank page) and must hide the header and footer separately. seo-server-html-empty hides only while !hydrated, so the attribute can stay and that trap cannot occur, with fewer CSS rules; three skeptics built and checked it independently. That version is used, with the impact skeptic's two changes: the function wrapper (otherwise window.l holds the raw loan JSON, 1,623 characters for 8 loans, for the page's lifetime) and disabled={!hydrated} (it closes an 8ms window in which 'Look around with example loans' shows its toast but loads nothing, and shows the buttons are not ready yet). Optional from perf-skeleton-gate: drop rise from the first-run div at page.tsx:357 so the hero is fully visible at first paint (LCP 1,508-1,532ms on slow 4G in that build), which also exposes the font-swap shift to CLS. Apply these pieces, not seo-fix.patch whole: that patch also rewrites the title and H1 and adds pushState hash routing, JSON-LD, a manifest and a not-found page, which need their own review.

Effort: Step 1 alone is S (under an hour from the verified patch plus the two changes); Step 2's copy review is what makes this M. Ship Step 2 after MONEY-16 and the money P0s, because the guide sends new borrowers to those figures. src/app/sitemap.ts and src/app/robots.ts are optional for two URLs and harmless. Off-repo, minutes: the newsletter posts at https://cense.beehiiv.com/p/if-student-loans-made-cense and https://cense.beehiiv.com/p/trump-student-loans-6ce51a988ba8972e already explain RAP, Tiered Standard and PSLF in crawlable HTML but have 0 links to Loan Desk.

Before publishing Step 2: cite 91 FR 23835 (Tiered Standard payments cannot count for PSLF) and 91 FR 23847 (IBR closes on receipt of a Direct Loan on or after July 1, 2026); word the RAP principal match as the lesser of $50 or the payment made (34 CFR 685.209(o)(2)(i)); and since 34 CFR 685.202(d)(1) says the Secretary 'may' require a late charge, consider 'does not charge late fees today' on a public page.

Related: RES-13 (endless skeleton when scripts fail). After Step 1 a first-time visitor keeps the copy, but if the chunks never load the buttons stay disabled with no message. Step 1 passes the audit's candidate CSP (script-src 'self' 'unsafe-inline') with 0 violations, adds no dependency and puts no user data in the HTML. Not tested: real phones, iOS Safari (no WebKit on the machine), real crawler IP ranges, any real LLM retrieving or citing the site, Google index status, and whether OpenAI's crawlers render JavaScript in 2026 (one unconfirmed post says they began; a rendering crawler still gets 1 of 11 facts today).

</details>

Merged from audit findings: `seo-server-html-empty`, `agentic-crawlers-get-no-rules`, `seo-borrower-terms-uncrawlable`, `perf-skeleton-gate`.
