# Phase 4: Adapt Recovery, Safety, Legacy Normalization, and Doom-Loop Warnings

**Goal:** Complete the selected safety behavior: warned live relocation classification, snapshot 3-way merge for absent anchors, strict prefix rejection, exact-unique legacy normalization, and core repeated-call warnings.

**Tasks:** 3 related tasks.

### Task 1: Finish hash-only recovery tiers

**Files:**
- Modify: `pi-hashline-edit-merged/src/fuzzy-match.ts`
- Modify: `pi-hashline-edit-merged/src/mutation.ts`
- Modify: `pi-hashline-edit-merged/src/hashline.ts`
- Modify: `pi-hashline-edit-merged/src/read-snapshot.ts` if snapshot shape needs original line positions
- Modify: `pi-hashline-edit-merged/test/core/fuzzy-match.test.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline.recovery.test.ts`
- Modify: `pi-hashline-edit-merged/test/integration/merge-fallback.test.ts`
- Modify: `pi-hashline-edit-merged/test/integration/stale-position-compound.test.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/mutation.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/fuzzy-match.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/merge.ts`

- [ ] **Step 1: Write recovery tests for hash-only anchors**

Update `test/core/fuzzy-match.test.ts` to remove assumptions about `line#hash` anchors and assert unique hash lookup:

```ts
it("resolves a moved anchor by unique live hash and warns when snapshot line changed", () => {
  const original = buildHashlineFile("a\nb\nc\n");
  const current = buildHashlineFile("x\na\nb\nc\n");
  const edit = {
    op: "replace" as const,
    pos: { hash: original.lineHashes[2]!, line: 3 },
    end: { hash: original.lineHashes[2]!, line: 3 },
    lines: ["C"],
  };

  const result = fuzzyMatch([edit], current);

  expect(result.matched).toHaveLength(1);
  expect(result.matched[0]!.pos.line).toBe(4);
  expect(result.warnings).toContain("[RELOCATED] 1 range(s) relocated via hash matching. Please review the diff carefully.");
});

it("leaves absent hashes unmatched for snapshot merge", () => {
  const current = buildHashlineFile("a\nb\n");
  const result = fuzzyMatch([
    { op: "replace", pos: { hash: "ZZZ" }, end: { hash: "ZZZ" }, lines: ["X"] },
  ], current);
  expect(result.matched).toHaveLength(0);
  expect(result.unmatched).toHaveLength(1);
});
```

Update `test/integration/merge-fallback.test.ts` so it follows this flow:

1. `read` file and capture hash for a line.
2. Modify the file externally so the hash is absent from live content but present in the read snapshot.
3. Call `edit` with the old hash.
4. Expect result text to contain `[MERGED]` when `threeWayMerge` succeeds, or `[E_STALE_ANCHOR]` when the merge cannot be safely computed.

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/fuzzy-match.test.ts test/integration/merge-fallback.test.ts
```

Expected: FAIL until recovery is fully adapted.

- [ ] **Step 2: Define hash-only match result semantics**

In `src/fuzzy-match.ts`, keep the exported names `partitionExact` and `fuzzyMatch` to minimize changes in `mutation.ts`, but update meanings:

- `partitionExact(edits, file)` resolves anchors by unique live hash. It returns matched edits with `line` filled in.
- If an edit already has `line` metadata from a snapshot and the live line is the same, no warning.
- `fuzzyMatch(edits, file)` also resolves by unique live hash, but emits `[RELOCATED]` when any resolved line differs from supplied snapshot line metadata.
- Absent hashes remain unmatched for snapshot merge.
- Ambiguous hashes remain unmatched and should later become `[E_AMBIGUOUS_ANCHOR]` through mismatch formatting.

Representative behavior:

```ts
const resolvedStart = resolveUniqueHash(currentFile, edit.pos.hash);
const resolvedEnd = resolveUniqueHash(currentFile, edit.end?.hash ?? edit.pos.hash);
if (resolvedStart === null || resolvedEnd === null || resolvedStart > resolvedEnd) {
  unmatched.push(edit);
  continue;
}
const relocated = edit.pos.line !== undefined && edit.pos.line !== resolvedStart;
matched.push({
  ...edit,
  pos: { ...edit.pos, line: resolvedStart },
  end: edit.end ? { ...edit.end, line: resolvedEnd } : undefined,
});
```

- [ ] **Step 3: Preserve snapshot line metadata for recovery**

When `read` stores a snapshot, it already stores `HashlineFile` with `lineHashes`. Ensure `resolveEditAnchors` can attach previous line metadata when available during mutation:

- In `mutation.ts`, after `const snapshot = getReadSnapshot(absolutePath)`, enrich unresolved tool edits with snapshot lines when their hashes appear uniquely in the snapshot.
- Use that metadata for relocation warnings and snapshot merge span resolution.
- Do not require the model to send line numbers.

If keeping this logic in `mutation.ts` becomes hard to test, add an exported helper in `src/fuzzy-match.ts`:

```ts
export function attachSnapshotLines(edits: HashlineEdit[], snapshotFile: HashlineFile): HashlineEdit[]
```

It must copy edits and fill `pos.line`/`end.line` only for unique snapshot hash matches.

- [ ] **Step 4: Adapt stale error formatting**

In `src/hashline.ts`, change `formatMismatchError` for hash-only anchors:

- For absent hashes: `[E_STALE_ANCHOR] stale anchor "aB3". Call read() to get fresh anchors.`
- For ambiguous hashes: `[E_AMBIGUOUS_ANCHOR] anchor "aB3" matches lines 1, 3.` and include up to five `HASH│content` sample lines.
- Do not mention copying `LINE#HASH`.

