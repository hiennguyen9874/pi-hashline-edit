# Spec Review

## What Was Done Well
- Core hashline behavior was rewired to 3-character hash-only anchors: `buildHashlineFile` uses `computeLineHashes`, validates hash count, and `formatHashlineRegion` uses `formatAnchorPrefix` in `pi-hashline-edit-merged/src/hashline.ts:64`, `pi-hashline-edit-merged/src/hashline.ts:66`, and `pi-hashline-edit-merged/src/hashline.ts:494`.
- Mutating anchor parsing rejects line-qualified and copied display anchors with Phase 3-style `E_BAD_REF` messages in `pi-hashline-edit-merged/src/hashline.ts:96`, `pi-hashline-edit-merged/src/hashline.ts:99`, and `pi-hashline-edit-merged/src/hashline.ts:102`.
- Exact/live resolution was changed to unique hash lookup in `pi-hashline-edit-merged/src/fuzzy-match.ts:16`, `pi-hashline-edit-merged/src/fuzzy-match.ts:47`, and `pi-hashline-edit-merged/src/fuzzy-match.ts:71`.
- `read`, `edit`, and `insert` await hasher readiness before hash-dependent paths in `pi-hashline-edit-merged/src/read.ts:211`, `pi-hashline-edit-merged/src/edit.ts:304`, `pi-hashline-edit-merged/src/edit.ts:449`, `pi-hashline-edit-merged/src/insert.ts:150`, and `pi-hashline-edit-merged/src/insert.ts:289`.
- The focused Phase 3 verification suite passed: `npm test -- test/core/hashline.hash.test.ts test/core/hashline.parse.test.ts test/core/hashline.resolve.test.ts test/core/hashline.apply.test.ts test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts` passed 87 tests.
- Plan structure matches the design size cap: the design calls for a medium plan with no more than five phases, and `plan.md` contains five phases.

## Requirement Mismatches
- **Problematic deviation:** Phase verification says tool descriptions must contain no `LINE#HASH` examples except rejected/display-mode documentation, but grep descriptions still advertise `LINE#HASH│content` anchors.
  - Evidence: `pi-hashline-edit-merged/tool-descriptions/grep.md:1`, `pi-hashline-edit-merged/tool-descriptions/grep-snippet.md:1`.
  - Why it matters: these model-visible descriptions can teach callers to copy line-qualified anchors that Phase 3 mutating tools now reject.
  - Required fix: update or remove the stale grep descriptions for this phase, or explicitly defer grep docs/runtime to Phase 5 and exclude them from Phase 3 verification.
- **Acceptable tradeoff:** Phase 3 asks for registered read tests covering line-hash display mode. The implementation covers the behavior through `formatHashlineReadPreview` rather than a registered tool execution test.
  - Evidence: `pi-hashline-edit-merged/test/tools/read.test.ts` validates default registered output and direct line-hash formatting.
  - Why it matters: behavior is covered, but not through exactly the fixture shape described in the phase text.
  - Required fix: optional; add one registered-tool env-mode test if strict test-shape parity is required.

## Plan Deviations
- **Problematic deviation:** Full-suite validation is left red because many existing tests still exercise the old `range: [...]`/`LINE#HASH` schema after the public edit schema was changed to `start`/`end`.
  - Evidence: `npm test` failed with 55 failures. Examples include `test/integration/strict-hashline-loop.test.ts:26`, `test/tools/edit.queue.test.ts:58`, `test/tools/edit.text-shape.test.ts:25`, and `test/tools/snapshot-id.test.ts:44` still using legacy `range` payloads.
  - Why it matters: Phase 3 changed public tool schemas; affected test coverage outside the focused command now no longer represents the implemented API and prevents repository-wide verification.
  - Required fix: migrate legacy tests in affected edit/integration/metrics/snapshot/undo areas to `start`/`end` hash-only anchors, or mark them as intentionally deferred with a plan update.
- **Evidence the original plan should be updated:** Grep runtime and tests remain line-qualified while Phase 3 verification has a global tool-description check.
  - Evidence: `pi-hashline-edit-merged/src/grep.ts:5` documents `LINE#HASH│` output; grep tests still expect grep anchors usable by edit.
  - Why it matters: grep is listed as optional/Phase 5 scope, but Phase 3 verification currently reaches into tool descriptions that include grep.
  - Required fix: either narrow the Phase 3 verification wording to core read/edit/insert descriptions, or move grep anchor/doc adaptation into Phase 3.

## Scope Creep / Missing Scope
- **Missing scope:** Not all model-visible tool-description files satisfy the Phase 3 protocol verification. `read.md` has an allowed debug-mode mention, but grep docs still present `LINE#HASH` as normal output.
- **Missing scope:** Several non-focused but existing tests that exercise edit behavior were not updated after the schema change, leaving stale test intent in the repository.
- **Acceptable tradeoff:** Phase 3 implementation touched grep description files even though optional grep behavior is Phase 5. This is only acceptable if the intent was to satisfy the global tool-description verification; as implemented, those grep files remain stale.

## Tests vs Required Behavior
- Focused Phase 3 command passed: 7 files / 87 tests passed.
- Full `npm test` failed with 55 failures. The failures are mostly legacy-test/schema fallout and grep/read expectations still assuming line-qualified anchors.
- Required behavior covered by focused tests includes hash-only read output, line-qualified anchor rejection, hash-only edit/insert execution, optional `current` mismatch handling, and hashline core parsing/apply behavior.
- Required behavior not fully covered repository-wide: all existing edit/integration callers using the public schema, and optional grep anchor compatibility with the new mutating-tool contract.

## Spec Alignment Verdict
- Fail
- Reason: Core Phase 3 behavior is largely implemented and the focused verification suite passes, but explicit Phase 3 verification is not satisfied because stale `LINE#HASH` tool descriptions remain, and repository-wide tests are left failing due old schema expectations.

## Required Fixes
1. Remove or update stale `LINE#HASH│content` grep tool-description text, or update the Phase 3 plan to explicitly exclude optional grep descriptions until Phase 5.
   - Status: fixed.
   - Verification: `pi-hashline-edit-merged/tool-descriptions/grep.md` and `pi-hashline-edit-merged/tool-descriptions/grep-snippet.md` no longer advertise `LINE#HASH│content` anchors. Focused Phase 3 tests still pass.
2. Migrate remaining legacy tests/callers from `range: [...]` and line-qualified anchors to `start`/`end` hash-only anchors, or document them as deferred Phase 4/5 work with an adjusted verification contract.
   - Status: deferred.
   - Severity: important.
   - Reason: verified by full `npm test` failure, but the failures span legacy integration/edit/grep/fuzzy/read expectations outside the focused Phase 3 core suite. Migrating all of them is broader than a minimal Phase 3 review fix and overlaps optional grep/final-hardening scope.
3. Re-run the focused Phase 3 suite and `npm test`; the focused suite should remain green and the full suite should either pass or have documented, phase-approved deferrals.
   - Status: fixed for focused verification; deferred for full-suite green status.
   - Verification: focused Phase 3 command passed 87 tests. Full `npm test` still fails with 55 failures from deferred legacy expectations.

## Review Resolution Status
- Fixed: stale grep model-visible descriptions that advertised `LINE#HASH│content` anchors.
- Deferred: repository-wide legacy test/caller migration from `range: [...]` and line-qualified anchors to `start`/`end` hash-only anchors. This is verified and important, but not a minimal Phase 3 report fix.
- Rejected: adding a registered-tool read test only for strict fixture-shape parity. Existing Phase 3 tests cover default hash-only output and line-hash display formatting; no behavior gap was verified.
