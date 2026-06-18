# Spec Review

## What Was Done Well
- The implementation uses the requested focused package identity and default extension surface: `package.json` enables only `./extensions/core.ts` and `./extensions/insert.ts`, while `grep` and `undo` remain separate optional extensions.
- The default read/grep anchor protocol was updated to hash-only `HHH│content`, with optional `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` display support.
- The hash implementation uses `xxhash-wasm`, a 3-character URL-safe alphabet, and per-file retry-based collision resolution so repeated identical lines receive unique anchors.
- `edit` and `insert` expose the requested split schemas using hash-only anchors, and tests cover line-qualified anchor rejection, optional `current` mismatch rejection, insert before/after behavior, legacy normalization, full-file deletion guard, grep default-disablement, and doom-loop warnings.
- Safety work was preserved or added for atomic writes, mutation queueing, strict rendered-prefix rejection, legacy exact-unique normalization, stale rejection/merge recovery, and optional undo/grep module availability.

## Requirement Mismatches
- **Problematic deviation: successful mutation output still exposes the full diff in model-visible text.**
  - Requirement: Design says default mutation text should be compact and host-only details should contain the full unified diff in `details.diff`; it explicitly says not to duplicate full diffs or broad file content in model text by default.
  - Evidence: `pi-hashline-edit-merged/src/edit-response.ts:135` builds the LLM-visible `text` from `diffResult.diff`, while `pi-hashline-edit-merged/src/edit-response.ts:151` also puts the same diff in `details.diff`.
  - Test evidence: `pi-hashline-edit-merged/test/tools/edit.text-shape.test.ts:7` names the current behavior as returning unified diff in LLM-visible text, and assertions at lines 31-33 require visible diff rows.
  - Why it matters: This contradicts the design's low-token output contract and duplicates host-only information into model text.

- **Problematic deviation: runtime fallback validation does not reject unknown root fields when Pi/AJV validation is unavailable.**
  - Requirement: Design says schema validation rejects unknown or malformed fields with specific, actionable error messages.
  - Evidence: `pi-hashline-edit-merged/test/tools/snapshot-id.test.ts:32` explicitly asserts that edit silently ignores an unknown root field. In execution, `pi-hashline-edit-merged/src/edit.ts:429` calls `assertEditRequest(params)` when `edits` is present, and `assertEditRequest` only checks top-level `path`/`edits`, not unknown fields.
  - Why it matters: The checked-in TypeBox schema has `additionalProperties: false`, but the implementation's own safety net permits malformed calls in environments where external validation is disabled, which weakens the design's actionable schema guardrail.

## Plan Deviations
- **Acceptable tradeoff: the implementation appears to include all five design phases despite the request not providing phase files.** The design caps medium work at no more than five phases; the package changes cover protocol upgrade, schemas, recovery/safety, optional modules, docs/tests, and no added phase structure was needed for this review.
- **Problematic deviation: model-visible mutation output diverges from the design's output contract.** This is the same issue listed above, tied specifically to the `Output contract` section of `design.md`.
- **No phase-x.md files were read by request.** The user explicitly said not to read `plan.md` or `phase-x.md`, so phase-specific scope compliance cannot be independently checked beyond the design's phase-count cap and design-level feature list.

## Scope Creep / Missing Scope
- **Scope creep: visible full diff is retained as a default model-facing behavior.** Classification: problematic deviation. The design requires compact default mutation text and host-only full diffs, so this is not just extra information; it changes the token budget and visible contract.
- **Scope creep: unknown root fields are tolerated by the direct execution path.** Classification: problematic deviation. The design requires rejection of unknown/malformed fields; keeping permissive runtime fallback is outside the requested strict schema behavior.
- **No evidence of readmap-style tool creep was found in changed package metadata.** `grep` and `undo` are optional; no default `ls`, `find`, `ast_search`, structural maps, NuShell, bash compression, auto-read, tool-usage, or syntax validation extension was identified in the changed file list.

## Tests vs Required Behavior
- Tests cover many required behaviors: 3-character hash format, repeated-line uniqueness, hash-only read output, optional line-hash display, edit and insert schemas, `current` mismatch rejection, legacy exact-unique normalization, stale rejection/merge paths, full-file deletion guard, optional `grep`/`undo` default-disabled registration, and doom-loop warnings.
- Tests currently encode at least one behavior that contradicts the design: `pi-hashline-edit-merged/test/tools/edit.text-shape.test.ts` expects full unified diff rows in model-visible mutation text instead of only `details.diff`.
- Tests also encode permissive unknown-field behavior: `pi-hashline-edit-merged/test/tools/snapshot-id.test.ts:32` expects an unknown `snapshotId` root field to be ignored when AJV is treated as responsible.
- I did not run the test suite for this spec review; findings are based on reading the design, changed code, and changed tests.

## Spec Alignment Verdict
- Fail
- Reason: Most of the requested merged package behavior is implemented, but the mutation output contract is directly contradicted by code and tests, and runtime validation does not fully enforce the design's unknown/malformed field rejection when external schema validation is bypassed.

## Required Fixes
1. Change successful edit/insert mutation responses so model-visible text is compact and does not include the full unified diff by default; keep the full diff in `details.diff`, and update `test/tools/edit.text-shape.test.ts` and related insert/edit expectations accordingly.
2. Make direct runtime request validation reject unknown top-level and edit-entry fields with actionable errors, or explicitly document that strict unknown-field rejection is delegated entirely to Pi/AJV and update the design. The smaller spec-aligned fix is to enforce it in `assertEditRequest`/`assertInsertRequest` and remove the permissive unknown-field test expectation.
