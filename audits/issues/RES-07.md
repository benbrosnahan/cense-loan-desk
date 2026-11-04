# RES-07: Malformed storage locks the borrower out

**P2** · effort M · Data safety and resilience

With no check on saved data and no error boundary, a malformed stored loan or snapshot leaves the borrower on an 'Application error' page with no controls on every visit, with their loans still stored but unreachable, and saved values that cannot be parsed are silently erased.

| | |
|---|---|
| Who it hurts | A borrower whose saved data was changed from outside the app (today a hand edit or an extension; later, a release that changes the stored shape without a new key) opens the app to a page with no controls on every visit, usually on a phone with no developer tools, while their loans sit unreachable in storage; the only exit, clearing site data, erases them, and values that cannot be parsed are erased on the next load without a word. |
| Standard | none |
| Where | App load and the Records tab, at every width (measured at 412x823 and 375x812 in Chromium and WebKit, and once on the live site), whenever cense.loandesk.loans.v1, cense.loandesk.snapshots.v1 or cense.loandesk.profile.v2 holds a shape the app does not write itself. The erasing happens in the save effects that run right after load. src/app holds only globals.css, icon.svg, layout.tsx and page.tsx, so with no error.tsx any render error, whatever its cause, replaces the whole page with Next's default 'Application error' text. |
| Code | [`src/lib/storage.ts:15-25`](../../src/lib/storage.ts#L15-L25), [`src/app/page.tsx:151-159`](../../src/app/page.tsx#L151-L159), [`src/lib/storage.ts:37-40`](../../src/lib/storage.ts#L37-L40), [`src/lib/storage.ts:53`](../../src/lib/storage.ts#L53), [`src/lib/storage.ts:45-48`](../../src/lib/storage.ts#L45-L48), [`src/lib/calc.ts:29`](../../src/lib/calc.ts#L29), [`src/app/page.tsx:182`](../../src/app/page.tsx#L182), [`src/app/page.tsx:82`](../../src/app/page.tsx#L82) |
| Test | `data-safety.spec.mjs`: "RES-07 one unreadable saved loan does not lock the borrower out of the loans that are fine" |

## Measured

Crash on load that survives every reload and a new tab, at 412x823 and 375x812, in Chromium and WebKit, and on the live site for [null + 8 good]: the page shows only 'Application error: a client-side exception has occurred (see the browser console for more information).' with 0 controls, while the stored value stays byte-identical (1,628 chars for [null + 8 good]). Shapes that do this: loans [null] and [null + 8 good] (first throw calc.ts:29, reading 'balance'); [{}] (page.tsx:82, reading 'startsWith'); a rate stored as text (utils.ts:31, 'toFixed is not a function'); a missing disbursementDate at 7 of 8 row positions, every one but row 0 (LoanList.tsx:30, localeCompare); a missing or numeric id at row 0 only (page.tsx:82; at rows 1 to 7 all 8 rows list and every tab works); snapshots stored as JSON null once any loan exists (page.tsx:533). A sweep of 160 single-field mutations gave 23 crashes on load. Records-only crashes: snapshots stored as an object, a snapshot with no loans, missing takenAt (order dependent) and [null]. Reload plus 'Clear saved records' recovers all but the object case, where the button is disabled (page.tsx:653, because {}.length is undefined) and Records stays broken. Erased on load with no copy kept: loans that are not valid JSON (700 chars to '[]'), loans stored as an object (1,633 chars to '[]'), snapshots that are not valid JSON (400 chars to '[]'), and a profile that is not valid JSON (30 chars) or is JSON null (4 chars), both replaced by the 106-char defaults. Wrong output with no crash: two balances stored as text, '3500' and '2396', show YOU OWE $35,002,396 (numeric control $5,896); a missing balance shows $0; householdSize 99 shows the select at 'Just me' and $10 a month on RAP (control $217); a stored negative income shows as -50,000 in the income field; extra 'abc' gives 'This payment does not clear the balance' (control 'Debt free in December 2036'). The live root segment reports "error":"$undefined". The only way out is clearing site data in browser settings, which brings back the first-run screen with loans [] and snapshots []. Reach: storage.ts has only the first commit (9c4c145) and the Loan and Snapshot interfaces are unchanged; 93 form-reachable combinations (load, 4 tabs, rows, edit, 2 snapshots, reload) and 47 shape-valid combinations gave 0 crashes; a setItem that fails at the real quota leaves the old value byte-identical. One trigger needs no bad data: with page translation simulated (text nodes wrapped in <font>), 2 of 9 journeys, the first 'Save today's snapshot' and Grad PLUS after a school-year chip, reach the same screen with NotFoundError on removeChild, and a reload recovers (RES-12).

## Required

Rows that cannot be read are set aside and every good row still shows, with a notice that stays until the borrower downloads or deletes the set-aside copy. Nothing that cannot be read is overwritten before a copy is kept. Any render error shows a screen with Try again and a Start fresh that sets data aside rather than deleting it. Clear my data still removes everything, copies included, as page.tsx:659 promises ('This removes the data from this browser').

## Reproduce

1. Open http://localhost:3100 in a fresh window and click 'Look around with example loans' (8 loans, YOU OWE $28,101).
2. Lockout: in DevTools > Console run
   const k = 'cense.loandesk.loans.v1'; localStorage.setItem(k, JSON.stringify([null, ...JSON.parse(localStorage.getItem(k))]));
   then reload. The page shows only 'Application error: a client-side exception has occurred (see the browser console for more information).' with no controls, on every reload and in a new tab, while the key still holds all 8 loans. The only way out is clearing site data in the browser's settings, which empties everything.
3. Erasing: start again from step 1, run
   const k = 'cense.loandesk.loans.v1'; localStorage.setItem(k, '{"list":' + localStorage.getItem(k) + '}');
   and reload. The first-run screen appears and the key now holds [].
4. Records dead end: start again from step 1, run localStorage.setItem('cense.loandesk.snapshots.v1', '{}'), reload and open Records: 'Application error'. Reload, open Keep a copy > Clear my data: 'Clear saved records' is disabled, so Records stays broken.
5. Wrong figure with no crash: start again from step 1, open Plans, type 52000 as income and click 'Use RAP as my plan' (the summary says $217 a month on RAP). Then run
   const k = 'cense.loandesk.profile.v2'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), householdSize: 99 }));
   and reload: the household select shows 'Just me' and the summary says $10 a month on RAP.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-07"`.

