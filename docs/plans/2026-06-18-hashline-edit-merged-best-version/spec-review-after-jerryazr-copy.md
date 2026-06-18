# Spec Review

## What Was Done Well
- The implementation uses the requested focused package identity and default extension surface: `package.json` enables only `./extensions/core.ts` and `./extensions/insert.ts`, while `grep` and `undo` remain separate optional extensions.
- The default read/grep anchor protocol was updated to hash-only `HHH│content`, with optional `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` display support.
- The hash implementation uses `xxhash-wasm`, a 3-character URL-safe alphabet, and per-file retry-based collision resolution so repeated identical lines receive unique anchors.
- `edit` and `insert` expose the requested split schemas using hash-only anchors, and tests cover line-qualified anchor rejection, optional `current` mismatch rejection, insert before/after behavior, legacy normalization, full-file deletion guard, grep default-disablement, and doom-loop warnings.
- Safety work was preserved or added for atomic writes, mutation queueing, strict rendered-prefix rejection, legacy exact-unique normalization, stale rejection/merge recovery, and optional undo/grep module availability.

## Requirement Mismatches
- None remaining after follow-up fixes.

## Resolved Requirement Mismatches
- **Successful mutation output is now compact and keeps full diffs in host-only details.**
  - Requirement: Design says default mutation text should be compact and host-only details should contain the full unified diff in `details.diff`; it explicitly says not to duplicate full diffs or broad file content in model text by default.
  - Resolution: `pi-hashline-edit-merged/src/edit-response.ts` now returns compact model-visible success text with classification, while full unified diffs remain in `details.diff`. Tests in `pi-hashline-edit-merged/test/tools/edit.text-shape.test.ts` and related integration/undo tests now assert the details-only diff contract.

- **Runtime fallback validation now rejects unknown fields.**
  - Requirement: Design says schema validation rejects unknown or malformed fields with specific, actionable error messages.
  - Resolution: `assertEditRequest` and `assertInsertRequest` now reject unknown top-level and entry-level fields and validate required field types. `pi-hashline-edit-merged/test/tools/snapshot-id.test.ts` now asserts unknown root fields are rejected instead of ignored.

## Plan Deviations
- **Acceptable tradeoff: the implementation appears to include all five design phases despite the request not providing phase files.** The design caps medium work at no more than five phases; the package changes cover protocol upgrade, schemas, recovery/safety, optional modules, docs/tests, and no added phase structure was needed for this review.
- **No phase-x.md files were read by request.** The user explicitly said not to read `plan.md` or `phase-x.md`, so phase-specific scope compliance cannot be independently checked beyond the design's phase-count cap and design-level feature list.

## Scope Creep / Missing Scope
- No problematic scope creep remains from this review.
- **No evidence of readmap-style tool creep was found in changed package metadata.** `grep` and `undo` are optional; no default `ls`, `find`, `ast_search`, structural maps, NuShell, bash compression, auto-read, `tool-usage`, or syntax validation extension was identified in the changed file list.

## Tests vs Required Behavior
- Tests cover many required behaviors: 3-character hash format, repeated-line uniqueness, hash-only read output, optional line-hash display, edit and insert schemas, `current` mismatch rejection, legacy exact-unique normalization, stale rejection/merge paths, full-file deletion guard, optional `grep`/`undo` default-disabled registration, doom-loop warnings, compact mutation text with `details.diff`, runtime unknown-field rejection, empty insert rejection, and global grep limits.
- Ran `cd pi-hashline-edit-merged && npm test` after fixes.
- Result: Pass — 36 test files, 292 tests passed.
- Ran `git diff --check` for changed implementation and tests.
- Result: Pass.

## Spec Alignment Verdict
- Pass
- Reason: The requested merged package behavior is implemented and the previously identified output-contract and runtime-validation mismatches have been fixed and covered by tests.

## Required Fixes
- None remaining.
