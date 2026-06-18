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
- **Problematic deviation:** Full-suite validation remains red because many existing tests still exercise old `range: [...]`/`LINE#HASH` assumptions after the public edit schema changed to `start`/`end`.
  - Evidence: `npm test` still fails with 55 failures. Examples from the recheck include `test/integration/strict-hashline-loop.test.ts`, `test/core/hashline-strict-input.test.ts`, `test/integration/stale-position-compound.test.ts`, `test/tools/grep.test.ts`, and `test/tools/file-kind.test.ts`.
  - Classification: problematic deviation for repository-wide verification; acceptable deferral only if these tests are explicitly assigned to later hardening/grep phases.
  - Required fix: migrate remaining legacy tests/callers to the new hash-only schema, or document the deferral in the phase/plan verification contract.
- **Evidence the original plan should be updated:** Optional grep runtime and grep tests remain line-qualified/old-protocol oriented while grep docs now warn not to copy grep anchors into mutating tools.
  - Evidence: `pi-hashline-edit-merged/src/grep.ts:5` still documents `LINE#HASH│` output, and `npm test` still has grep failures around matching read-tool hashes / using grep anchors in edit.
  - Classification: evidence the original plan should be updated or Phase 5 should explicitly own grep protocol adaptation.
  - Required fix: clarify whether grep adaptation is Phase 5-only; if not, update grep runtime/tests now.

## Scope Creep / Missing Scope
- **Missing scope:** Several non-focused but existing tests that exercise edit behavior were not updated after the schema change, leaving stale test intent in the repository.
  - Classification: problematic deviation for full-suite health; likely deferred scope for later hardening if Phase 3 intentionally owns only focused tests.
- **Acceptable tradeoff:** The grep model-visible descriptions were touched even though optional grep behavior is Phase 5. This is acceptable because Phase 3 verification checks tool descriptions and the new text explicitly warns not to copy grep anchors into edit/insert.

## Tests vs Required Behavior
- Focused Phase 3 command: **pass** — 7 files / 87 tests passed.
- Full `npm test`: **fail** — still 55 failures.
- Required Phase 3 behavior covered by focused tests includes hash-only read output, line-qualified anchor rejection, hash-only edit/insert execution, optional `current` mismatch handling, and hashline core parsing/apply behavior.
- Behavior not fully aligned repository-wide: legacy tests and optional grep expectations still assume old line-qualified/context-hash behavior.

## Spec Alignment Verdict
- Pass with issues
- Reason: Explicit Phase 3 core behavior and focused verification now align, and the prior stale grep tool-description issue is fixed. Remaining failures are important repository-wide legacy/optional-tool test debt, but they exceed the focused Phase 3 verification command unless the plan is interpreted as requiring full-suite green status at this phase.

## Required Fixes
1. Migrate remaining legacy tests/callers from `range: [...]` and line-qualified anchors to `start`/`end` hash-only anchors, or document them as deferred Phase 4/5/final-hardening work with an adjusted verification contract.
2. Clarify grep ownership: either explicitly defer grep runtime/test protocol adaptation to Phase 5, or update `src/grep.ts` and grep tests to match the new hash-only/read-compatible contract.