## Fix

Ship in this order. Nothing leaves the device and no dependency is added.

1. Add src/app/error.tsx first. It is the part with reach today, because it also catches render errors on clean data (RES-12). global-error.tsx is not needed because layout.tsx is static.
```tsx
"use client";
import { Button } from "@/components/shared/ui";
import { quarantineStore } from "@/lib/storage";

export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-slate-900">Something went wrong</h1>
      <p className="mt-3 text-base text-slate-700">Your saved data is still in this browser. Try again first. Starting fresh sets your data aside; it does not delete it.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={quarantineStore.download}>Download my saved data</Button>
        <Button variant="secondary" onClick={() => { quarantineStore.moveLiveDataAside(); window.location.reload(); }}>Start fresh</Button>
      </div>
    </main>
  );
}
```

2. In src/lib/storage.ts, check rows on load, keep the good ones, and copy the raw string to `${key}.quarantine` before the save effects (page.tsx:151-159) can overwrite it:
```ts
const isLoan = (l: any): l is Loan =>
  !!l && typeof l.id === "string" && typeof l.nickname === "string" &&
  typeof l.servicer === "string" && typeof l.disbursementDate === "string" &&
  Number.isFinite(l.balance) && Number.isFinite(l.rate) && Number.isFinite(l.principal);
const isSnapshot = (s: any): s is Snapshot =>
  !!s && typeof s.takenAt === "string" && Array.isArray(s.loans) &&
  s.loans.every(isLoan) && Number.isFinite(s.totalBalance);

function setAside(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) window.localStorage.setItem(`${key}.quarantine`, raw);
  } catch {}
}
// read(): give JSON.parse its own try/catch that calls setAside(key) before returning the fallback.

function readList<T>(key: string, ok: (v: unknown) => v is T): T[] | null {
  const v = read<unknown>(key, null);
  if (v === null) return null; // nothing stored, JSON null, or unparseable (already set aside)
  const rows = Array.isArray(v) ? v.filter(ok) : [];
  if (!Array.isArray(v) || rows.length < v.length) setAside(key);
  return rows;
}
// loanStore.load = () => readList(LOANS_KEY, isLoan)
// snapshotStore.load = () => readList(SNAPSHOTS_KEY, isSnapshot) ?? []
```
Check the date only as a string: the form saves 20260-09-01 and that row works today. In profileStore.load (storage.ts:45-48), clamp after the merge: income and extraPerMonth to finite numbers of at least 0, householdSize to a whole number from 1 to 8. Export a small quarantineStore from storage.ts with any(), clear(), moveLiveDataAside() (copy each live key to its .quarantine key, then remove the live key) and download() (a Blob of every cense.loandesk.* key and an a[download], as export.ts:80-92 does).

