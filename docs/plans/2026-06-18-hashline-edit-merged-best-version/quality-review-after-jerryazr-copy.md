# Code Quality Review

## What Was Done Well
- The core hashline protocol is cohesive: `read`, `edit`, `insert`, `grep`, prompt text, and tests were updated around 3-character hash-only anchors.
- The mutation path centralizes queueing, target validation, stale-anchor recovery, atomic writes, undo emission, and response construction in `src/mutation.ts`, which keeps `edit` and `insert` behavior consistent.
- Safety boundaries are mostly explicit: hashline display prefixes are rejected instead of silently stripped, stale anchors produce actionable errors, `current` validates single-line replacements, and full-file deletion protection remains in place.
- Test coverage is broad for changed behavior: hash formatting, strict input, stale recovery, merge fallback, edit/insert tools, grep, doom-loop warnings, snapshots, and integration flows are covered by the existing Vitest suite.

## Critical
- None.

## Important
### Empty insert payloads mutate the file instead of being rejected or treated as no-op
- Files: `pi-hashline-edit-merged/src/insert.ts:23-34`, `pi-hashline-edit-merged/src/insert.ts:82-100`, `pi-hashline-edit-merged/src/hashline.ts:356-380`
- Problem: `insert` allows `lines: []` at the schema level, `assertInsertRequest` only checks that `edits` is non-empty, and `normalizeInsertItems` defaults missing/non-array `lines` to `[]`. The span builder then turns an append/prepend with no lines into a newline insertion (`edit.lines.join("\n") + "\n"` or equivalent), so an empty or malformed insert can unexpectedly add a blank line.
- Why it matters: `insert` is documented as adding the supplied lines only. Empty input should not create file content, and defaulting malformed input to `[]` weakens the boundary validation expected from a mutating tool.
- Minimal fix: Require at least one inserted line in both schema and runtime validation. Add `minItems: 1` to `insertEntrySchema.lines`, validate every edit entry in `assertInsertRequest`, and stop defaulting missing `lines` to `[]` in `normalizeInsertItems`. Add a focused test for `lines: []` rejection.

### Grep limit is enforced per file, not globally
- Files: `pi-hashline-edit-merged/src/grep.ts:31-32`, `pi-hashline-edit-merged/src/grep.ts:207-239`
- Problem: The schema describes `limit` as the maximum number of matches to return, but the implementation computes `matchCount` from the current file's entries only. Searches across many files can return up to `limit` matches per file until the separate 50KB output cap truncates the result.
- Why it matters: `grep` is optional, but when enabled this breaks the token-control contract and can produce much larger outputs than requested. It also makes the "limit reached" notice misleading.
- Minimal fix: Track a single global match counter across all `match` events and stop ripgrep when that global counter reaches `effectiveLimit`. Keep per-file entries only for rendering/context, and add a multi-file limit regression test.

## Suggestions
### Update stale comments that still describe the old hashing/recovery model
- Files: `pi-hashline-edit-merged/src/hashline.ts:1-5`, `pi-hashline-edit-merged/src/mutation.ts:99`
- Observation: The module header still says the hash algorithm is inline FNV-1a with surrounding-line context, and the mutation comment still describes fuzzy matching as `+-N` line search. The implementation now uses `xxhash-wasm` with perfect per-file collision resolution and hash-only relocation.
- Benefit: Future maintainers are less likely to reintroduce context-hash assumptions or misunderstand stale-anchor recovery.
- Suggested refinement: Replace those comments with the current protocol description; no behavior change needed.

## Tests and Verification
- Ran `cd pi-hashline-edit-merged && npm test`.
- Result: Pass — 36 test files, 288 tests passed.
- Reviewed changed implementation directly via `git diff c196b43724da0ad18bf2f5f48448643520cb0bbb...HEAD` and inspected the core changed files under `pi-hashline-edit-merged/src/`.
- Edge cases considered: duplicate/repeated-line hashing, hash-only anchor parsing, display-prefix rejection, stale-anchor recovery, `current` validation, delete/replace span boundaries, insert before/after span boundaries, optional grep truncation/limits, and empty/malformed mutating payloads.

## Quality Verdict
- Pass with issues
- Reason: The implementation is generally maintainable, well-tested, and appropriately focused for the reviewed design. No critical correctness or safety blocker was found, and the full test suite passes. The empty-insert mutation and grep limit semantics should be fixed because they are concrete boundary/contract issues in touched code. This quality verdict does not imply full requirements approval beyond the reviewed design document.
