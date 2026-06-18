# Code Quality Review

## What Was Done Well
- The core hashline protocol is cohesive: `read`, `edit`, `insert`, `grep`, prompt text, and tests were updated around 3-character hash-only anchors.
- The mutation path centralizes queueing, target validation, stale-anchor recovery, atomic writes, undo emission, and response construction in `src/mutation.ts`, which keeps `edit` and `insert` behavior consistent.
- Safety boundaries are mostly explicit: hashline display prefixes are rejected instead of silently stripped, stale anchors produce actionable errors, `current` validates single-line replacements, and full-file deletion protection remains in place.
- Test coverage is broad for changed behavior: hash formatting, strict input, stale recovery, merge fallback, edit/insert tools, grep, doom-loop warnings, snapshots, and integration flows are covered by the existing Vitest suite.

## Critical
- None.

## Important
- None remaining after follow-up fixes.

## Resolved Issues
### Empty insert payloads are rejected
- Files: `pi-hashline-edit-merged/src/insert.ts`, `pi-hashline-edit-merged/test/tools/insert.test.ts`
- Resolution: `insert` now requires non-empty `lines` in both TypeBox schema validation and runtime fallback validation. Runtime normalization no longer defaults missing or malformed `lines` to `[]`, so empty insert payloads cannot mutate files by adding blank lines.

### Grep limit is enforced globally
- Files: `pi-hashline-edit-merged/src/grep.ts`, `pi-hashline-edit-merged/test/tools/grep.test.ts`
- Resolution: `grep` now tracks a single global match count across all files and stops ripgrep when the requested limit is reached. A multi-file regression test pins the global limit contract.

### Stale comments were updated
- Files: `pi-hashline-edit-merged/src/hashline.ts`, `pi-hashline-edit-merged/src/mutation.ts`
- Resolution: Comments now describe 3-character xxHash anchors with per-file collision resolution and hash-only relocation, instead of the old FNV/context-search model.

## Tests and Verification
- Ran `cd pi-hashline-edit-merged && npm test` after fixes.
- Result: Pass — 36 test files, 292 tests passed.
- Ran `git diff --check` for changed implementation and tests.
- Result: Pass.
- Reviewed changed implementation directly and inspected the core changed files under `pi-hashline-edit-merged/src/`.
- Edge cases considered: duplicate/repeated-line hashing, hash-only anchor parsing, display-prefix rejection, stale-anchor recovery, `current` validation, delete/replace span boundaries, insert before/after span boundaries, optional grep truncation/limits, and empty/malformed mutating payloads.

## Quality Verdict
- Pass
- Reason: The implementation is maintainable, well-tested, and appropriately focused for the reviewed design. The previously identified empty-insert mutation, grep global limit, and stale-comment issues have been fixed and covered by tests. This quality verdict does not imply full requirements approval beyond the reviewed design document.
