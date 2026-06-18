# Spec Review

## What Was Done Well
- Core hashline behavior is rewired to 3-character hash-only anchors: `buildHashlineFile` uses `computeLineHashes`, validates hash count, and `formatHashlineRegion` uses `formatAnchorPrefix` in `pi-hashline-edit-merged/src/hashline.ts:64`, `pi-hashline-edit-merged/src/hashline.ts:66`, and `pi-hashline-edit-merged/src/hashline.ts:494`.
- Mutating anchor parsing rejects line-qualified and copied display anchors with Phase 3-style `E_BAD_REF` messages in `pi-hashline-edit-merged/src/hashline.ts:96`, `pi-hashline-edit-merged/src/hashline.ts:99`, and `pi-hashline-edit-merged/src/hashline.ts:102`.
- Exact/live resolution was changed to unique hash lookup in `pi-hashline-edit-merged/src/fuzzy-match.ts:16`, `pi-hashline-edit-merged/src/fuzzy-match.ts:47`, and `pi-hashline-edit-merged/src/fuzzy-match.ts:71`.
- `read`, `edit`, and `insert` await hasher readiness before hash-dependent paths in `pi-hashline-edit-merged/src/read.ts:211`, `pi-hashline-edit-merged/src/edit.ts:304`, `pi-hashline-edit-merged/src/edit.ts:449`, `pi-hashline-edit-merged/src/insert.ts:150`, and `pi-hashline-edit-merged/src/insert.ts:289`.
- The focused Phase 3 verification suite passes: `npm test -- test/core/hashline.hash.test.ts test/core/hashline.parse.test.ts test/core/hashline.resolve.test.ts test/core/hashline.apply.test.ts test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts` passed 87 tests.
- The prior stale grep tool-description mismatch is fixed: `pi-hashline-edit-merged/tool-descriptions/grep.md` and `pi-hashline-edit-merged/tool-descriptions/grep-snippet.md` no longer advertise `LINE#HASH│content` anchors.
- Plan structure matches the design size cap: the design calls for a medium plan with no more than five phases, and `plan.md` contains five phases.

## Requirement Mismatches
- **Acceptable tradeoff:** Phase 3 asks for registered read tests covering line-hash display mode. The implementation covers the behavior through `formatHashlineReadPreview` rather than a registered tool execution test.
  - Evidence: `pi-hashline-edit-merged/test/tools/read.test.ts` validates default registered output and direct line-hash formatting.
  - Classification: acceptable tradeoff.
  - Required fix: none unless strict test-shape parity is required.
- **No current Phase 3 model-visible tool-description mismatch found:** Recheck found only the allowed `read.md` debug-mode mention of `LINE#HASH│content`; grep tool descriptions have been corrected.
  - Evidence: grep over `pi-hashline-edit-merged/tool-descriptions` shows `LINE#HASH` only in `read.md` debug display-mode documentation.
  - Classification: fixed problematic deviation.

## Plan Deviations
- **Fixed:** Full-suite validation no longer remains red from old `range: [...]`/`LINE#HASH` assumptions.
  - Evidence: legacy edit/integration/metrics/snapshot/undo tests were migrated to `start`/`end` hash-only anchors where they exercise the public edit schema.
  - Classification: fixed.
  - Verification: `cd pi-hashline-edit-merged && npm test` passes 34 files / 274 tests.
- **Fixed:** Optional grep runtime and grep tests now align with the hash-only/read-compatible contract.
  - Evidence: `pi-hashline-edit-merged/src/grep.ts` formats grep rows through `formatAnchorPrefix`, awaits hasher readiness, and grep tests expect 3-character hash-only anchors matching read output.
  - Classification: fixed.
  - Verification: included in passing `npm test`.

## Scope Creep / Missing Scope
- **Fixed:** Existing tests that exercise edit behavior have been updated after the schema change, removing stale `range: [...]` and line-qualified mutating-anchor intent.
  - Classification: fixed.
- **Acceptable tradeoff:** The grep model-visible descriptions and optional grep runtime were touched even though optional grep behavior is Phase 5. This is acceptable because Phase 3 verification checks tool descriptions and grep now follows the same hash-only anchor display helper.

## Tests vs Required Behavior
- Focused Phase 3 command: **pass** — 7 files / 87 tests passed.
- Full `npm test`: **pass** — 34 files / 274 tests passed.
- Required Phase 3 behavior covered by tests includes hash-only read output, line-qualified anchor rejection, hash-only edit/insert execution, optional `current` mismatch handling, hashline core parsing/apply behavior, repository-wide edit callers, and optional grep hash-only/read-compatible output.

## Spec Alignment Verdict
- Pass
- Reason: Explicit Phase 3 core behavior, model-visible descriptions, optional grep protocol behavior, and repository-wide verification now align.

## Required Fixes
1. Migrate remaining legacy tests/callers from `range: [...]` and line-qualified anchors to `start`/`end` hash-only anchors, or document them as deferred Phase 4/5/final-hardening work with an adjusted verification contract.
   - Status: fixed.
   - Verification: `cd pi-hashline-edit-merged && npm test` passes 34 files / 274 tests.
2. Clarify grep ownership: either explicitly defer grep runtime/test protocol adaptation to Phase 5, or update `src/grep.ts` and grep tests to match the new hash-only/read-compatible contract.
   - Status: fixed.
   - Resolution: grep runtime/tests were updated now to match the hash-only/read-compatible contract.
   - Verification: included in passing `npm test`.