Add or update tests in `test/core/hashline.recovery.test.ts`:

```ts
expect(error.message).toContain("[E_STALE_ANCHOR]");
expect(error.message).toContain("Call read() to get fresh anchors");
expect(error.message).not.toContain("LINE#HASH");
```

- [ ] **Step 5: Run recovery tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- \
  test/core/fuzzy-match.test.ts \
  test/core/hashline.recovery.test.ts \
  test/integration/merge-fallback.test.ts \
  test/integration/stale-position-compound.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/src/fuzzy-match.ts pi-hashline-edit-merged/src/mutation.ts pi-hashline-edit-merged/src/hashline.ts pi-hashline-edit-merged/src/read-snapshot.ts pi-hashline-edit-merged/test/core pi-hashline-edit-merged/test/integration
git commit -m "feat(recovery): adapt stale handling to hash-only anchors"
```

### Task 2: Add strict safety and legacy normalization

**Files:**
- Create: `pi-hashline-edit-merged/src/edit-normalize.ts`
- Modify: `pi-hashline-edit-merged/src/edit.ts`
- Modify: `pi-hashline-edit-merged/src/hashline.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline-strict-input.test.ts`
- Modify: `pi-hashline-edit-merged/test/tools/edit.text-shape.test.ts`
- Modify: `pi-hashline-edit-merged/test/tools/edit.test.ts`
- Reference: `RimuruW-pi-hashline-edit/src/edit-normalize.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/resolve.ts` (`assertNoBareHashPrefixLines`)
- Reference: `JoshMock-hashline-edit/index.ts` (`current` validation rationale)

- [ ] **Step 1: Write failing strict-prefix and legacy tests**

Update `test/core/hashline-strict-input.test.ts`:

```ts
it("rejects bare HASH│ prefixes in replacement lines", async () => {
  await ensureHasherReady();
  const file = buildHashlineFile("alpha\nbeta\n");
  const copied = `${file.lineHashes[0]!}│alpha`;
  expect(() => resolveEditSpans(file, [{
    op: "replace",
    pos: { hash: file.lineHashes[1]!, line: 2 },
    end: { hash: file.lineHashes[1]!, line: 2 },
    lines: [copied],
  } as any])).toThrow(/E_BARE_HASH_PREFIX|E_INVALID_PATCH/);
});

it("rejects diff rows in replacement lines", () => {
  expect(() => hashlineParseText(["+aB3│alpha"])).toThrow(/E_INVALID_PATCH/);
  expect(() => hashlineParseText(["-1    alpha"])).toThrow(/E_INVALID_PATCH/);
});
```

Update `test/tools/edit.text-shape.test.ts`:

```ts
it("normalizes legacy oldText/newText only when oldText is exact and unique", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\n");
  const result = await executeEdit({ path: file, oldText: "beta", newText: "BETA" } as any);
  expect(result.isError).not.toBe(true);
  expect(result.content[0].text).toContain("[LEGACY_NORMALIZED]");
  expect(await readText(file)).toBe("alpha\nBETA\n");
});

it("rejects non-unique legacy oldText", async () => {
  const file = await writeFixture("sample.ts", "beta\nbeta\n");
  await expectExecuteEditError({ path: file, oldText: "beta", newText: "BETA" } as any, /E_LEGACY_NON_UNIQUE/);
});
```

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/hashline-strict-input.test.ts test/tools/edit.text-shape.test.ts
```

