# Spec Review

## What Was Done Well
- Implemented the main Phase 3 public protocol shift for `edit`: schema now uses `start`/`end` hash-only anchors and optional `current` (`pi-hashline-edit-merged/src/edit.ts:24`, `pi-hashline-edit-merged/src/edit.ts:98`).
- Implemented hash-only anchor parsing and clear rejection of line-qualified or copied-display anchors (`pi-hashline-edit-merged/src/hashline.ts:96`, `pi-hashline-edit-merged/src/hashline.ts:99`, `pi-hashline-edit-merged/src/hashline.ts:102`).
- Updated live hash resolution to resolve anchors by unique hash and leave absent/ambiguous/reversed ranges unmatched (`pi-hashline-edit-merged/src/fuzzy-match.ts:13`, `pi-hashline-edit-merged/src/fuzzy-match.ts:35`).
- Added optional `current` validation for single-line replacements only, without making it required (`pi-hashline-edit-merged/src/hashline.ts:335`, `pi-hashline-edit-merged/src/hashline.ts:341`).
- `read`, `edit`, `insert`, preview, and mutation paths await hasher readiness before building hashline files or resolving anchors (`pi-hashline-edit-merged/src/read.ts:206`, `pi-hashline-edit-merged/src/mutation.ts:67`).
- Phase size cap is satisfied: design says Medium should be no more than five phases, and `plan.md` has exactly five phases.

## Requirement Mismatches
- **Problematic deviation — displayed `read` anchors can differ from stored/resolved anchors for duplicate lines.** Phase 3 Task 2 Step 3 requires snapshots to store the same hashes shown to the model, and the goal requires hash-only anchors for core exact/live resolution. `buildHashlineFile()` stores collision-resolved hashes via `computeLineHashes(content)` (`pi-hashline-edit-merged/src/hashline.ts:64`), and `computeLineHashes()` retries on duplicates (`pi-hashline-edit-merged/src/hash-format.ts:57`, `pi-hashline-edit-merged/src/hash-format.ts:63`). But `formatHashlineRegion()` displays each line with the simple compatibility wrapper `computeLineHash(fileLines, index)` (`pi-hashline-edit-merged/src/hashline.ts:506`), which does not apply the per-file retry sequence. For repeated lines, the second and later displayed anchors can be the unretried hash, while the live file stores retried hashes. This can make a copied anchor edit the wrong repeated line or fail to target the intended line. Required fix: format read output from the same `HashlineFile.lineHashes` array used for snapshots/resolution, or make `formatHashlineRegion()` compute hashes with the same per-file collision assignment.
- **Problematic deviation — stale/mismatch retry output still instructs `LINE#HASH` usage.** Phase 3 requires mutating tools to accept only `HASH`, and verification says tool descriptions/output should not retain `LINE#HASH` examples except for rejected/display-only mode. `formatMismatchError()` still says `Retry with the >>> LINE${ANCHOR_SEP}HASH lines below` and emits retry anchors as `line#hash` (`pi-hashline-edit-merged/src/hashline.ts:156`, `pi-hashline-edit-merged/src/hashline.ts:165`). This contradicts the hash-only mutating request contract. Required fix: keep any line numbers strictly display-only in retry snippets and explicitly instruct copying only the 3-character hash, or emit retry snippets in `HASH│content` form.
- **Problematic deviation — `read` raw schema still documents old anchors.** Phase verification requires tool descriptions to avoid `LINE#HASH` except rejected/display-only mode. The `read.raw` parameter description still says `Return raw text without LINE#HASH anchors` (`pi-hashline-edit-merged/src/read.ts:158`). Required fix: change this schema description to `hash` or `HASH│content` wording.

## Plan Deviations
- **Acceptable tradeoff — Phase 3 commit steps were not performed.** The phase contains three explicit commit steps, but `git log -- pi-hashline-edit-merged` shows no Phase 3 commits after Phase 2 (`912f7ac`, `60ce813`, `32e4da5`), and `git status --short` shows Phase 3 work as uncommitted modified files. This does not block behavior but does deviate from the plan’s traceability steps.
- **Evidence the original plan should be updated / problematic if kept — grep documentation was changed without grep implementation.** Phase 3 Task 3 lists only `edit.md`, `edit-snippet.md`, and `insert.md` for tool-description updates, but the diff also changes grep descriptions to claim `HASH│content` output (`pi-hashline-edit-merged/tool-descriptions/grep.md:1`, `pi-hashline-edit-merged/tool-descriptions/grep-snippet.md:1`). The grep implementation still emits line-qualified anchors (`pi-hashline-edit-merged/src/grep.ts:313`) and has not been adapted in this phase. Required fix: either revert grep description changes until the Phase 5 grep update, or update grep implementation/tests now and explicitly expand Phase 3 scope.

## Scope Creep / Missing Scope
- **Missing scope — no test covers duplicate-line displayed-anchor correctness.** The phase explicitly requires unique 3-character hashes per visible line and snapshots storing hashes shown to the model. Existing tests verify uniqueness in `buildHashlineFile()` but not that `read`/`formatHashlineRegion()` displays those same collision-resolved hashes. This allowed the displayed-vs-stored mismatch above to pass.
- **Scope creep — grep tool-description edits are outside the selected Phase 3 implementation scope unless treated as phase-verification cleanup.** Because grep is an optional module planned for Phase 5, changing grep docs in Phase 3 without changing code creates a user-visible mismatch.
- **Observation — README still contains legacy `LINE#HASH` behavior, but Phase 3 did not list README as a target file.** This is not a Phase 3 required fix unless the team interprets the phase verification’s “tool descriptions” broadly as all package docs.

## Tests vs Required Behavior
- Passed: `cd pi-hashline-edit-merged && npm test -- test/core/hashline.hash.test.ts test/core/hashline.parse.test.ts test/core/hashline.resolve.test.ts test/core/hashline.apply.test.ts` — 49 tests passed.
- Passed: `cd pi-hashline-edit-merged && npm test -- test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts` — 36 tests passed.
- Passed: `cd pi-hashline-edit-merged && npm test -- test/core/hash-format.test.ts test/core/anchor-display.test.ts test/core/read-snapshot.test.ts test/tools/edit.preview.test.ts` — 20 tests passed.
- Coverage gap: tests do not verify that `read` output hashes exactly equal `setReadSnapshot(...).file.lineHashes` for duplicate visible lines.
- Coverage gap: tests do not verify that stale-anchor retry messages preserve the hash-only mutating contract.
- Coverage gap: grep docs were changed, but no grep behavior tests were run or updated for hash-only output.

## Spec Alignment Verdict
- Fail
- Reason: The main happy-path Phase 3 behavior is mostly implemented and focused tests pass, but a core contract requirement is violated: the model-visible `read` anchors can diverge from the live/snapshot hashes used by mutation resolution on repeated lines. This affects edit correctness and directly contradicts the phase requirement that snapshots store the same hashes shown to the model. There are also user-facing remnants/contradictions around `LINE#HASH` retry/schema wording and grep documentation.

## Required Fixes
1. Make `read`/`formatHashlineRegion()` display the exact collision-resolved hashes from `buildHashlineFile(...).lineHashes`, and add a regression test with duplicate lines proving displayed anchors match snapshot/live resolution.
2. Update stale/mismatch retry output and `read.raw` schema wording so mutating guidance consistently says to copy only the 3-character hash.
3. Reconcile grep documentation with actual grep behavior: revert the Phase 3 grep description edits, or update grep implementation/tests in an explicitly approved scope expansion.
4. Add focused tests for the above mismatches before considering Phase 3 complete.
