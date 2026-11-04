# RES-05: No backup or restore: the browser holds the only copy

**P1** · effort M · Data safety and resilience

Nothing can restore a borrower's loans and dated records once the browser drops them (Safari's automatic removal after weeks away, cleared site data, a new phone or browser), so they come back to an empty start screen with no warning and the dated records are gone for good.

| | |
|---|---|
| Who it hurts | An iPhone Safari borrower who checks in every couple of months, or anyone who clears site data or changes phone, comes back to an empty start screen with no explanation, must retype every loan, and permanently loses the dated records the Records tab exists to keep, even if they downloaded the spreadsheet. |
| Standard | None required by a standard. Platform behavior: WebKit's tracking prevention deletes script-writable storage, localStorage included, after a period of browser use without interaction on the site; webkit.org/blog/10218, webkit.org/tracking-prevention and MDN state seven days, while current WebKit source and this Mac's WebKit use 30 days of browser use except after a decorated link from a classified domain. The ux filing also cites Nielsen H5 (error prevention) and H10 (help and documentation). |
| Where | Every state. Cleared site data or a new phone or browser loses the data on any browser; automatic removal applies to Safari and other WebKit views. The loss shows on the next visit as the empty first-run screen (page.tsx:356-430), where neither Keep a copy (page.tsx:625-663) nor the Records tab renders, because both sit behind !empty (page.tsx:509 and 544). Records itself asks the borrower to come back 'after your servicer next updates your balances' (HistoryPanel.tsx:93-94). Measured in Chromium against :3100 and in this Mac's system WebKit (build 21624.5.1.11.3, the same build as its Safari 26.6.2) against localhost and the live site; not on an iPhone. |
| Code | [`src/lib/storage.ts:15`](../../src/lib/storage.ts#L15), [`src/lib/storage.ts:57`](../../src/lib/storage.ts#L57), [`src/lib/storage.ts:75`](../../src/lib/storage.ts#L75), [`src/lib/export.ts:80`](../../src/lib/export.ts#L80), [`src/lib/export.ts:82`](../../src/lib/export.ts#L82), [`src/lib/export.ts:95`](../../src/lib/export.ts#L95), [`src/lib/export.ts:243`](../../src/lib/export.ts#L243), [`src/lib/export.ts:262`](../../src/lib/export.ts#L262) |
| Test | `data-safety.spec.mjs`: "RES-05 after the browser drops its data, the start screen loads it back from a file the app saved" |

## Measured

No route back exists: grep of src for navigator.storage, storage.persist, FileReader, type="file" and XLSX.read returns 0 lines, and a wider search (FileList, readAsText, onDrop, showOpenFilePicker, manifest, apple-mobile-web-app, restore, backup) also returns 0. The running app has 0 input[type=file] in all 6 states. Both exports are .xlsx (20,420 and 26,027 bytes) and nothing reads them back; the history workbook carries no loan id (export.ts:262-271) and neither workbook holds the profile. After the origin's storage is cleared and the page reloaded: the first-run screen with only 'Add my first loan' and 'Look around with example loans', no notice, no section bar and no Keep a copy. The 'Snapshot saved' toast has no action (page.tsx:276). Automatic removal, measured by four skeptics in this Mac's WebKit (WKWebView, tracking prevention on, a logged tap, the store's time-advance testing hook where one step is one day of browser use): localStorage kept through day 29 and deleted on day 30, on localhost and on the live site, after which the app shows 0 loans, 0 snapshots and the first-run screen with no notice; a second tap on day 20 moves removal to day 50; arriving through a decorated link from a domain classified as a tracker deletes on day 7 (30 when the decoration is filtered); tracking prevention off, and the Home Screen configuration, keep the data past day 40. WebKit's source agrees (ResourceLoadStatisticsStore.cpp applies the 7-day window only when DataRemovalFrequency is Short, since 274398@main in February 2024), while Apple's pages and MDN still say seven days. navigator.storage.persist() resolves false in every ordinary WebKit store and in fresh Chromium, and true only in the Home Screen configuration. Retyping cannot rebuild dated records, because makeSnapshot stamps the current time (storage.ts:57-63). An agent re-entering 8 loans needed 24 actions. Fix beds: in Chromium, Restore was visible on the wiped first-run screen, all three keys came back byte-equal with the same dated diff after a reload, 15 and 16 malformed files in two beds (and the app's own .xlsx) were refused with storage unchanged, Undo returned the prior bytes, axe reported 0 violations, header overflow was unchanged from 320 to 390 px, and the route grew from 37.2 to 38.1 kB with First Load unchanged at 125 kB; in WebKit, a 5,289-byte backup restored through the real file input after the day-30 removal brought back the loans and the snapshot with its original takenAt.

## Required

A route back after the browser drops its storage: a backup file the app writes and the same app loads back, reachable from the empty first-run screen as well as from Keep a copy, that restores loans, answers and dated records byte for byte. A malformed file is refused with a message and nothing is written; a restore over existing data can be undone; nothing leaves the device and no dependency is added. The page says plainly, without a day count (Apple's docs say 7, the engine measured 30), that the browser can erase this data and that the backup file is the copy to keep.

## Reproduce

1. Open http://localhost:3100, tap 'Look around with example loans', open Records and tap 'Save today's snapshot'.
2. Look for a way to save something the app can read back: Loans > Keep a copy offers only 'Download as a spreadsheet' and 'Print one page', Records offers only 'Download as a spreadsheet', and no screen has a Restore or Import control.
3. Clear the site's storage the way the browser does on its own: in Chrome DevTools > Application > Storage, press 'Clear site data', then reload.
4. The page shows 'Every loan you have, on one screen.' with only 'Add my first loan' and 'Look around with example loans': no notice that anything was lost, no Records tab, and no way to load the downloaded spreadsheet.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-05"`.

## Fix

No server and no new dependency: the file is written and read by the browser on the device.
1. New src/lib/backup.ts, merged from the two tested beds:
import { DEFAULT_PROFILE, EMPLOYMENT_LABELS, GOAL_LABELS, LOAN_KIND_LABELS, Loan, PlanId, Profile, Snapshot } from "@/types";

const FORMAT = "cense-loan-desk-backup";
const KINDS = Object.keys(LOAN_KIND_LABELS);
const PLANS: PlanId[] = ["standard", "graduated", "extended", "ibr", "tiered_standard", "rap"];
export interface Backup { loans: Loan[]; profile: Profile; snapshots: Snapshot[] }

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const str = (v: unknown): v is string => typeof v === "string";
const obj = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Everything the loan form can store; nothing that would crash a tab or skew a total.
const isLoan = (l: unknown): l is Loan =>
  obj(l) && str(l.id) && l.id !== "" && str(l.nickname) && str(l.servicer) &&
  KINDS.includes(l.kind) && (l.subsidy === "subsidized" || l.subsidy === "unsubsidized") &&
  num(l.principal) && num(l.balance) && l.balance > 0 && num(l.rate) && l.rate <= 25 &&
  num(l.minPayment) && str(l.disbursementDate) &&
  /^\d{4,6}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(l.disbursementDate);

const isSnapshot = (s: unknown): s is Snapshot =>
  obj(s) && str(s.takenAt) && !Number.isNaN(Date.parse(s.takenAt)) &&
  Array.isArray(s.loans) && s.loans.every(isLoan) && num(s.totalBalance);

export const backupText = (b: Backup) =>
  JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), ...b }, null, 2);

