# Spec Review

## What Was Done Well
- Phase 4 scope is largely present in the current working tree: recovery, strict edit input handling, legacy normalization, and doom-loop warnings are implemented under `pi-hashline-edit-merged/`.
- Hash-only recovery is wired through snapshot line metadata and live unique-hash resolution: `attachSnapshotLines()` fills snapshot positions (`pi-hashline-edit-merged/src/fuzzy-match.ts:33`), mutation attaches them before recovery tiers (`pi-hashline-edit-merged/src/mutation.ts:88`), and relocated live matches emit `[W_RELOCATED]` (`pi-hashline-edit-merged/src/fuzzy-match.ts:109`).
- Stale and ambiguous anchor diagnostics now exist in `formatMismatchError()`, including `[E_STALE_ANCHOR]`, `[E_AMBIGUOUS_ANCHOR]`, candidate line numbers, and hashline samples (`pi-hashline-edit-merged/src/hashline.ts:119`).
- Exact unique legacy normalization is implemented with `[W_LEGACY_NORMALIZED]` warnings and non-unique rejection (`pi-hashline-edit-merged/src/edit-normalize.ts:68`, `pi-hashline-edit-merged/src/edit.ts:454`).
- Doom-loop tracking was added and integrated into `read`, `edit`, and `insert` visible responses (`pi-hashline-edit-merged/src/doom-loop.ts`, `pi-hashline-edit-merged/src/read.ts:172`, `pi-hashline-edit-merged/src/edit.ts:454`, `pi-hashline-edit-merged/src/insert.ts:293`).
- Plan structure satisfies the design cap: the design classifies the work as medium with no more than five phases, and `plan.md` defines exactly five phases.

## Requirement Mismatches
- **Problematic deviation: strict-prefix error classification contradicts Phase 4.**
  - Requirement: `phase-4.md` Task 2 Step 4 says `hashlineParseText` must throw `[E_INVALID_PATCH]` for `+HASH│`, `LINE#HASH│`, and diff-minus rows, while span resolution rejects bare `HASH│content` with `[E_BARE_HASH_PREFIX]`.
  - Implementation: `assertNoDisplayPrefixes()` uses one hashline-prefix path for bare, line-qualified, and `+HASH│` prefixes and throws `[E_BARE_HASH_PREFIX]` for all of them (`pi-hashline-edit-merged/src/hashline.ts:185`). Phase-added tests were changed to expect `[E_BARE_HASH_PREFIX]` for `LINE#HASH│` and `+HASH│` (`pi-hashline-edit-merged/test/core/hashline-strict-input.test.ts:10`).
  - Why it matters: this changes a phase-specified user-visible diagnostic contract and leaves older parser tests failing.
  - Classification: problematic deviation.

## Plan Deviations
- **Acceptable tradeoff: `partitionExact()` is stricter than the phase wording.**
  - Phase statement: Task 1 Step 2 says `partitionExact(edits, file)` resolves anchors by unique live hash and returns matched edits with `line` filled in.
  - Implementation: `partitionExact()` only returns a moved snapshot-line anchor as matched when the resolved live line has not changed; otherwise it leaves the edit for `fuzzyMatch()` so `[W_RELOCATED]` can be emitted (`pi-hashline-edit-merged/src/fuzzy-match.ts:77`).
  - Why it matters: this differs from the helper-level wording, but it preserves the phase goal of warned live relocation classification. If this is accepted, update the plan wording/comment rather than changing behavior.
  - Classification: acceptable tradeoff.
- **No phase-count cap issue.** Medium plan cap is ≤5 phases; the plan has 5 phases.

## Scope Creep / Missing Scope
- **Missing scope: no remaining Phase 4 feature gap found for recovery, legacy normalization, or doom-loop behavior.** The required modules and tests exist in the expected package area.
- **Scope issue: strict-prefix tests were updated beyond the exact phase contract.** The tests now require `[E_BARE_HASH_PREFIX]` for `LINE#HASH│` and `+HASH│`, which conflicts with the phase’s `[E_INVALID_PATCH]` requirement for those parser-level cases. Classification: problematic deviation.
- **Added scope: none material.** Changes found by git history/diff stay within Phase 4’s intended files and behavior areas.

## Tests vs Required Behavior
- Phase-listed verification commands passed:
  1. `cd pi-hashline-edit-merged && npm test -- test/core/fuzzy-match.test.ts test/core/hashline.recovery.test.ts test/integration/merge-fallback.test.ts test/integration/stale-position-compound.test.ts` — PASS, 48 tests.
  2. `cd pi-hashline-edit-merged && npm test -- test/core/hashline-strict-input.test.ts test/tools/edit.text-shape.test.ts` — PASS, 17 tests.
  3. `cd pi-hashline-edit-merged && npm test -- test/core/doom-loop.test.ts` — PASS, 2 tests.
  4. `cd pi-hashline-edit-merged && npm test -- test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts` — PASS, 38 tests.
- Broader parser checks fail and confirm the strict-prefix mismatch:
  - `cd pi-hashline-edit-merged && npm test -- test/core/hashline.parse.test.ts test/core/hashline.resolve.test.ts` — FAIL, 5 tests, because expected `[E_INVALID_PATCH]` but received `[E_BARE_HASH_PREFIX]` (`pi-hashline-edit-merged/test/core/hashline.parse.test.ts:43`, `pi-hashline-edit-merged/test/core/hashline.resolve.test.ts:88`).
- Full test suite currently fails:
  - `cd pi-hashline-edit-merged && npm test` — FAIL, 7 tests.
  - 5 failures are the strict-prefix diagnostic mismatch above.
  - 2 failures in `test/tools/snapshot-id.test.ts` expect older stale-anchor retry/count text; these appear to be tests needing update to Phase 4’s new stale message rather than clear code mismatches.

## Spec Alignment Verdict
- Pass with issues
- Reason: the core Phase 4 behavior is substantially implemented and all phase-specific verification commands pass, but the strict-prefix diagnostic contract is not aligned with the explicit phase requirement and the full suite is not green.

## Required Fixes
1. Restore the Phase 4 error-code split in `hashlineParseText` / prefix validation: `+HASH│`, `LINE#HASH│`, and diff-minus rows should throw `[E_INVALID_PATCH]`; bare copied `HASH│content` should throw `[E_BARE_HASH_PREFIX]` with real-hash detail when file context is available.
2. Update tests to match the finalized Phase 4 diagnostic contract, then rerun `cd pi-hashline-edit-merged && npm test` and keep the full suite green.