3. In page.tsx, set a flag from quarantineStore.any() in the load effect (page.tsx:139-149) and render a Notice at the top of #main, so it also shows on the first-run screen, for as long as a copy exists: 'Some saved data could not be read. It is left out of this page, so your totals may be low. A copy is still in this browser and nowhere else.' with 'Download the copy' and 'Delete the copy'.

4. Make Clear every loan and Clear saved records (page.tsx:261 and :268) also remove the .quarantine copies, so 'This removes the data from this browser' (page.tsx:659) stays true.

## Severity

No path in the shipped app writes these shapes (storage.ts and the Loan and Snapshot types are unchanged since the first commit, and 93 form-reachable combinations produced none), so today the lockout and the erasing reach only a borrower whose storage was changed from outside the app, or returning borrowers after a future release that changes the stored shape without bumping the key. It is P2 rather than P3 because the missing error boundary also turns any other render error, such as the machine-translation crash in RES-12, into the same dead screen.

## Verification

Confirmed by 5 of 5 skeptics across 2 filings (reproduce, standards and impact on the resilience filing; standards and reproduce on the dx filing), in Chromium and WebKit and once on the live site; 4 set P2 and 1 set P3, and all 5 corrected the fix.

<details><summary>Dissent and notes</summary>

Severity: the resilience filing said P1; all three of its skeptics lowered it to P2 because no shipped path writes these shapes. On the dx filing the standards skeptic rated it P3 (hardening of a state the app cannot produce, with the key-bump convention at storage.ts:10-11 covering schema changes) and the reproduce skeptic kept P2. The impact skeptic holds P2 only because of the translator trigger, which was simulated, and calls the rest P3. Fix: every skeptic corrected the filed fixes. The filed date test /^\d{4}-\d{2}-\d{2}$/ drops rows the form really saves (20260-09-01, 275760-09-13): one skeptic measured YOU OWE falling from $25,000 to $5,000 after one reload, another the hero falling from $48,101 to $28,101 with the stored snapshots overwritten by []. Two skeptics widen the test to /^\d{4,6}-\d{2}-\d{2}$/ and two check only that the date is a string; this report checks only the type, which is all LoanList.tsx:30 needs and cannot drop a row the form saves. Also measured on the filed fix: the notice was gone after one reload; the copies survived Clear my data (1,628 and 3,390 chars, nicknames readable) against page.tsx:659; a servicer stored as an object still crashed; a snapshot with loans [null] still crashed Records; Start fresh built as deletion left the 8 good loans with no copy. The dx reproduce skeptic wants the notice to have its own Dismiss with a separate seen flag; the impact skeptic makes 'Delete the copy' the way to dismiss it, which this report uses so the notice cannot vanish while totals are still short. Evidence corrections: 'one malformed stored loan' holds for a null row, a rate stored as text, a missing date outside row 0 and a bad id at row 0, but a missing or numeric id at rows 1 to 7 loads normally, because isExample's every() stops at the first id that is not seed-; reload plus Clear saved records recovers 3 of the 4 Records-only cases, not snapshots stored as an object; missing takenAt is order dependent; snapshots stored as JSON null crash only once loans exist (with none, 'Look around with example loans' crashes instead); the first throw for [null] is calc.ts:29, not page.tsx:82; 'for good' is too strong, since clearing site data restores the app (empty), and a fixed deploy would restore the data because the crash path never writes it.

Fix choice: the impact skeptic's ordered plan (error screen first, then guards, a notice tied to the copy, and clearing the copies), built in a scratch copy: 31 malformed cases give 0 crashes on load and 0 on any tab, 0 of 17 form-reachable row sets lose a row, the notice survives reloads, Delete the copy and Clear every loan remove the copies, both Download buttons work with no network request (Chromium only), the error screen works in Chromium and WebKit, tsc and next build pass, verify.mjs passes 180 of 180, first-load JS goes from 124,900 to 128,569 bytes gzipped, and the validator takes 0.42 ms at 3,100 snapshots (noisy machine). The totalBalance check in isSnapshot comes from the standards skeptic's corrected build, which was tested separately. Shared work: RES-12 proposes the same src/app/error.tsx as the backstop for machine-translation crashes; land it once, here, and leave the keyed-span fix to RES-12. Coordinate the copy removal with RES-04, which changes what Clear my data removes, and reuse RES-05's backup file for 'Download the copy' if that lands first. A guard is not a migration: keep bumping the key when the stored shape changes (storage.ts:10-11), because tightening the guard alone would send every old row to the copy. The wrong figures from a hand-edited profile ($10 on RAP for householdSize 99, -50,000 income, 'does not clear the balance' for extra 'abc') are fixed by the clamps in step 2.

</details>

Merged from audit findings: `resilience-corrupt-storage-lockout`, `dx-storage-unvalidated`.