/** Null means not a usable backup. Nothing is applied unless all of it is valid. */
export function parseBackup(text: string): Backup | null {
  let d: unknown;
  try { d = JSON.parse(text); } catch { return null; }
  if (!obj(d) || d.format !== FORMAT || d.version !== 1) return null;
  if (!Array.isArray(d.loans) || !d.loans.every(isLoan)) return null;
  if (new Set(d.loans.map((l: Loan) => l.id)).size !== d.loans.length) return null;
  if (!Array.isArray(d.snapshots) || !d.snapshots.every(isSnapshot)) return null;
  const p = { ...DEFAULT_PROFILE, ...(obj(d.profile) ? d.profile : {}) } as Profile;
  const ok = num(p.income) && num(p.extraPerMonth) && Number.isInteger(p.householdSize) &&
    p.householdSize >= 1 && p.householdSize <= 8 && Object.keys(GOAL_LABELS).includes(p.goal) &&
    Object.keys(EMPLOYMENT_LABELS).includes(p.employment) &&
    (p.selectedPlan === null || PLANS.includes(p.selectedPlan));
  return ok ? { loans: d.loans, snapshots: d.snapshots, profile: p } : null;
}
2. src/lib/export.ts:80-92: download() takes a type that defaults to the xlsx type it hard-codes at line 82, function download(filename: string, data: ArrayBuffer | string, type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") with new Blob([data], { type }), plus:
export function exportBackup(b: Backup) {
  download(`cense-loan-desk-backup-${today()}.json`, backupText(b), "application/json");
}
3. src/app/page.tsx: add ChangeEvent to the react import, const restoreRef = useRef<HTMLInputElement>(null), and one <input ref={restoreRef} type="file" accept=".json,application/json" className="hidden" onChange={restoreFromFile} /> at the top of <main>. Apply through the setters so the effects at 151-159 persist it:
const restoreFromFile = async (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // so choosing the same file again still fires
  if (!file) return;
  const backup = file.size <= 5e6 ? parseBackup(await file.text()) : null;
  if (!backup) {
    say("That file is not a Loan Desk backup. Nothing was changed.", { label: "OK", run: () => {} });
    return;
  }
  const before = { loans, profile, snapshots };
  setLoans(backup.loans);
  setProfile(backup.profile);
  setSnapshots(backup.snapshots);
  setAdding(false);
  setEditing(null);
  setTab("loans");
  say(`Restored ${backup.loans.length} loans and ${backup.snapshots.length} records`, {
    label: "Undo",
    run: () => { setLoans(before.loans); setProfile(before.profile); setSnapshots(before.snapshots); },
  });
};
4. Put Restore where a wiped browser lands, right after the first-run start buttons (page.tsx:368-382):
{!adding && (
  <p className="mt-3 text-sm leading-relaxed text-slate-700">
    Been here before and your loans are gone?{" "}
    <button type="button" onClick={() => restoreRef.current?.click()} className="min-h-[40px] rounded font-semibold text-navy underline underline-offset-2 hover:text-navy-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2">
      Restore from a backup file
    </button>
  </p>
)}
A control only in Keep a copy or Records cannot be reached after a wipe. Also add 'Save a backup file' (onClick={() => exportBackup({ loans, profile, snapshots })}) and 'Restore from a backup file' as secondary sm buttons in Keep a copy (627-643).
5. Offer the backup when a record is made (page.tsx:274-277):
const saveSnapshot = () => {
  const next = [...snapshots, makeSnapshot(loans)];
  setSnapshots(next);
  say("Snapshot saved", { label: "Save a backup", run: () => exportBackup({ loans, profile, snapshots: next }) });
};
6. Name the limit in body copy, with no day count. Keep a copy: 'Browsers can erase saved data for a site you have not opened in a while, and a new phone starts empty. A backup file brings everything back, dated records included. It holds your balances and income, so keep it somewhere private.' First-run 'What stays private' card, after page.tsx:421: 'Browsers can erase saved data for a site you have not opened in a while, so once your loans are in, save a backup file.' Records caption, replacing HistoryPanel.tsx:79-80: 'A snapshot stores every loan exactly as it stands right now, in this browser, which can erase saved data for a site you have not opened in a while. The spreadsheet is the copy you can read anywhere. The backup file, under Keep a copy on the Loans tab, is the one this page can load back.' Leave the header pill to RES-06 and do not call navigator.storage.persist().

## Severity

Safari users who stay away for about a month of Safari use (deleted on day 30 of browser use in WebKit, day 7 after some tracked links; Safari is 44.74% of US mobile browsing), and anyone who clears site data or changes phone or browser, come back to an empty start screen with no notice, must retype every loan, and can never recreate their dated records. Silent loss limited to that recognizable group is P1; a borrower who returns within the window keeps everything, so not P0.

Proposed P1; independent severity judges said P1; final P1.

## Verification

Confirmed by 7 of 7 skeptics across 3 filings (reproduce, standards and impact on resilience-no-restore-path; reproduce and standards on the other two); four of them measured the removal on this Mac's WebKit at day 30 of browser use, two also against the live site.

<details><summary>Dissent and notes</summary>

Severity: the resilience filing and its three skeptics held P1; one noted the loss is silent, which matches the P0 wording, but kept P1 because the default trigger needs about 30 days of browser use without a visit, no iPhone was tested, no dollar figure goes wrong, the spreadsheet exists, and loans can be retyped from studentaid.gov. The ux filing was P2: its reproduce skeptic kept P2 on what it could measure in Chromium, and its standards skeptic raised it to P1 after measuring the day-30 removal in WebKit. Both agentic skeptics kept P2, reading it as a portability gap. This report rates P1 under the stricter rubric and drops no level for the Records caption, which calls the spreadsheet 'the copy you keep outside the browser' but never says the browser can erase the data, and that copy cannot be loaded back. Corrections adopted: 'Safari's 7-day cap' is Apple's published figure, but four skeptics measured 30 days of browser use on this engine (7 only after a decorated link from a classified domain), so neither the title nor the UI states a day count; 'no WebKit binary here' was wrong, since the system WebKit ran the app; 'comes back monthly' sits on the measured line, and a tap restarts the count; 'the browser holds the only copy' is true only for borrowers who never downloaded the spreadsheet, though that file cannot be loaded back and has no loan ids; the agentic title's 'no way to save' is wrong (both exports work, and only the profile is never exported), and its 'only bulk path is unvalidated' describes a script writing storage directly, which belongs to RES-07; the 173,817-character agent figure is desktop-only and serializer-specific (105,020 and 318,782 with two other serializers). Fix corrections: the filed persist() call is dropped; the filed header change is dropped, because a longer pill adds overflow ('On this device only' takes 320 px from 42 to 65 px and adds 10 px at 375, where the pill has 0 px to spare); the filed 'suggest Add to Home Screen on iOS' moves to RES-06, because a Home Screen web app starts empty; RES-07's isLoan does not exist yet and does not cover snapshots (snapshots [{}] crashes Records), so this validator checks everything; the agentic draft accepted string and missing principals, 2026-13-45 and snapshots [{}], and overwrote 8 loans and 2 snapshots with no Undo, all closed here. The ux standards skeptic preferred reading the .xlsx back, since SheetJS already loads on demand; see notes.

Fix choice: a JSON backup rather than xlsx import, because the history workbook has no loan id (export.ts:262-271) while diffSnapshots keys on id (storage.ts:75-76), neither workbook holds the profile, and parsing user-chosen files with xlsx 0.18.5 would expose its open prototype-pollution and ReDoS advisories from the production audit. The validator merges the two tested beds and loosens the second where it refused data the shipped form can store: rates from 0 to 25 (that bed required 1 or more) and 4- to 6-digit years (RES-07's skeptics showed the date input saves 20260-09-01). It was not built as TypeScript; a plain-JS transcription round-tripped the audit fixture, accepted 0% rates and 5-digit years, and refused every bad input in the test list, so build it and rerun that list before shipping. KINDS.includes is used rather than `in` so inherited names such as 'constructor' do not pass. If RES-07 lands, share isLoan and isSnapshot between storage.ts and backup.ts. RES-04 adds a conditional 'Erase them' line in the same first-run spot; keep Restore first. persist() is left out: it resolved false in ordinary WebKit stores and fresh Chromium and true only in the Home Screen configuration, which is already exempt from removal, and MDN says Firefox shows a permission prompt. appleWebApp: { capable: true } in layout.tsx, suggested by two skeptics so that pre-iOS 26 icons open as web apps, is not included: it was not tested on iOS and would give those icons their own empty store, which RES-06 covers. The toast nudge offers the restorable JSON (one skeptic proposed the spreadsheet there); Records keeps its spreadsheet for reading. Ship the copy with RES-06, which edits the same card and caption. Not measured: Safari.app itself, an iPhone, the iOS file picker and download sheet, whether real newsletter links reach the 7-day path, and whether a phone migration carries website data.

</details>

Merged from audit findings: `resilience-no-restore-path`, `ux-persistence-unexplained`, `agentic-no-json-portability`.
