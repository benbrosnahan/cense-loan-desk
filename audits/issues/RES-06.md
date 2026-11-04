# RES-06: "On your device" is really "in this browser"

**P2** · effort S · Data safety and resilience

The header says 'On your device', but each browser, in-app browser and iOS 26 Home Screen icon keeps its own separate copy, so a borrower who comes back a different way sees an empty start screen with no hint that their loans are still in the other place.

| | |
|---|---|
| Who it hurts | A newsletter reader who entered loans inside Instagram or Gmail's in-app view, or an iPhone user who opens a new Home Screen icon, sees an empty start screen under 'On your device' with no hint that the loans are still in the other place, and may conclude they were deleted or start over in a copy that does not hold their records. |
| Standard | None. Platform behavior from vendor documents: Safari View Controller keeps a separate persistent store per app (Apple WWDC17 session 225 and the SFSafariViewController docs); Android WebViews do not share state with the browser while Custom Tabs do (Chrome docs); on iOS 26 every site added to the Home Screen opens as a web app (webkit.org/blog/17333) whose data is isolated from Safari (webkit.org/tracking-prevention), with only cookies copied when the icon is created (webkit.org/blog/14787). |
| Where | Header pill in every state ('On your device' below 640 px, 'Stays on this device' from 640 px), the first-run 'What stays private' card and footer, and the Records caption. It matters on the newsletter entry path (page.tsx:137 names it) when the link opens in an in-app browser, and for iPhone users on iOS 26 or later who use Share > Add to Home Screen. Simulated with two Chromium storage contexts at 390 px; no iOS device or simulator was available. |
| Code | [`src/app/page.tsx:337`](../../src/app/page.tsx#L337), [`src/app/page.tsx:338`](../../src/app/page.tsx#L338), [`src/components/history/HistoryPanel.tsx:79`](../../src/components/history/HistoryPanel.tsx#L79), [`src/app/page.tsx:420`](../../src/app/page.tsx#L420), [`src/app/page.tsx:659`](../../src/app/page.tsx#L659), [`src/data/plans.ts:285`](../../src/data/plans.ts#L285), [`src/lib/storage.ts:3`](../../src/lib/storage.ts#L3), [`src/app/page.tsx:416`](../../src/app/page.tsx#L416) |
| Test | `data-safety.spec.mjs`: "RES-06 the page says loans are kept in this browser, and the start screen says they may be in another one" |

## Measured

The storage claims disagree: 'On your device' (page.tsx:337), 'Stays on this device' (page.tsx:338) and 'on this device' (HistoryPanel.tsx:79-80), plus the comment at storage.ts:3, against 'saved in this browser' (page.tsx:420), 'from this browser' (page.tsx:659) and 'stays in this browser' (PRIVACY_NOTE, plans.ts:285, shown in the footer at page.tsx:841). Nothing in src mentions an in-app browser, another browser, Gmail, Instagram, Outlook or the Home Screen. In two isolated storage contexts at 390 px, context A held 8 loans and 2 snapshots (3 after a real save) while context B showed 0 loans, 0 snapshots and the first-run screen 'Every loan you have, on one screen.' under the pill 'On your device', with 0 lines pointing to another app or browser and 0 file inputs. The app keeps everything in localStorage: 4 keys, document.cookie '', 0 cookies over CDP, 0 Set-Cookie locally and on the live HTML, and no IndexedDB, Cache Storage or service worker. There is no manifest link, apple-mobile-web-app-capable meta or apple-touch-icon, and manifest.webmanifest, manifest.json and site.webmanifest return 404. The live and local page chunks contain no 'Home Screen', 'standalone', 'display-mode', type:"file" or 'Restore', so no Home Screen tip ships today. Vendor sources, re-fetched by the skeptics: Apple says apps cannot access Safari View Controller's website data and points to ASWebAuthenticationSession for sharing with Safari (WWDC17 session 225: a 'separate persistent data store in each app'); Chrome's docs say WebViews 'don't share state with the browser' while Custom Tabs do; Outlook opens links in Edge under an admin setting (MC859848) and otherwise prompts consumers to choose (MC531738); Instagram uses its own in-app browser (Krause 2022); Gmail for iOS's embedded view rests on user reports from 2022, 2023 and 2025, and Google does not document it. On iOS 26 'By default, every website added to the Home Screen opens as a web app' (webkit.org/blog/17333), its data 'is kept isolated from Safari' (webkit.org/tracking-prevention), 'the cookies are copied over' and 'No other kind of local storage is copied over' (webkit.org/blog/14787), and Apple calls the isolation 'by design' (WebKit bug 181849); since Loan Desk sets no cookies, a new icon starts with 0 loans. Before iOS 26 this site's icon opens in the browser and shares its storage. WebKit reports display-mode 'browser' for a page without a manifest (MediaQueryFeatures.cpp:795-823), and navigator.standalone comes from the embedding app (Navigator.cpp:366-370). Pill widths in Chromium: 'On your device' 134.9 px against 'In this browser' 133.3 px below 640 px; 'Stays on this device' 163.8 px against 'Stays in this browser' 169.4 px from 640 px, with 0 overflow at 640, 768 and 1024. Header overflow in the loans state goes from 41 to 39 px at 320, 21 to 19 at 340 and 1 to 0 at 360 (0.5 px inside the edge), and is 0 from 375 up; the empty state has 0 overflow at every width, with a new card line inserted too.

## Required

Every storage-location string names the browser, consistent with page.tsx:420, page.tsx:659 and plans.ts:285. The first-run screen carries one line, true in every context, saying that an in-app browser or a Home Screen icon may keep its own copy and that loans entered elsewhere are still there. No Home Screen tip or install prompt ships until RES-05's backup and restore exist, and then only as ordered steps (back up, add to Home Screen, open the icon, restore) scoped to iOS 26 or later. No new header overflow from 320 to 1024 px.

## Reproduce

1. In one browser (for example Chrome) open http://localhost:3100 at a phone width and tap 'Look around with example loans'. The header pill reads 'On your device' (from 640 px wide, 'Stays on this device').
2. Open the same address in a second browser on the same computer (Safari or Firefox) or in a private window. It shows the empty first-run screen 'Every loan you have, on one screen.' under the same 'On your device' pill, with no line saying the loans are in the other browser.
3. On that screen the 'What stays private' card says 'saved in this browser' and the footer 'stays in this browser', against the header's 'device'.
4. Back in the first browser, the Records caption says 'on this device'.
5. Not run here, from WebKit's documentation: on an iPhone with iOS 26, add loans in Safari, use Share > Add to Home Screen with Open as Web App on, and open the icon; it starts empty.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "RES-06"`.

## Fix

Copy first; nothing here needs a dependency or detection.
1. page.tsx:337-338, the same width as today (133.3 px against 134.9 px below 640 px):
<span className="sm:hidden">In this browser</span>
<span className="hidden sm:inline">Stays in this browser</span>
2. HistoryPanel.tsx:79-80: 'A snapshot stores every loan exactly as it stands right now, in this browser. The spreadsheet is the copy you keep outside the browser.' If RES-05 ships in the same change, use its caption instead, which already says 'in this browser'.
3. storage.ts:3 comment: '// Everything stays in this browser.'
4. Inside the 'What stays private' card, after page.tsx:425, one line that is true in every context:
<p className="mt-2 text-sm leading-relaxed text-slate-600">
  Opened this inside an app like Instagram or Gmail? It may save there
  rather than in your usual browser, so open the page in your usual
  browser before you start. Each browser keeps its own copy, and an
  iPhone Home Screen icon can too, so loans you added somewhere else
  are still there.
</p>
Once RES-05's restore exists, end it with 'Back them up there, then choose Restore from a backup file here.'
5. Home Screen steps, only together with RES-05's Back up and Restore, in its Keep a copy card, scoped to iOS 26 or later and naming no single browser: 'On iPhone with iOS 26 or later, an icon added to the Home Screen keeps its own copy, separate from your browser, and starts empty. 1. Save a backup file here. 2. Share, then Add to Home Screen, with Open as Web App left on. 3. Open the icon and choose Restore from a backup file.' No install prompt anywhere.
6. Optional, and only after an iOS 26 Simulator shows navigator.standalone is true for this site without a manifest: in Page, const [homeScreen, setHomeScreen] = useState(false); in the hydration effect (page.tsx:139-149), setHomeScreen((navigator as Navigator & { standalone?: boolean }).standalone === true); and above the first-run buttons:
{homeScreen && (
  <Notice tone="info" title="This Home Screen app has its own storage" className="mt-6">
    It starts empty, even if you added loans in Safari or another browser. They are still there.
  </Notice>
)}
Do not test (display-mode: standalone), and never carry data into the icon in a cookie: iOS copies cookies, but they travel to Vercel with every request, which breaks PRIVACY_NOTE.

## Severity

Borrowers who enter loans in one place and come back through another (an in-app browser such as Instagram's on the newsletter path, a different browser, or an iOS 26 Home Screen icon) see an empty start screen under 'On your device' with no hint that their loans still exist elsewhere. Nothing is deleted and no figure is wrong, so this is a misleading statement at P2; the path that actually loses data is RES-05.

## Verification

Confirmed by 5 of 5 skeptics across 2 filings (reproduce and standards on the device-claim filing; reproduce, impact and standards on the Home Screen filing), with independent probes and freshly fetched vendor documents; the iOS behavior rests on those documents, not on a device or simulator.

<details><summary>Dissent and notes</summary>

The standards skeptic on the device-claim filing rated it P3: 'On your device' is literally true as a privacy claim, since nothing leaves the device, the empty screen already says 'saved in this browser' in its card and footer, and RES-05's filed fix already prescribed the header change; that filing's reproduce skeptic kept P2. The Home Screen filing was filed at P1, and all three of its skeptics rated P2: the tip it warns about is not shipped (0 occurrences in the live and local bundles), opening the icon deletes nothing, and the only loss path is Safari's removal, which RES-05 owns. This report rates the merged issue P2 as a misleading statement with no wrong number. It does not drop to P3, because to someone inside Gmail's Safari-styled view the card's 'this browser' reads as Safari and nothing on screen mentions in-app browsers or Home Screen icons. The header change sits here rather than in RES-05, whose fix now leaves the header alone, so nothing is counted twice. Corrections adopted: the filed first-run line 'It saves inside that app' is false for most email readers (Apple Mail hands off to Safari, Gmail for Android uses Custom Tabs that share Chrome's storage, Gmail for iOS set to the default browser opens it there, and Outlook opens Edge or asks), so the line is hedged; docs-matrix contexts[6] and [7] share the browser's storage, so 'contexts[1] to [7] keep their own copy' was loose; the Gmail for iOS silo rests on user reports and a setting (Krause 2022 lists Gmail as 'Default Browser'); MC859848 describes an admin setting and consumer Outlook prompts the user to choose (MC531738), so it 'may' open Edge; the filed 360 px test passes by 0.5 px; 'They are still in Safari' is wrong for icons added from other browsers, which iOS also allows; the filed Home Screen tip promised an own copy that Safari will not clear after a week away, which is false before iOS 26 because this site's icon then opens in the browser; and the filed notice ORed in (display-mode: standalone), which also matches desktop Chrome app windows that share the browser's storage, while WebKit reports display-mode 'browser' for a page without a manifest.

Fix choice: copy changes plus one first-run line that holds in every context, rather than detection, because no reliable signal exists for in-app browsers and the Home Screen signal is unverified for a site without a manifest. The line merges the device-claim standards skeptic's wording (open the page in your usual browser before you start) with the Home Screen standards skeptic's (loans are still where you added them). The Home Screen steps and the optional notice wait on RES-05, because without a reachable Restore they point at a control that does not exist; the Keep a copy card renders only while loans exist (page.tsx:544), which is why RES-05 also puts Restore on the first-run screen. The filed step that called navigator.storage.persist() after a restore inside the icon is dropped: RES-05's skeptics measured persist() true only in the Home Screen configuration, which is already exempt from removal. Ship with RES-05: both edit the 'What stays private' card (page.tsx:416-426) and the Records caption (HistoryPanel.tsx:78-83), so put their sentences in one paragraph. RES-04's new Clear my data copy also says 'browser'. The pill change trims A11Y-01's header overflow at 320 px from 41 to 39 px but does not fix it. Not measured: any iOS device or simulator (none on this Mac), Gmail for iOS, and what an iOS 26 Home Screen app reports for navigator.standalone or display-mode on a site without a manifest.

</details>

Merged from audit findings: `gap-device-claim-per-browser-silos`, `gap-home-screen-tip-opens-empty-app`.
