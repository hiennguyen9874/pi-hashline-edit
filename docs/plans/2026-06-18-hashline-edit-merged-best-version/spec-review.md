# Spec Review Summary

## Status

Resolved after implementation updates on 2026-06-18.

## What Was Done Well

- Current package is correctly named `pi-hashline-edit-merged` and uses focused defaults: `read`, `edit`, `insert`; `grep`/`undo` remain optional.
- Hash core matches the selected protocol: `xxhash-wasm`, 3-character base64url anchors, `ensureHasherReady()`, and per-file collision retry in `src/hash-format.ts`.
- `read`, `grep`, `formatHashlineRegion()`, and edit diffs now share collision-resolved per-file hashes for displayed anchors.
- `edit`/`insert` mutating anchors remain hash-only and reject line-qualified anchors.
- JoshMock’s `current` idea is implemented as optional single-line validation.
- Jerry-style queue, atomic write, stale recovery, merge fallback, boundary warnings, and doom-loop warnings are present.

## Resolved Requirement Mismatches

### Legacy `oldText`/`newText` compatibility through Pi schema validation

- Files: `src/edit.ts`, `src/edit-normalize.ts`, `test/tools/edit.test.ts`
- Resolution: `hashlineEditToolSchema` now accepts anchored edit requests plus legacy top-level `oldText`/`newText` and `old_text`/`new_text` compatibility shapes.
- Runtime behavior: legacy requests still normalize through `normalizeEditRequest()` to exact unique hashline edits and emit `[W_LEGACY_NORMALIZED]`.
- Coverage: schema validation and registered tool-path legacy normalization are covered in `test/tools/edit.test.ts`.

### Diff anchors use perfect per-file hashes

- Files: `src/edit-diff.ts`, `test/core/edit-diff.utils.test.ts`
- Resolution: `generateDiffString()` now builds `buildHashlineFile(newContent)` once and uses `newFile.lineHashes[newLineNum - 1]` for context/addition rows.
- Coverage: repeated-line diff regression confirms duplicate content receives collision-resolved distinct anchors.

### Successful mutation text includes fresh anchors

- Files: `src/edit-response.ts`, `test/tools/edit.text-shape.test.ts`, `test/integration/chained-edit-anchors.test.ts`
- Resolution: successful changed responses now include a compact `Fresh anchors:` block derived from the changed-region diff, while keeping the full unified diff in `details.diff`.
- Coverage: integration test now chains a second edit from model-visible fresh anchors rather than host-only details.

### Diff-row rejection catches current deletion rows

- Files: `src/hashline.ts`, `test/core/hashline.parse.test.ts`
- Resolution: deletion diff row detection now matches current own-tool rows such as `-2   │bbb`.
- Coverage: array and string-form current deletion diff rows are rejected with `[E_INVALID_PATCH]`.

### Optional `undo` checks divergence before overwrite

- Files: `src/edit.ts`, `src/mutation.ts`, `src/undo.ts`, `test/tools/undo.test.ts`
- Resolution: edit mutations now emit both pre-edit and expected post-edit content. `undo` rejects with `[E_UNDO_DIVERGED]` if the current file no longer matches the expected post-edit content.
- Coverage: undo success, slot consumption, age rejection, and divergence rejection are covered.

### Directory errors no longer reference unavailable `ls`

- Files: `src/read.ts`, `src/edit.ts`
- Resolution: directory guidance now tells users to read a specific file instead of suggesting `ls`.

## Remaining Plan Deviations

- Terminal-newline sentinel behavior intentionally differs from YuGiMob: `computeLineHashes("alpha\n")` returns one visible-line hash, not an extra empty-line hash. This aligns with current package invariants and tests.
- `details.diff` remains line-qualified (`+2#abc│...`) for UI/host rendering. Model-visible successful mutation text now also provides hash-only fresh anchors, so chaining no longer depends on host-only details.

## Scope Check

- No broad readmap features were added.
- `ls`, `find`, `ast_search`, readmap structural maps, bash compression, auto-read, tool-usage, and syntax validation remain out of scope.
- `grep` and `undo` remain optional modules.

## Tests and Verification

- Installed dependencies with `npm ci` because `vitest` was initially missing.
- Updated `vitest.config.ts` to explicitly include `test/**/*.test.ts`.
- Focused regression tests passed.
- Full suite passed: `npm test` → `34 passed`.

## Verdict

- Approved after fixes.

## Recommended Next Actions

- No blocking spec-review actions remain.