Expected: FAIL until safety and legacy normalization are implemented.

- [ ] **Step 2: Implement `edit-normalize.ts`**

Create `src/edit-normalize.ts` with one public function:

```ts
export type NormalizedEditRequest = {
  path: string;
  edits: Record<string, unknown>[];
  warnings: string[];
};

export function normalizeEditRequest(input: unknown, currentContent?: string): NormalizedEditRequest
```

Behavior:

- If `input` has `edits`, return it unchanged with `warnings: []` after shallow shape validation.
- If `input` has top-level `oldText`/`newText` or `old_text`/`new_text`, require `currentContent`.
- Count exact occurrences of `oldText` in `currentContent`.
- If zero: throw `[E_LEGACY_NOT_FOUND] oldText was not found exactly once.`
- If more than one: throw `[E_LEGACY_NON_UNIQUE] oldText matched N times; use read + hash anchors.`
- If exactly one: synthesize a single hashline edit by finding the affected line range in the current content, using current file hashes, and setting `lines` to `newText` split by newline.
- Return `warnings: ["[LEGACY_NORMALIZED] Converted exact unique oldText/newText request to hashline edit. Prefer read + hash anchors."]`.

Important: legacy normalization is exact-only. Do not trim, fuzzy-match, or patch partial near-misses.

- [ ] **Step 3: Wire normalization into `edit.ts` before schema assertion**

In `src/edit.ts`:

- When request lacks `edits` but has legacy text fields, read/normalize the target file first through the same `resolveEditTarget` path used by normal edits.
- Call `normalizeEditRequest(request, target.normalized)`.
- Pass normalized `edits` into `normalizeEditItems`.
- Include normalization warnings in the final response warnings.
- Do not expose legacy fields in the public TypeBox schema; the runtime compatibility path handles them when AJV is bypassed or model sends native shape.

- [ ] **Step 4: Strengthen bare-prefix rejection**

In `src/hashline.ts`:

- Add regexes based on `HASH_CHARS_CLASS`:

```ts
const HASHLINE_PREFIX_RE = new RegExp(`^\\s*(?:>>>|>>)?\\s*${HASH_CHARS_CLASS}│`);
const HASHLINE_PREFIX_PLUS_RE = new RegExp(`^\\+\\s*${HASH_CHARS_CLASS}│`);
const LINE_HASH_PREFIX_RE = new RegExp(`^\\s*\\d+\\s*#\\s*${HASH_CHARS_CLASS}│`);
const DIFF_MINUS_RE = /^-\s*\d+\s{4}/;
```

- `hashlineParseText` must throw `[E_INVALID_PATCH]` for `+HASH│`, `LINE#HASH│`, and diff minus rows.
- Span resolution must reject bare `HASH│content` lines with `[E_BARE_HASH_PREFIX]`, and the error should say whether the prefix matches a real file hash.

- [ ] **Step 5: Run safety tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- \
  test/core/hashline-strict-input.test.ts \
  test/tools/edit.text-shape.test.ts \
  test/tools/edit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/src/edit-normalize.ts pi-hashline-edit-merged/src/edit.ts pi-hashline-edit-merged/src/hashline.ts pi-hashline-edit-merged/test/core/hashline-strict-input.test.ts pi-hashline-edit-merged/test/tools/edit.text-shape.test.ts pi-hashline-edit-merged/test/tools/edit.test.ts
git commit -m "feat(edit): add strict safety and legacy normalization"
```

### Task 3: Add core doom-loop warnings

**Files:**
- Create: `pi-hashline-edit-merged/src/doom-loop.ts`
- Create: `pi-hashline-edit-merged/src/doom-loop-suggestions.ts`
- Create: `pi-hashline-edit-merged/test/core/doom-loop.test.ts`
- Modify: `pi-hashline-edit-merged/src/read.ts`
- Modify: `pi-hashline-edit-merged/src/edit.ts`
- Modify: `pi-hashline-edit-merged/src/insert.ts`
- Modify: `pi-hashline-edit-merged/test/tools/read.test.ts`
- Modify: `pi-hashline-edit-merged/test/tools/edit.test.ts`
- Reference: `coctostan-pi-hashline-readmap/src/doom-loop.ts`
- Reference: `coctostan-pi-hashline-readmap/src/doom-loop-suggestions.ts`

- [ ] **Step 1: Port focused doom-loop tests**

Create `test/core/doom-loop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  consumeDoomLoopWarning,
  createDoomLoopState,
  formatDoomLoopMessage,
  recordToolCall,
} from "../../src/doom-loop";

