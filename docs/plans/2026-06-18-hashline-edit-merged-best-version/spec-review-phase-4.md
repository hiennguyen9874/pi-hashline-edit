# Spec Review

## What Was Done Well
- Phase scope was followed at a high level: implementation work is confined to recovery, strict input handling, legacy normalization, and doom-loop warnings in `pi-hashline-edit-merged/`.
- Snapshot line metadata was added through `attachSnapshotLines()` and wired into mutation before live/snapshot recovery (`pi-hashline-edit-merged/src/fuzzy-match.ts:24-39`, `pi-hashline-edit-merged/src/mutation.ts:85-94`). This supports relocation warnings without requiring the model to send line numbers.
- Legacy `oldText`/`newText` normalization is implemented as an exact, unique compatibility path and warns with `[LEGACY_NORMALIZED]` (`pi-hashline-edit-merged/src/edit-normalize.ts:95-120`, `pi-hashline-edit-merged/src/edit.ts:466-490`).
- Core doom-loop detection was ported and integrated into `read`, `edit`, and `insert` successful responses (`pi-hashline-edit-merged/src/doom-loop.ts`, `pi-hashline-edit-merged/src/read.ts:238-244`, `pi-hashline-edit-merged/src/edit.ts:491-494`, `pi-hashline-edit-merged/src/insert.ts:312-315`).
- Phase verification tests pass locally: `npm test -- test/core/fuzzy-match.test.ts test/core/hashline.recovery.test.ts test/integration/merge-fallback.test.ts test/integration/stale-position-compound.test.ts test/core/hashline-strict-input.test.ts test/tools/edit.text-shape.test.ts test/core/doom-loop.test.ts test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts` passed 102 tests.
- Plan structure is within the design cap: design says medium work should fit in no more than five phases, and `plan.md` defines exactly five phases.

## Requirement Mismatches
- **Problematic deviation: stale-anchor error text does not match Phase 4.**
  - Requirement: `phase-4.md` Task 1 Step 4 says absent hashes should report `[E_STALE_ANCHOR] stale anchor "aB3". Call read() to get fresh anchors.`
  - Implementation: `formatMismatchError()` reports `Retry with the >>> HASH│content lines below; copy only the 3-character hash...` and does not contain `Call read() to get fresh anchors` (`pi-hashline-edit-merged/src/hashline.ts:153-156`).
  - Why it matters: the phase explicitly selected a simpler hash-only stale-anchor recovery instruction. The current message preserves an older retry-snippet workflow and tests now assert that older behavior (`pi-hashline-edit-merged/test/core/hashline.recovery.test.ts:100-111`).

- **Problematic deviation: ambiguous-anchor formatting is not implemented.**
  - Requirement: `phase-4.md` Task 1 Steps 2 and 4 require ambiguous hashes to remain unmatched and later become `[E_AMBIGUOUS_ANCHOR] anchor "aB3" matches lines 1, 3.` with up to five `HASH│content` sample lines.
  - Implementation: no `E_AMBIGUOUS_ANCHOR` exists in source or tests. `partitionExact()` collapses absent and ambiguous anchors into the same `unmatched` path (`pi-hashline-edit-merged/src/fuzzy-match.ts:60-81`), and `formatMismatchError()` only emits `[E_STALE_ANCHOR]` (`pi-hashline-edit-merged/src/hashline.ts:118-172`).
  - Why it matters: ambiguous and absent anchors require different user action and diagnostics. The current code cannot produce the required ambiguity-specific message.

- **Problematic deviation: strict bare-prefix rejection does not implement `[E_BARE_HASH_PREFIX]` or real-file-hash diagnostics.**
  - Requirement: `phase-4.md` Task 2 Step 4 says span resolution must reject bare `HASH│content` lines with `[E_BARE_HASH_PREFIX]`, and the error should say whether the prefix matches a real file hash.
  - Implementation: `assertNoDisplayPrefixes()` rejects bare `HASH│content` during parsing with `[E_INVALID_PATCH]` only (`pi-hashline-edit-merged/src/hashline.ts:177-192`). There is no `E_BARE_HASH_PREFIX` in source or tests.
  - Why it matters: the implemented behavior is safely strict, but it misses the selected diagnostic contract and cannot distinguish likely copied live hashes from merely hash-looking text.

- **Acceptable tradeoff with risk: `partitionExact()` semantics differ from the phase wording.**
  - Requirement: `phase-4.md` Task 1 Step 2 says `partitionExact(edits, file)` resolves anchors by unique live hash and returns matched edits with `line` filled in.
  - Implementation: `partitionExact()` resolves by unique hash but intentionally rejects edits whose attached snapshot line differs from the live resolved line (`pi-hashline-edit-merged/src/fuzzy-match.ts:72-78`), leaving them for `fuzzyMatch()` to classify as relocated.
  - Why it matters: this preserves the intended mutation-tier warning behavior, but the helper no longer means exactly what the phase says. If this design is intentional, update the phase/spec or rename/comment the helper semantics.

