# Spec Review Summary

## What Was Done Well
- Current package is correctly named `pi-hashline-edit-merged` and uses focused defaults: `read`, `edit`, `insert`; `grep`/`undo` remain optional.
- Hash core mostly matches YuGiMob: `xxhash-wasm`, 3-char base64url anchors, `ensureHasherReady()`, and per-file collision retry in `src/hash-format.ts`.
- `read`, `grep`, and `formatHashlineRegion()` generally share stored per-file hashes for displayed anchors.
- `edit`/`insert` schemas use hash-only anchors and reject line-qualified anchors.
- JoshMock’s `current` idea is implemented as optional single-line validation.
- Jerry-style queue, atomic write, stale recovery, merge fallback, boundary warnings, and doom-loop warnings are present.

## Requirement Mismatches

### Critical

#### Legacy `oldText`/`newText` compatibility is likely unreachable through Pi schema validation
- Files: `src/edit.ts:29`, `src/edit.ts:493`, `src/edit-normalize.ts:123`, `test/tools/edit.test.ts`
- Problem: Design requires native-style `oldText`/`newText` compatibility when anchored edits are absent. Current `execute()` can normalize that shape, but the registered schema only allows `{ path, edits }` with `additionalProperties: false`, and tests assert there is no `prepareArguments` shim. If Pi validates before `execute()`, legacy calls are rejected before normalization.
- Why it matters: This makes a documented compatibility feature unreliable in the real tool path.
- Recommended fix: Add schema/prepare support that allows legacy top-level `oldText`/`newText` to reach normalization, or update the design to remove this requirement.
- Timing: Must fix now

#### Diff anchors are not perfect per-file hashes
- Files: `src/edit-diff.ts:81`, `src/edit-diff.ts:86`, `src/hashline.ts:49`
- Problem: `generateDiffString()` computes diff anchors with `computeLineHash(newFileLines, index)`, which returns the base line hash, not the collision-resolved per-file hash array.
- Why it matters: For repeated lines, `details.diff` can contain duplicate or unusable anchors. This violates the invariant that anchors come from one perfect per-file hash array and breaks prompts/tests that treat successful edit diffs as a fresh anchor source.
- Recommended fix: Build `buildHashlineFile(newContent)` once in diff generation and use `file.lineHashes[newLineNum - 1]`.
- Timing: Must fix now

#### Successful mutation text omits fresh anchors required by design
- Files: `src/edit-response.ts:130`, `src/edit-response.ts:135`, `test/tools/edit.text-shape.test.ts`, `test/integration/chained-edit-anchors.test.ts`
- Problem: Design says successful mutation text should include fresh hashline anchors around changed regions. Current model-visible text is only `Applied changes... Classification...`; tests explicitly assert anchors are absent from text and only in `details.diff`.
- Why it matters: If `details` is host-only as the design states, the model cannot chain edits from a successful mutation without another `read`.
- Recommended fix: Either add compact changed-region anchors to model-visible text, or update the design/tests/prompts to make “diff in details only” the intended contract.
- Timing: Must fix now if design is authoritative

#### Diff-row rejection misses current deletion diff rows
- Files: `src/hashline.ts:89`, `src/hashline.ts:200`, `src/edit-diff.ts:77`, `test/tools/edit.text-shape.test.ts:76`
- Problem: Current deletion diff rows are like `-2   │bbb`, but `DIFF_MINUS_RE = /^-\s*\d+\s{4}/` expects four spaces after the line number. Those own-tool deletion rows are not rejected if pasted into `lines`.
- Why it matters: Design explicitly forbids silently accepting diff rows as literal replacement content.
- Recommended fix: Update deletion-row detection to match the actual 3-char diff format and add a regression test with `-2   │bbb`.
- Timing: Must fix now

### Important

#### Optional `undo` does not check divergence before overwrite
- Files: `src/undo.ts`
- Problem: Design requires undo to reject or warn when the file diverged unsafely. Current undo stores only the pre-edit snapshot and overwrites current content with it if different.
- Why it matters: Enabling optional undo can erase unrelated edits made after the hashline mutation.
- Recommended fix: Store expected post-edit content or snapshot id and reject/warn if current content differs.
- Timing: Should fix before promoting `undo`

#### Test coverage does not pin several design requirements
- Files: `test/core/edit-normalize.test.ts`, `test/core/edit-diff.utils.test.ts`
- Problem: No tests cover real tool-path legacy normalization, repeated-line diff anchors, or current deletion diff-row rejection.
- Why it matters: Existing tests pass intent around many protocol points but miss the highest-risk gaps above.
- Recommended fix: Add focused regression tests for each critical mismatch.
- Timing: Should fix with implementation changes

### Suggestions

#### Directory read error references unavailable `ls`
- Files: `src/read.ts`
- Problem: Directory error says “Use ls,” but this focused package intentionally does not include `ls`.
- Recommended fix: Reword to “read a specific file” or rely on Pi/core available tools if applicable.

## Plan Deviations
- Current code intentionally diverges from YuGiMob’s terminal-newline sentinel behavior: `computeLineHashes("alpha\n")` returns one visible-line hash, not an extra empty-line hash. This seems acceptable and aligns with current package invariants/tests.
- Current diff output remains line-qualified (`+2#abc│...`) in `details.diff`, while default read/grep output is hash-only. This is acceptable only if `details.diff` is truly host/UI-only; it conflicts with prompts/tests that tell models to use diff output as anchor source.

## Scope Creep / Missing Scope
- Missing scope: real legacy `oldText`/`newText` compatibility through registered tool validation.
- Missing scope: safe undo divergence handling.
- No unwanted broad readmap features found.

## Tests and Verification
- Static review completed against design, current code, and named references.
- `npm test` could not run: `vitest: not found` / exit `127`. Dependencies appear not installed in this workspace.

## Verdict
- Request changes.

## Recommended Next Actions
1. Fix `edit-diff` to use per-file collision-resolved hashes and add repeated-line diff tests.
2. Decide whether mutation text must include fresh anchors; then update code/tests/design consistently.
3. Make legacy normalization reachable through Pi schema validation or remove it from the design.