describe("doom-loop", () => {
  it("warns on the third identical call", () => {
    const state = createDoomLoopState();
    recordToolCall(state, "read", "1", { path: "a.ts" });
    recordToolCall(state, "read", "2", { path: "a.ts" });
    recordToolCall(state, "read", "3", { path: "a.ts" });
    const warning = consumeDoomLoopWarning(state, "3");
    expect(warning?.kind).toBe("identical-tail");
    expect(formatDoomLoopMessage(warning!)).toContain("REPEATED-CALL WARNING");
  });

  it("warns on a repeated two-step cycle", () => {
    const state = createDoomLoopState();
    for (const [id, toolName] of [["1", "read"], ["2", "edit"], ["3", "read"], ["4", "edit"], ["5", "read"], ["6", "edit"]] as const) {
      recordToolCall(state, toolName, id, { path: "a.ts" });
    }
    const warning = consumeDoomLoopWarning(state, "6");
    expect(warning?.kind).toBe("repeated-subsequence");
    expect(formatDoomLoopMessage(warning!)).toContain("ALTERNATING-CALL WARNING");
  });
});
```

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/doom-loop.test.ts
```

Expected: FAIL until files are created.

- [ ] **Step 2: Port focused doom-loop implementation**

Create `src/doom-loop.ts` by porting coctostan’s logic with no readmap-only dependencies. Keep:

- `MAX_RECENT_TOOL_CALLS = 24`
- `createDoomLoopState`
- `recordToolCall`
- `consumeDoomLoopWarning`
- `formatDoomLoopMessage`

Create `src/doom-loop-suggestions.ts` with suggestions only for tools in this package:

```ts
export const SUGGESTIONS: Record<string, readonly string[]> = {
  read: ["if file is large, try offset + limit", "if editing next, copy the 3-character hash before │"],
  edit: ["if hash mismatch keeps firing, re-read the file", "verify the anchor came from the latest read or grep", "use insert for pure additions"],
  insert: ["verify the anchor came from the latest read or grep", "use direction before or after", "do not include HASH│ prefixes in lines"],
  grep: ["try literal: true if the pattern has regex characters", "try a narrower path or glob"],
  undo: ["verify the target file has not diverged before undoing"],
};

export const GENERIC_SUGGESTION = "try a different approach; the repeating call is not making progress";
```

- [ ] **Step 3: Integrate warnings into core tools**

Use a module-level singleton state in `src/doom-loop.ts` or a tiny exported helper:

```ts
export const globalDoomLoopState = createDoomLoopState();
```

In `read.ts`, `edit.ts`, and `insert.ts` execute paths:

1. Call `recordToolCall(globalDoomLoopState, "read" | "edit" | "insert", toolCallId, params as Record<string, unknown>)` at the start.
2. After building a successful or error result object, call `consumeDoomLoopWarning(globalDoomLoopState, toolCallId)`.
3. If a warning exists, append `\n\n${formatDoomLoopMessage(warning)}` to the model-visible text.

For thrown errors in `edit`/`insert`, catch only where the tool already converts errors into result objects. Do not swallow abort errors or change mutation semantics.

- [ ] **Step 4: Add tool-level warning smoke test**

Add one test in `test/tools/read.test.ts` or `test/tools/edit.test.ts` that calls the same tool with same params three times and asserts the third response contains `REPEATED-CALL WARNING`.

Keep the test isolated by exporting and calling a reset helper if needed:

```ts
export function resetDoomLoopStateForTests(): void
```

- [ ] **Step 5: Run doom-loop tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/doom-loop.test.ts test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/src/doom-loop.ts pi-hashline-edit-merged/src/doom-loop-suggestions.ts pi-hashline-edit-merged/src/read.ts pi-hashline-edit-merged/src/edit.ts pi-hashline-edit-merged/src/insert.ts pi-hashline-edit-merged/test/core/doom-loop.test.ts pi-hashline-edit-merged/test/tools
git commit -m "feat(core): warn on repeated tool-call loops"
```

## Phase Verification

- [ ] Recovery tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/fuzzy-match.test.ts test/core/hashline.recovery.test.ts test/integration/merge-fallback.test.ts test/integration/stale-position-compound.test.ts`
- [ ] Safety tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/hashline-strict-input.test.ts test/tools/edit.text-shape.test.ts`
- [ ] Doom-loop tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/doom-loop.test.ts`
- [ ] Core tool tests pass together: `cd pi-hashline-edit-merged && npm test -- test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts`
