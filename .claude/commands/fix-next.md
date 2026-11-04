---
description: Take the next item from audits/ROADMAP.md, fix it, and prove the fix with its test
argument-hint: "[issue id, e.g. MONEY-08]"
---
Fix one issue from `audits/ROADMAP.md`: `$ARGUMENTS` if an ID is given. Otherwise take the first open issue in the first open priority, or the first unticked row of "Everything else" once every priority is done.

1. Read `audits/issues/<ID>.md`, then the code it names. Check that the claim still holds before changing anything.
2. Find its test with `grep -rn "<ID>" audits/tests/`. A known issue's test starts with `knownIssue('<ID>')`. From `audits/`, run it as an ordinary test with `AUDIT_SHOW_KNOWN=1 npx playwright test -g "<ID>"`, and confirm it fails for the reason the issue states.
3. If `audits/fixes/<ID>/` exists, start from it, and apply any `.patch` file in it with `git apply --3way`. It was written against the code as it was on 2026-11-02 and has not been applied to this repo or proven with its test, so check it still fits. Otherwise make the smallest change that fixes the issue. Nothing may send data off the device. Do not add a runtime dependency without a measured reason.
4. Run the test again with `AUDIT_SHOW_KNOWN=1` and confirm it passes, then delete its `knownIssue('<ID>')` line.
5. At the repo root run `node verify.mjs`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Then run `npm test` in `audits/`. Any other test now reported as "expected to fail, but passed" means this change also fixed that issue. Remove its line too and say so. If the fix changes a money figure, name the `verify.mjs` assertion that covers it, and add one if none does.
6. Tick the issue off in `audits/ROADMAP.md` with the date, and stop. Fix one issue per change, so each stays easy to review and revert.
