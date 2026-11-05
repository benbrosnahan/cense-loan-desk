# SEC-05: Two lockfile updates clear production advisories

**P3** · effort S · Security, privacy and best practices

Two build-time packages, the postcss copy pinned inside Next 14 and source-map-js, keep the production audit red even though a lockfile-only update clears both without changing a byte of the built site; borrowers are not affected.

| | |
|---|---|
| Who it hurts | No borrower is affected. The author sees four red packages in the production audit where only next still needs a decision (xlsx gets a recorded reason under SEC-04), so a genuinely new advisory is easy to miss. |
| Standard | None (dependency hygiene). npm audit flags postcss GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp and GHSA-r28c-9q8g-f849 (all fixed by 8.5.23) and source-map-js GHSA-68fv-2mgg-jv7q (fixed in 1.2.2). |
| Where | No screen in the app: build toolchain only. package.json (next pinned at 14.2.35, no overrides block) and package-lock.json (next's exact pin of postcss 8.4.31, the nested copy it installs, and source-map-js 1.2.1), as reported by npm audit --omit=dev. |
| Code | [`package.json:14`](../../package.json#L14), [`package-lock.json:4303`](../../package-lock.json#L4303), [`package-lock.json:4342`](../../package-lock.json#L4342), [`package-lock.json:5440`](../../package-lock.json#L5440) |
| Test | `security-privacy.spec.mjs`: "SEC-05 the production install has no copy of postcss or source-map-js inside their advisory ranges" |
| Fix proof | Not attempted: fix proofs were run for P0 and P1 only. |

## Measured

Production audit today (npm audit --omit=dev): 4 packages, 1 critical and 3 high: next, postcss, source-map-js and xlsx. postcss is the copy Next installs for itself (node_modules/next/node_modules/postcss 8.4.31, range <=8.5.22, 4 advisories, the only fix npm offers being next 16.4.4); source-map-js is 1.2.1 (range <1.2.2, fixAvailable true). All five advisories are build-time and need attacker CSS or an attacker source map; this repo builds only its own CSS and emits 0 .map files. npm audit fix --package-lock-only moves source-map-js to 1.2.2 plus 14 dev-tree entries (for example typescript-eslint 8.67.0 to 8.72.1), leaves package.json untouched, and exits 1 because next and xlsx remain. An override for next's postcss moves it from 8.4.31 to 8.5.32 and nanoid from 3.3.18 to 3.3.20. After both: npm ci, lint, tsc and next build succeed, all 23 files in .next/static are byte-identical to the build before the change, and the audit lists only next and xlsx (1 critical, 1 high); with SEC-04's writer alternative as well, only next. Registry: postcss 8.5.32 is the latest; next 14.2.35 and 15.5.28 pin 8.4.31; next 16.4.4 pins 8.5.23.

## Required

A production audit that lists only what still needs a decision (next under SEC-02, xlsx under SEC-04), so a new advisory stands out: postcss above 8.5.22 and source-map-js 1.2.2 or later.

## Reproduce

Nothing shows in the app; this is a dependency audit. In a scratch copy of the repo, not the working checkout: 1. npm ci, then npm audit --omit=dev: next (critical), postcss, source-map-js and xlsx (high). 2. npm run build and record a hash of every file in .next/static. 3. npm audit fix --package-lock-only (exit code 1 is expected), add the override shown in the fix, then npm install. 4. npm audit --omit=dev: next and xlsx only. 5. npm run build again: all 23 static files hash the same as in step 2.

Or run its test from `audits/`: `AUDIT_SHOW_KNOWN=1 npx playwright test -g "SEC-05"`.

## Fix

1. Run npm audit fix --package-lock-only. It moves source-map-js 1.2.1 to 1.2.2 without touching package.json, and exits 1 because next and xlsx remain, so run the next steps separately rather than chaining them with &&.
2. Add to package.json, scoped to next so the top-level postcss devDependency is left alone:
"overrides": {
  "next": { "postcss": "8.5.32" }
}
3. Run npm install, then npm run build, and commit package.json and package-lock.json.
Remove the override when you leave Next 14 and 15 (both pin postcss 8.4.31): Next 16.4.4 pins 8.5.23, which is outside the vulnerable range.

## Severity

No borrower is affected: all five advisories are build-time and need attacker-supplied CSS or source maps, while this build processes only the repo's own CSS and emits no .map files. The cost is audit noise for the author, so P3.

## Verification

Confirmed by 1 of 1 skeptic (reproduce, run twice from git HEAD); P3 kept.

<details><summary>Dissent and notes</summary>

None on the defect, the numbers or P3. The skeptic noted that 'two lockfile changes' understates the churn: the two steps move 17 lockfile entries (source-map-js and 14 dev-tree entries from audit fix, next's postcss and nanoid from the override). That is harmless because all 23 static output files are byte-identical, a stronger check than the CSS hash the filer compared. The skeptic also noted that the reachability claim rests on reading each advisory, not on a probe.

Order with the related issues: after this fix the production audit lists next (SEC-02) and xlsx (SEC-04's recorded reason); with SEC-04's writer alternative it lists only next. The override is scoped under next because postcss ^8 is also a direct devDependency (package.json:27; npm outdated shows 8.5.26 installed, already outside the <=8.5.22 range), and that copy needs no change. There is no CI to run the allowlist script yet (DX-01); until there is, run it by hand before deploying.

</details>

Merged from audit findings: `bp-audit-quick-wins`.