- **Problematic deviation: legacy request shallow validation is incomplete.**
  - Requirement: `phase-4.md` Task 2 Step 2 says requests with `edits` should be returned unchanged with `warnings: []` after shallow shape validation.
  - Implementation: `normalizeEditRequest()` checks only that `edits` is a non-empty array before returning it (`pi-hashline-edit-merged/src/edit-normalize.ts:75-83`). Entry shape is not shallow-validated there.
  - Why it matters: malformed native payloads can bypass the compatibility normalizer and fail later with less intentional errors. Minimal fix is to validate each edit is a record before returning unchanged, leaving detailed schema validation to the existing edit path.

## Plan Deviations
- **Problematic deviation: Task 1 Step 1 merge-fallback test flow was not updated as specified.**
  - Requirement: `phase-4.md` says the integration test should read a file, capture a hash, externally modify the file so the hash is absent from live content but present in the read snapshot, then expect `[MERGED]` when `threeWayMerge` succeeds or `[E_STALE_ANCHOR]` when it cannot.
  - Implementation evidence: the current changed test adds a `[RELOCATED]` assertion in `test/integration/merge-fallback.test.ts`, not the specified absent-live-hash snapshot-merge flow.
  - Classification: problematic deviation.

- **Evidence the original plan should be updated: `partitionExact()` is used as a no-warning tier and `fuzzyMatch()` as the relocated-warning tier.**
  - The code achieves warned relocation through two tiers, but by making `partitionExact()` exclude moved snapshot-line anchors. This is coherent in `mutation.ts`, yet it conflicts with the phase’s stated helper semantics.

- **No phase-count cap issue.**
  - Design cap: medium ≤5 phases.
  - Plan count: 5 phases.

## Scope Creep / Missing Scope
- **Missing scope: ambiguous anchor user diagnostics.** No implementation or tests cover `[E_AMBIGUOUS_ANCHOR]`.
- **Missing scope: explicit stale-anchor refresh instruction.** No implementation or tests cover `Call read() to get fresh anchors` for stale anchors.
- **Missing scope: `[E_BARE_HASH_PREFIX]` with real-hash matching detail.** Strict rejection exists, but the selected diagnostic behavior is absent.
- **Added scope: none material beyond the phase.** Doom-loop, normalization, recovery, and strict safety changes are within Phase 4.

## Tests vs Required Behavior
- Passing tests are not sufficient for full spec alignment because several tests encode behavior that contradicts Phase 4:
  - `hashline.recovery.test.ts` expects the older `Retry with the >>> HASH│content lines below` message instead of the phase-required `Call read() to get fresh anchors` wording.
  - Strict-prefix tests accept `[E_INVALID_PATCH]` and do not assert `[E_BARE_HASH_PREFIX]` or whether the copied prefix matches a real file hash.
  - No tests assert `[E_AMBIGUOUS_ANCHOR]` or ambiguous-line samples.
- Verified command:
  - `cd pi-hashline-edit-merged && npm test -- test/core/fuzzy-match.test.ts test/core/hashline.recovery.test.ts test/integration/merge-fallback.test.ts test/integration/stale-position-compound.test.ts test/core/hashline-strict-input.test.ts test/tools/edit.text-shape.test.ts test/core/doom-loop.test.ts test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts`
  - Result: PASS, 10 files / 102 tests.

## Spec Alignment Verdict
- Pass with issues
- Reason: the main Phase 4 behavior is substantially implemented and tests pass, but explicit required diagnostics for stale, ambiguous, and bare-prefix errors are missing or contradicted by tests. These are user-visible safety contracts from the selected phase, not style issues.

## Required Fixes
1. **fixed** — Updated `formatMismatchError()` and related mismatch data so absent anchors emit the phase-required stale message containing `Call read() to get fresh anchors`.
2. **fixed** — Tracked ambiguous hash matches separately from absent hashes and emit `[E_AMBIGUOUS_ANCHOR]` with candidate line numbers and up to five `HASH│content` samples.
3. **fixed** — Implemented `[E_BARE_HASH_PREFIX]` for copied `HASH│content` payload lines during file-aware validation, including whether the prefix matches a real file hash; updated strict tests accordingly.
4. **rejected with reason** — Kept the current two-tier `partitionExact()` / `fuzzyMatch()` semantics. This is intentional runtime behavior needed so moved snapshot-line anchors flow to `fuzzyMatch()` and produce `[RELOCATED]`; changing it to the phase wording would remove that warning classification. No code fix applied.
5. **fixed** — Added minimal shallow validation in `normalizeEditRequest()` for the existing `edits` array path, ensuring entries are records before returning unchanged.
6. **fixed** — Added the missing integration coverage for the Phase 4 absent-live-hash flow: read snapshot contains the old hash, live content no longer does, and the edit reports `[E_STALE_ANCHOR]` with the refresh instruction when merge cannot be safely computed.
