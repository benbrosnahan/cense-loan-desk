# RES-04: "Clear my data" leaves income and records behind

**P1** · effort S · Data safety and resilience

'Clear my data' says it removes the borrower's data, but it never clears their income or plan answers and, when 'Clear every loan' is pressed first, keeps every dated loan record while hiding every control that could remove it, so the next person on that browser sees it all and gets payments priced on someone else's income.

| | |
|---|---|
| Who it hurts | A borrower who presses Clear my data on a shared or family browser is told their data is gone while their income, employer type, chosen plan and, if they pressed the red button first, every dated loan row stay readable to the next person, whose own monthly payment and debt-free date are then priced on those leftovers. |
| Standard | None external. The app's own promise under the heading 'Clear my data' at src/app/page.tsx:659-660 ('This removes the data from this browser. It was never anywhere else.') and PRIVACY_NOTE at src/data/plans.ts:285. The ux filing also cites Nielsen H1 (visibility of system status) and H3 (user control and freedom). |
| Where | Loans tab > Keep a copy > Clear my data at every width (reproduced at 320, 375, 390, 412, 768, 1024, 1280 and 1440 px), then the empty first-run screen, then the next person's Plans, Payoff and Records on the same browser profile. Local production build and the live deployment, which ships the same handler. |
| Code | [`src/app/page.tsx:261`](../../src/app/page.tsx#L261), [`src/app/page.tsx:268`](../../src/app/page.tsx#L268), [`src/app/page.tsx:644`](../../src/app/page.tsx#L644), [`src/app/page.tsx:646`](../../src/app/page.tsx#L646), [`src/app/page.tsx:659`](../../src/app/page.tsx#L659), [`src/app/page.tsx:305`](../../src/app/page.tsx#L305), [`src/app/page.tsx:368`](../../src/app/page.tsx#L368), [`src/app/page.tsx:509`](../../src/app/page.tsx#L509) |
| Test | `data-safety.spec.mjs`: "RES-04 after "Clear my data" nothing of the borrower is left for the next person on that browser" |
| Fix proof | Validated: [`fixes/RES-04.patch`](../fixes/RES-04.patch). 'Clear my data' now leads with 'Erase everything', which resets loans, saved records, income and every other answer, and the hide-amounts flag, to exactly what a first visit stores, closes any open loan form and forgets the last servicer, with one Undo that restores all of it. When answers or records remain with no loans, the first-run screen says so and offers 'Erase them', and the copy under the buttons says what each removes and that downloaded spreadsheets are separate. An independent review found it sound, with the notes below. |
| Before applying | Until a working cross-tab re-read lands, tell the borrower that other open tabs keep their copy until reloaded, because their next save brings the data back. With a re-read, make Erase's Undo merge with anything saved since. If RES-05 lands, name the backup file beside the spreadsheet in the erase copy. |
| Overlaps | Changes the same lines as [`fixes/RES-03.patch`](../fixes/RES-03.patch). Each patch was proven on its own, so after applying one, apply the next with `git apply --3way`, merge the conflicts by hand, and re-run both tests. |

## Measured

Copy under both buttons (page.tsx:659-660): 'This removes the data from this browser. It was never anywhere else.' After 'Clear every loan', 8 s and a reload, with the fixture seeded once: loans [], but 2 snapshots holding 16 loan rows in 3,385 characters (3,417 UTF-8 bytes) with 8 nicknames, Nelnet and MOHELA, balances and rates, and a profile of income 52000, employment nonprofit, goal least_total, extraPerMonth 100, selectedPlan standard. The same residue appears with nothing seeded and every value typed through the UI (income 61250, nonprofit, plan rap and 2 snapshots naming 'Zed private loan' and MOHELA in one run; income 52000, household 3 and one snapshot of $12,345.67 in another), at every width tested, and after a real browser exit. sessionStorage, cookies, IndexedDB, Cache Storage and service workers are empty, so localStorage holds all of it. The first-run screen then offers only Skip to content, Add my first loan, Look around with example loans, studentaid.gov and Cense: the section bar (page.tsx:509) and the tab content holding every clear control (page.tsx:544) render only while loans exist. 'Clear every loan' unmounts 'Clear saved records', even during the Undo window; pressing records first, then loans, gives snapshots 0 with the profile unchanged. No clear control touches the profile: by hand it takes 12 actions through the example loans and selectedPlan still stays, because the UI only ever sets it (page.tsx:784 and 814; RankingPanel.tsx:363 lists eligible plans only). Next person, one tap on 'Look around with example loans': the tab bar reads 'Records 2', Plans shows income 52,000, Records shows totals $28,101 and $28,246 and a change row $2,256 to $2,401, and its download's 'All loan rows' sheet holds 16 rows naming the earlier loans with servicer, balance and rate. Next person entering their own $20,000 loan and answering nothing: the summary reads 'across 1 loan · $217 a month on RAP' and Payoff 'Paying $100 extra a month, you are debt free in May 2033, 4 years 2 months sooner, with about $3,150 less interest'; a fresh browser shows no monthly figure and withholds the payoff. With a prior income of $90,000 and RAP, the same loan reads '$600 a month on RAP'. In memory: with a loan's Edit form open during the clear, 'Look around with example loans' reopens 'Edit this loan' at 3,500 / 4.99 / Nelnet / 2022-09-01, and 'Save changes' writes the erased loan back over the examples; a servicer saved this session (MOHELA) stays preselected in the next 'Add my first loan' form until a reload. Live: page-eae479cdacf15b74.js differs from the local chunk in 6 of 101,571 bytes (the webpack module id) and holds the same handler a([]),b("loans"),q("All loans cleared",...); one live run left loans 0, income 52000 and snapshots 2.

## Required

After the erase action and a reload, localStorage equals what a first visit writes (loans [], snapshots [], profile equal to DEFAULT_PROFILE, hide flag 0), and nothing typed survives in memory: no loan form reopens and the servicer is back to 'Not sure yet'. Undo restores all four keys byte for byte. The copy says what is removed and that downloaded files are separate. Whenever answers or records remain while there are no loans, the first-run screen offers a control that removes them. Removing the keys outright is the wrong bar: the effects at page.tsx:151-167 rewrite all four on every load, and a first visit writes the same four at their defaults.

## Reproduce

1. Open http://localhost:3100 in a fresh private window and tap 'Add my first loan'. Pick a school year (it fills the date and rate), type 12345 in 'What you owe on it today', choose MOHELA under 'Who do you pay?', and tap 'Save loan'.
2. Open Plans, type 52000 in 'Yearly income, before tax', set 'People in your household' to 3, choose Nonprofit, and tap 'Use ... as my plan' on the top pick.
3. Open Records and tap 'Save today's snapshot'.
4. Open Loans, scroll to 'Keep a copy', open 'Clear my data' (it reads 'This removes the data from this browser. It was never anywhere else.') and tap 'Clear every loan'; 'Clear saved records' disappears with the loans.
5. Wait 8 seconds for the Undo toast to go, then reload: the screen offers only 'Add my first loan' and 'Look around with example loans', with no clear control and no Records tab.
6. In DevTools > Application > Local Storage, cense.loandesk.profile.v2 still holds income 52000, household 3, nonprofit and the chosen plan, and cense.loandesk.snapshots.v1 still holds the loan row with MOHELA and 12345.
7. As the next person, tap 'Look around with example loans': the tab bar shows 'Records 1' and Plans shows 52,000. Or add a fresh $20,000 loan instead: the summary at once shows a monthly figure on a plan this person never chose.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-04"`.

## Fix

All in src/app/page.tsx, no new dependency.
1. Replace clearLoans (261-266) and keep clearSnapshots (268-272):
const eraseAll = () => {
  const before = { loans, snapshots, profile, hideAmounts };
  setLoans([]);
  setSnapshots([]);
  setProfile(DEFAULT_PROFILE);
  setHideAmounts(false);
  // In memory too: an open form would bring an erased loan back, and the
  // next "Add my first loan" would pre-fill the last servicer.
  setEditing(null);
  setAdding(false);
  setFormDefaults({});
  setTab("loans");
  say("Everything erased", {
    label: "Undo",
    run: () => {
      setLoans(before.loans);
      setSnapshots(before.snapshots);
      setProfile(before.profile);
      setHideAmounts(before.hideAmounts);
    },
  });
};
2. In the Clear my data disclosure (645-661) the danger button becomes <Button size="sm" variant="danger" onClick={eraseAll}>Erase everything</Button>; the ghost button keeps onClick={clearSnapshots} and disabled={!snapshots.length} with the label 'Clear saved records only'; the copy at 659-660 becomes 'Erase everything removes your loans, saved records, income and other answers from this browser. None of it was ever on a server. A spreadsheet or backup file you downloaded is separate, so delete that yourself.'
3. After const empty (305):
const leftovers =
  snapshots.length > 0 ||
  (Object.keys(DEFAULT_PROFILE) as (keyof Profile)[]).some(
    (k) => profile[k] !== DEFAULT_PROFILE[k]
  );
4. On the first-run screen, between the start buttons (which end at 382) and {adding ? ( at 384:
{!adding && leftovers && (
  <p className="mt-4 text-sm leading-relaxed text-slate-700">
    Answers or saved records from an earlier visit are still in this browser.{" "}
    <button
      type="button"
      onClick={eraseAll}
      className="min-h-[40px] font-semibold text-navy underline underline-offset-2 hover:text-navy-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
    >
      Erase them
    </button>
  </p>
)}
This line also reaches people who removed every loan by hand or already used the old button. DEFAULT_PROFILE and Profile are already imported (page.tsx:12 and 21). Measured on the skeptics' scratch builds of this shape: the store after erase is byte-identical to a fresh visit, Undo restores all four keys including a hidden-amounts flag, no form reopens, the servicer resets to 'Not sure yet', the line appears for all 8 leftover cases and not for a fresh visitor, and the control is 40 px tall at 320 px with no overflow.

## Severity

Every use of the app's only deletion control fails on its privacy promise, and on a shared or family browser profile the next borrower inherits the previous person's income, plan and $100 extra, so a $20,000 loan they enter shows '$217 a month on RAP' and a May 2033 debt-free date where a fresh browser shows neither. Wrong figures confined to that uncommon environment are P1; not P0, because nothing leaves the device, the clearer's own figures are right, and the inherited answers are visible on Plans and Payoff.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 12 of 12 skeptics across 4 filings (reproduce, standards and impact on each), with hand-typed data and no seeding, at widths from 320 to 1440 px, and against the live bundle; they split 6 to 6 between P1 and P2.

<details><summary>Dissent and notes</summary>

Severity split 6 to 6. P1: the reproduce skeptics on all four filings and the impact skeptics on the bp and ux filings, on a broken key journey that fails every time on the product's privacy promise. P2: the standards skeptics on all four filings and the impact skeptics on the dx and resilience filings, because harm needs a second person on the same browser profile, reach cannot be measured without analytics, no name or account number is stored, and the control sits in a collapsed disclosure. This report keeps P1 under the stricter rubric on the measured wrong figures for that second person, not on head-count. Wording corrections adopted: '3,385 bytes' is 3,385 characters (3,417 UTF-8 bytes); page.tsx:433 gates only the summary, while the Records tab and clear controls sit behind 509 and 544; 'no way left to remove them' and 'no control erases income at all' are false as absolutes, since loading the example loans brings 'Clear saved records' back and blanking the income field stores 0, but nothing on screen points to that detour and selectedPlan can never return to null; 'every saved record' holds only when 'Clear every loan' is pressed first; 'the only order that reaches both' is wrong (loans, examples, records, loans also works and still keeps the profile); 'removes all four keys' cannot hold because the effects rewrite them; the first-run card does say 'What you type is saved in this browser', and what is missing is any sign that earlier data remains; 'employer' is a four-option category, not a name. Fix corrections: every filed fix left editing, adding and formDefaults set; the ux and resilience fixes replaced both buttons, which removes the only records-only clear, and reset hide-amounts without restoring it on Undo; the ux gate tested income > 0 only and missed household, employer, goal, plan and extra leftovers; the bp line's inline 'Clear them' link measured 73 by 23 px, under the README's 40 px floor.

Fix choice: one erase action plus the existing records-only button, the shape the ux, resilience and dx skeptics converged on and built, rather than replacing both buttons, because Records has no per-record delete and example-loan snapshots can outlive the examples (resilience example-and-clear.log E7). Dropping the bulk loans-only clear is a deliberate trade: per-row Remove still keeps dated records and the first-run line then catches what is left; if the author wants it back, keep a ghost 'Clear loans only' and give clearLoans the same three form resets. Hide-amounts is reset so the store matches a first visit and is restored by Undo, but it does not trigger the first-run line because it is a display preference, not borrower data. Coordinate with A11Y-04: if action toasts lose their timer, this toast must keep its 7-second limit or move to a confirm, because a lingering Undo lets the next person restore everything (measured: 45 s later the next person's Undo brought back 8 loans, 2 snapshots and income 52000). Not covered: a second open tab keeps its in-memory copy and one change there writes it back (measured on every build), which needs RES-02's storage-event listener. If RES-07 ships `${key}.quarantine` copies, eraseAll must remove them too. The copy says 'browser', not 'device', to agree with RES-06, and names downloaded files because RES-05 adds a backup file. Skeptics' builds of this shape passed tsc and next build, verify.mjs 180 of 180, with the route at 37.4 kB against 37.2 kB.

</details>

Merged from audit findings: `bp-clear-data-leaves-income-and-records`, `ux-clear-my-data-keeps-income-and-records`, `dx-clear-my-data-incomplete`, `resilience-clear-my-data-residue`.
