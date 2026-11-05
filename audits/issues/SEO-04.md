# SEO-04: Cense site nav links the superseded tools

**P2** · effort S · SEO and findability

The Cense newsletter's site-wide Resources menu links the older Loan Lab quiz and never Loan Desk, so readers looking for a repayment tool reach Loan Desk only if they finish a six-step quiz and scroll to the bottom of its results.

| | |
|---|---|
| Who it hurts | Newsletter readers who use the Resources menu to find a student-loan repayment tool land on the older Loan Lab quiz and see Loan Desk only if they finish all six steps and scroll to the bottom, and the newest student-loan posts do not mention it, so the tool the author now maintains reaches fewer of the borrowers it was built for. |
| Standard | None. This is internal linking on a site the author controls; no standard is cited or failed. |
| Where | cense.beehiiv.com, the Resources menu in the site-wide header (desktop and mobile copies, any viewport), on all 11 sampled pages of the 108 sitemap URLs and on the 4 more pages with a menu that were checked, plus the body of /t/student-loans and of /p/choosing-your-student-loan-repayment-plan-shouldn-t-be-hard. Off-repo: nothing in this repository changes. In the repo, README.md:8-10 records that Loan Desk supersedes both older tools, src/types/index.ts:5-6 limits Loan Desk to four federal loan kinds, and the footer already links back to the newsletter (src/app/page.tsx:849). |
| Code | [`README.md:8-10`](../../README.md#L8-L10), [`src/types/index.ts:5-6`](../../src/types/index.ts#L5-L6), [`src/app/page.tsx:849`](../../src/app/page.tsx#L849) |
| Test | None: see the issue notes. |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

The newsletter sitemap lists 108 URLs. On all 11 sampled pages (home, /t/student-loans, /t/other-loans and 8 on-topic posts) the header's Resources menu has one raw anchor to loan-lab.vercel.app/results, labelled 'Repayment Recommender: See which student loan repayment plan works best for you', and one to cense-debt-dashboard.vercel.app; the rendered page holds a desktop and a mobile copy of each. Loan Desk is not in the menu. Loan Desk anchors: 2 on /p/how-to-manage-multiple-loans (published 2026-08-18, text 'Loan Desk', followed) and 0 on the other 10, including /p/your-loans-are-on-sale (2026-09-22) and /p/choosing-your-student-loan-repayment-plan-shouldn-t-be-hard, whose body links Loan Lab a second time. Four more pages (/t/product-launch, /p/free-app-newsletter-updates, /p/cense-is-evolving, /archive) carry the same menu and 0 Loan Desk anchors; /subscribe has neither. A sweep of 107 of the 108 sitemap URLs (run for SEO-05; /authors is a 404) found Loan Desk linked by those 2 anchors on 1 post and nowhere else. Both old tools return 200 with no canonical. Loan Lab: the menu link opens Step 1 of a six-step quiz; Loan Desk appears only on the federal results screen, as an 'Open Loan Desk' card at y=4108 of a 4424px page, and 0 times in raw HTML, the quiz steps and the private-loans result. Debt Dashboard: 0 Loan Desk mentions; its Type select offers Credit Card (the default), Student Loan, Auto Loan, Mortgage, Personal Loan, Medical and Other, while Loan Desk holds only four federal loan kinds (src/types/index.ts:5-6). README.md:8-10 says Loan Desk 'combines and supersedes' both.

## Required

Loan Desk listed in the site-wide Resources menu with a label that says what it is for, the student-loan topic page and the repayment-plan post linking it, Loan Lab pointing federal borrowers to it, and Debt Dashboard kept for the debts Loan Desk cannot hold.

## Reproduce

1. On a phone or desktop, open https://cense.beehiiv.com/ and open the Resources menu in the header. It lists Invest Ready, Debt Dashboard, Credit Card Recommender, Compare Offers, Repayment Recommender and Decode; Loan Desk is not there.
2. Click Repayment Recommender. It opens loan-lab.vercel.app at 'Step 1 of 6: What kind of student loans do you have?'.
3. Choose 'Federal loans only', then 'All of them came before July 1, 2026', enter 28,000 and 6.5 (the fields' own examples) and Continue, enter 52,000, choose 'Just me' and Continue, then 'Government' and 'Keep payments as low as possible'. Loan Desk appears only in an 'Open Loan Desk' card at the bottom of the results.
4. Open https://cense.beehiiv.com/t/student-loans and /p/choosing-your-student-loan-repayment-plan-shouldn-t-be-hard: neither links Loan Desk, and the post links Loan Lab in its body.
5. Open https://cense-debt-dashboard.vercel.app, click Add Your First Debt and open Type: Credit Card is the default, followed by six other debt types.

## Fix

No change in this repository.
1. Beehiiv header, Resources menu: replace only the 'Repayment Recommender' entry with 'Loan Desk: federal student loan repayment plans', linking https://cense-loan-desk.vercel.app. Keep 'Debt Dashboard': it holds credit cards, auto loans, mortgages, personal, medical and other debts that Loan Desk cannot.
2. Link Loan Desk from /t/student-loans, and repoint or add to the 'Cense Loan Lab' link in the body of the repayment-plan post.
3. Loan Lab: keep its existing results card. If the quiz is being retired, add a one-line notice on Step 1 and keep the private-loans result, which Loan Desk has no equivalent for.
4. Debt Dashboard: add a pointer that shows only when Type is Student Loan, not a 'Replaced by Loan Desk' notice. In its add-debt form, roughly:

{type === "Student Loan" && (
  <p className="mt-2 text-sm">
    Federal student loans?{" "}
    <a href="https://cense-loan-desk.vercel.app">Loan Desk compares your repayment plans.</a>
  </p>
)}

Do not redirect either host. Debt Dashboard says 'All data is stored locally on your device', so a redirect would strand saved debts, and a Loan Lab redirect would drop its private-loans answer.

## Severity

Every newsletter reader who uses the menu to find a student-loan repayment tool is sent to the superseded quiz, on every page checked. Loan Desk itself shows no wrong figure, so this is a meaningful missed opportunity rather than a harm: P2.

## Verification

Confirmed by 2 of 2 skeptics (standards, reproduce); both kept P2 and both rewrote the fix to keep Debt Dashboard.

<details><summary>Dissent and notes</summary>

Fix: the filing lead proposed replacing both menu entries with one Loan Desk entry and labelling Debt Dashboard 'Replaced by Loan Desk'. Both skeptics rejected that: Debt Dashboard's default debt type is Credit Card and it also takes auto, mortgage, personal, medical and other debts, while Loan Desk holds only federal student loans, so the README's 'supersedes' is true only for federal student loans. Facts: the filed 'both old tools mention Loan Desk 0 times' held only for raw HTML; the reproduce skeptic found the 'Open Loan Desk' card on Loan Lab's federal results screen. The filed impact, 'the only links Cense controls back the tools the README calls superseded', overstated it, because the 2026-08-18 post has 2 followed Loan Desk links; the accurate claim is about the site-wide menu. The filed test idea's 'one anchor' holds only for a raw fetch. Severity: no disagreement; the lead and both skeptics rated P2.

Fix choice: the two skeptics independently wrote the same scoped fix; it is adopted with the reproduce skeptic's detail on Loan Lab and the repayment-plan post. Link the bare Loan Desk URL; if links end up UTM-tagged, SEO-05's canonical keeps the tagged variants from competing. Coverage: the menu was checked on 16 of the 108 sitemap URLs (11 sampled, 5 more by the reproduce skeptic); 'site-wide' is inferred from the shared template menu, which matched on every page that has a menu. The Loan Desk link count covers 107 of 108 URLs. Untested hypothesis from the SEO lead's coverage notes, not part of this finding: one 22 KB chunk of Loan Lab's results code has 0 hits for 'Parent PLUS', while Loan Desk excludes Parent PLUS loans from IBR and RAP (README.md:26). If Loan Lab still offers those plans to Parent PLUS borrowers, the menu link sends them to an outdated answer; check this before deciding whether to retire the quiz.

</details>

Merged from audit findings: `seo-newsletter-links-superseded-tools`.
