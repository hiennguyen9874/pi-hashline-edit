# Spec Review

## What Was Done Well
- Phase count cap is respected: `design.md` classifies the work as medium with no more than five phases, and `plan.md` contains exactly five phases.
- `grep` now computes anchors from full file content instead of displayed ripgrep text: `src/grep.ts:163` calls `ensureHasherReady()`, `src/grep.ts:271-272` normalizes full file content and builds a `HashlineFile`, and `src/grep.ts:301-303` emits hashes from `file.lineHashes` through `formatAnchorPrefix()`.
- Truncated grep display lines no longer drive hashing: `src/grep.ts:296-303` hashes the full original file line and only truncates the displayed text.
- Grep prompt docs now show hash-only anchors and tell users to copy only the 3-character hash: `tool-descriptions/grep.md:1-9`, `tool-descriptions/grep-snippet.md:1`.
- Default package metadata keeps only core and insert extensions enabled: `package.json:28-32`; extension tests assert the same at `test/extension/register.test.ts:27-31`.
- `undo` remains optional and independently registered: `test/extension/register.test.ts:42-47`; `src/undo.ts` and `test/tools/undo.test.ts` contain no old anchor/range protocol assumptions from the requested grep.
- README now documents final read/edit/insert examples, optional grep/undo enablement, and migration notes: `README.md:11-33`, `README.md:37-53`, `README.md:57-71`, `README.md:75-86`, `README.md:88-107`.
- Validation was run and passed: focused grep/undo/registration tests, full `npm test`, protocol grep, and `npm pack --dry-run`.

## Requirement Mismatches
- None.

## Plan Deviations
- None blocking.
- Acceptable tradeoff: the Phase 5 task list says to update `README.md`, `AGENTS.md`, and all prompt files. `AGENTS.md`, `read.md`, `edit.md`, `insert.md`, snippets, and guidelines were not all changed in the staged Phase 5 diff, but direct inspection shows they already match the final protocol or contain only allowed debug/rejected-input/migration references. No implementation change is required.

## Scope Creep / Missing Scope
- Acceptable tradeoff: staged test-only changes in `test/core/hashline.parse.test.ts`, `test/core/hashline.resolve.test.ts`, and `test/tools/snapshot-id.test.ts` adjust expected error-code text for existing behavior, but these files are not part of the explicit Phase 5 file list except the broad final validation/test hardening scope. They do not add Phase 5 functionality and should be kept only if they are needed to reflect the current intended error contract.
- Missing scope: none found. Task 1 grep behavior, Task 2 undo/default metadata checks, and Task 3 docs/metadata/package validation are covered.

## Tests vs Required Behavior
- `test/tools/grep.test.ts:60-84` verifies a grep-produced hash-only anchor can be used by `edit`.
- `test/tools/grep.test.ts:90-102` verifies default grep output is not line-qualified.
- `test/tools/grep.test.ts:235-248`, `254-272`, and `278-285` verify grep hashes are based on full/read-compatible content across normal, CRLF, and trailing-whitespace cases.
- `test/extension/register.test.ts:27-31` verifies default package extensions are only core and insert.
- `test/extension/register.test.ts:42-47` verifies undo remains available and disabled by default.
- Verification run:
  - `cd pi-hashline-edit-merged && npm test -- test/tools/grep.test.ts test/extension/register.test.ts test/tools/undo.test.ts` — passed, 30 tests.
  - `cd pi-hashline-edit-merged && npm test` — passed, 36 files / 288 tests.
  - `cd pi-hashline-edit-merged && grep -RIn "LINE#\|#HASH\|0-9 A-F\|2-character\|range: \[" README.md AGENTS.md tool-descriptions src test || true` — remaining matches are allowed debug display, migration notes, or rejected-input tests.
  - `cd pi-hashline-edit-merged && npm pack --dry-run` — passed; tarball includes `extensions/core.ts`, `extensions/insert.ts`, `extensions/grep.ts`, `extensions/undo.ts`, `src/`, `tool-descriptions/`, `README.md`, `LICENSE`, and `package.json`; no `extensions/tool-usage.ts`, `profiling/`, or `node_modules/` appeared.

## Spec Alignment Verdict
- Pass
- Reason: Implemented/staged Phase 5 work matches the selected phase, design constraints, and acceptance criteria. No required behavior mismatch or blocking plan deviation was found.

## Required Fixes
1. None.
