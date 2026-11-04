# RES-02: A second open tab silently overwrites the first

**P1** · effort S · Data safety and resilience

With the app open in two tabs, a change in the tab that has not reloaded silently overwrites what the other tab saved, so loans, dated records and income are lost.

| | |
|---|---|
| Who it hurts | A borrower with the app open in two tabs who changes anything in the one that has not reloaded silently replaces what the other tab saved: typed loans, income, and dated records that cannot be recreated under their original date. The likeliest path is a second tab still on the first-run screen, which looks as if nothing was saved, so starting over there erases the whole portfolio. |
| Standard | None broken as such: the HTML Standard gives localStorage no cross-tab locking and leaves merging to the page. The harm is the rubric's 'loses their data without being told'. |
| Where | Two tabs of the app in one browser profile, any section and width (measured at 390x844, 412x823 and 1440x900 in Chromium 146, and in WebKit through two WKWebViews sharing one store), on the local production build and on the live site. Code: page.tsx:139-149 reads storage once at load; page.tsx:151-159 write each whole list on every change; src has no storage, visibilitychange or pageshow listener. The Undo closures at page.tsx:257, :265 and :271 restore a copy taken before the other tab's save. |
| Code | [`src/app/page.tsx:139-149`](../../src/app/page.tsx#L139-L149), [`src/app/page.tsx:151-159`](../../src/app/page.tsx#L151-L159), [`src/app/page.tsx:257`](../../src/app/page.tsx#L257), [`src/app/page.tsx:265`](../../src/app/page.tsx#L265), [`src/app/page.tsx:271`](../../src/app/page.tsx#L271), [`src/lib/storage.ts:36-55`](../../src/lib/storage.ts#L36-L55) |
| Test | `data-safety.spec.mjs`: "RES-02 a loan saved in one tab survives a change made in another tab that was already open" |

## Measured

Shipped build, real clicks, Chrome 146:
- Loans: tab A adds a loan (9 stored); tab B still says 'Your 8 loans'; B removes a different loan: 7 stored and A's loan is gone. A shows it until reload, then not. B's only message is its own 'Removed 2022–23 subsidized' toast; neither tab mentions a conflict. With two loans: B adds $7,777 (3 stored), one removal in A leaves 1 stored and the $7,777 loan is gone; Undo in A restores only A's two.
- Records: A saves a snapshot (3 stored), stale B saves one (3 stored): A's dated snapshot is gone. In another run a record saved in the stale tab held 8 loans, $28,101, while storage held 9 loans, $29,335.
- Income: A sets 30000; stale B changes only the goal; storage and A's reload show 52,000.
- First-run tab: with both tabs opened before any data, A enters 3 loans ($13,500) in one run and 4 in another; B, still on the first-run screen, saves one loan and only B's loan is stored (0 of 4 survive; A reloads to $1,000 and $2,000). 'Look around with example loans' in B replaces A's loans with the 8 examples.
- Undo of Remove, Clear every loan and Clear saved records in the stale tab also drops the other tab's save. A tab restored from the back/forward cache behaves the same. Loans cleared in one tab come back after a single change in the other (stored 3500, 2396, 1111).
- Same loss in WebKit (stored 3500, 2396, 7777 becomes 2396) and in one pass on the live site.
- Controls: an idle stale tab, switching sections, opening a row and reloading before acting lose nothing. If A changes a loan again before reloading, A's copy wins and undoes B's removal: last writer wins both ways.
- grep of src and of the local and live page chunks: 0 storage, visibilitychange, pageshow or BroadcastChannel listeners; src has no addEventListener at all.
Filed fixes, built in scratch copies: re-reading on the storage event (and on visibilitychange) stops every loss above, but the tab that re-read then saves what it just read, and while the person types or drags in the other tab that write can land on top of a newer value and roll it back. Wrong final income or slider value with the filed re-read: 8 of 190, 25 of 72, 32 of 72 and 67 of 228 trials across four skeptics' runs; shipped build 0 in every run; builds that never write back a value they read: 0 (0 of 42, 72, 108, 150 and 228). Examples: typed 1,234,567 ended as 123,467; typed 47213 ended as 423. Timing-free count: the hidden tab made 6 profile writes during 6 slow keystrokes in the other tab, against 0 with the guard. A dropped digit matters: income 52,000 rolled back to 5,200 moves RAP from $217 to $10 a month and IBR from $234 to $0. The rates come from a heavily loaded shared machine, partly with CPU throttling, and are not field rates; at low load and full speed the filed fix lost 0 of 80.

## Required

A save in one tab never discards what another tab saved, and a tab never writes back a value it only read from storage. Tab B picks up tab A's change without a reload (on the storage event, or when B becomes visible again), and B's next change keeps it.

## Reproduce

1. Open the app and click 'Look around with example loans' (8 loans).
2. Open the same address in a second tab (B). It shows the same 8 loans.
3. In tab A, click 'Add a loan', enter any loan and click Save loan. A now says 'Your 9 loans'.
4. Switch to tab B without reloading. It still says 'Your 8 loans'. Remove a different loan there.
5. Reload tab A: 7 loans. A's new loan is gone, and neither tab said anything.
First-run variant: open the address in two fresh tabs before entering anything, enter three loans in A, then in B (still on the first-run screen) click 'Add my first loan' and save one. Reload A: only B's loan is left.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-02"`.

## Fix

Re-read storage when another tab writes or this tab comes back, never save back a value that was only read, and make the three Undos merge with what is there now. In src/app/page.tsx (failed and track come from RES-03):

```ts
// Module scope, beside HIDE_KEY.
// State read back from storage is already saved. Saving it again could only
// overwrite something newer from the other tab and roll back what is typed there.
const fromStorage = new WeakSet<object>();
const adopt = <T extends object>(value: T): T => { fromStorage.add(value); return value; };

// page.tsx:151-159. delete, not has: a value read back skips exactly one save,
// so an Undo that later restores that same list still saves.
useEffect(() => { if (hydrated && !fromStorage.delete(loans)) track("loans", loanStore.save(loans)); }, [loans, hydrated]);
useEffect(() => { if (hydrated && !fromStorage.delete(profile)) track("profile", profileStore.save(profile)); }, [profile, hydrated]);
useEffect(() => { if (hydrated && !fromStorage.delete(snapshots)) track("snapshots", snapshotStore.save(snapshots)); }, [snapshots, hydrated]);

useEffect(() => {
  const reread = () => {
    if (failed.current.size) return; // saves are failing, so memory is the only good copy
    const next = loanStore.load();
    if (!next) return; // a missing or unreadable key is not "no loans"
    setLoans(adopt(next));
    setProfile(adopt(profileStore.load()));
    setSnapshots(adopt(snapshotStore.load()));
    if (!next.length) setTab("loans"); // as clearLoans does
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("cense.loandesk.")) reread();
  };
  const onShow = () => { if (document.visibilityState === "visible") reread(); };
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onShow);
  return () => {
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onShow);
  };
}, []);

// deleteLoan, page.tsx:250-259: put the row back where it was, keeping anything newer.
const deleteLoan = (id: string) => {
  const at = loans.findIndex((l) => l.id === id);
  const gone = loans[at];
  setLoans((prev) => prev.filter((l) => l.id !== id));
  if (editing?.id === id) setEditing(null);
  say(`Removed ${gone?.nickname ?? "loan"}`, {
    label: "Undo",
    run: () => setLoans((prev) =>
      gone && !prev.some((l) => l.id === id) ? [...prev.slice(0, at), gone, ...prev.slice(at)] : prev),
  });
};
// clearLoans, page.tsx:265
run: () => setLoans((prev) => [...before, ...prev.filter((l) => !before.some((b) => b.id === l.id))]),
// clearSnapshots, page.tsx:271
run: () => setSnapshots((prev) => [...before, ...prev.filter((x) => !before.some((b) => b.takenAt === x.takenAt))]),
```

Leave the load effect at page.tsx:139-149 as it is, so each tab still writes once at load; that write is what lets RES-03 warn before anything is typed. A write of an identical value fires no storage event, so nothing loops.

## Severity

Borrowers who have the app open in two tabs of one browser and change something in the tab that has not reloaded (the newsletter link opened twice, an old phone tab revisited) lose whatever the other tab saved, every time, with no message; on a stale first-run screen one save erases the whole portfolio. That is silent data loss limited to an uncommon environment, so P1: a single tab, or a tab that reloads before acting, loses nothing.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 6 of 6 skeptics across 2 filings (reproduce, standards, impact on each), with real clicks in Chromium 146 and in WebKit, on the local production build and in one pass on the live site.

<details><summary>Dissent and notes</summary>

Severity: all six skeptics kept P0 under the audit's scale (silent data loss, no frequency test); the dx impact and dx standards skeptics said it belongs below the always-on wrong-figure P0s because it needs a live stale tab and a change in it. This report rates P1 under the stricter rubric: an uncommon environment. Impact wording, corrected by four skeptics: opening the link twice or returning to an old tab loses nothing by itself; a change has to be made in the tab that has not re-read. A tab the operating system discarded reloads from storage and should be safe (inferred from the reload control, not measured on a phone). Undo sub-claim: the resilience standards skeptic reproduced the Undo-in-B loss only at machine speed (4.35 s from Remove back to B; the Undo was gone after B was hidden 9.3 s) and treats it as hardening, not as evidence. Fix: all six rejected both filed fixes as written. Their 'no write loop' evidence (final-checks F2, and write counters holding at 5,5) sampled one quiet save, and the re-read value flows into the save effect and is written back. Guard variants: four skeptics used WeakSet.delete and two used has; with has, an Undo that restores a list that was read back never saves (Undo showed 9 loans while storage held 0, and a reload showed the first-run screen), so delete is used here. A single last-read ref still lost 6 of 72 and a text compare in storage.ts lost 2 of 30. The dx standards skeptic would withdraw a pending Undo toast when the other tab writes instead of merging; not adopted, because merging keeps Undo working. The resilience impact skeptic also adopts the values read at load, which removes the load-time write but moves RES-03's warning from page load to the first save; not adopted. The resilience reproduce skeptic added a pageshow listener for unmeasured Safari; two others measured visibilitychange firing on back/forward restore in Chromium and WebKit, so it is left out. Line references: the filed storage.ts:36-42 covers only the loan store; the skeptics widened it to 36-55 for the profile and snapshot claims and added the Undo closures at page.tsx:265 and :271.

Fix choice: re-read on storage and visibilitychange (both filings); the never-write-back WeakSet guard with delete (four of six skeptics; builds with such a guard ended 0 wrong in every run); the missing-key guard and setTab("loans") from the resilience impact skeptic, because the filed `loanStore.load() ?? []` dropped a tab to the first-run screen and stored [] when the keys were removed while it was open, destroying the last copy in the Safari 7-day case of RES-05, and because after another tab cleared everything the next loan landed on Plans; and the three Undo merges (resilience impact and reproduce skeptics). The listing above keeps the load-time write, as five of six skeptics' builds did. By reading the code (not measured), a tab that opens while another tab is mid-edit can still write back what it loaded, once, as today. The guard also removes an endless write loop the filed fix showed against a simulated tab from another app version with a different key order (7,008 writes in 4 s).
Order: ship RES-03 first or together. The re-read reads its failed ref, so memory is not replaced while saves fail, and both change the same three save effects. The deleteLoan Undo overlaps RES-10 (single-slot Undo); land them together. RES-01's save Undo restores a whole earlier list on purpose and keeps the same 7-second cross-tab window.
Costs and limits: a re-read on return costs 5 to 25 ms of task time at 4x CPU for 8 to 60 loans (noisy); route size 37.2 kB to 37.4 kB, First Load JS unchanged at 125 kB. A half-typed form on a first-run screen is cleared when the other tab saves the first loan, because the form remounts under Loans; only unsaved text is lost (see RES-11). Not tested: real phones, iOS Safari tab suspension, Firefox, in-app browsers. How often people keep two live tabs cannot be measured (no analytics by design).

</details>

Merged from audit findings: `resilience-two-tabs-overwrite`, `dx-multi-tab-overwrite`.
