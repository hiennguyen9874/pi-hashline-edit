# Phase 3: Update Core Read/Edit/Insert Protocol

**Goal:** Rewire the copied JerryAZR runtime to use default hash-only `HASH│content` output and hash-only `edit`/`insert` anchors for the core exact/live-resolution path.

**Tasks:** 3 related tasks.

### Task 1: Rewire hashline engine to 3-character hash-only anchors

**Files:**
- Modify: `pi-hashline-edit-merged/src/hashline.ts`
- Modify: `pi-hashline-edit-merged/src/fuzzy-match.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline.hash.test.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline.parse.test.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline.resolve.test.ts`
- Modify: `pi-hashline-edit-merged/test/core/hashline.apply.test.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/parse.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/resolve.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/apply.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/hashline.ts`

- [ ] **Step 1: Write failing parser/hashline engine tests for hash-only anchors**

Update `test/core/hashline.parse.test.ts` and `test/core/hashline.hash.test.ts` to assert the new contract:

```ts
import { describe, expect, it, beforeAll } from "vitest";
import {
  buildHashlineFile,
  computeLineHash,
  formatHashlineRegion,
  resolveEditAnchors,
} from "../../src/hashline";
import { ensureHasherReady } from "../../src/hash-format";

describe("hash-only hashline contract", () => {
  beforeAll(async () => {
    await ensureHasherReady();
  });

  it("builds one unique 3-character hash per visible line", () => {
    const file = buildHashlineFile("}\n}\nconst x = 1;\n}");
    expect(file.lineHashes).toHaveLength(4);
    expect(new Set(file.lineHashes).size).toBe(4);
    expect(file.lineHashes.every((hash) => /^[A-Za-z0-9_\-]{3}$/.test(hash))).toBe(true);
  });

  it("formats hash-only anchors by default", () => {
    const text = formatHashlineRegion(["alpha", "beta"], 1, 2);
    expect(text).toMatch(/^[A-Za-z0-9_\-]{3}│alpha\n[A-Za-z0-9_\-]{3}│beta$/);
    expect(text).not.toMatch(/^\s*1#/);
  });

  it("rejects line-qualified anchors in mutating requests", () => {
    expect(() => resolveEditAnchors([
      { range: ["1#abc", "1#abc"], lines: ["x"] } as any,
    ])).toThrow(/E_BAD_REF|hash alone|no line numbers/);
  });
});
```

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/hashline.hash.test.ts test/core/hashline.parse.test.ts
```

Expected: FAIL while `src/hashline.ts` still uses 2-character `LINE#HASH` parsing.

- [ ] **Step 2: Replace hash computation and display in `src/hashline.ts`**

In `pi-hashline-edit-merged/src/hashline.ts`:

- Import the new hash/display helpers:

```ts
import { computeLineHashes, computeLineHash as computeSingleLineHash, HASH_RE, HASH_CHARS_CLASS } from "./hash-format";
import { ANCHOR_SEP, CONTENT_SEP, formatAnchorPrefix } from "./anchor-display";
```

- Remove JerryAZR’s FNV constants, `DICT`, `HEX`, and neighbor-context `fnvHash` implementation.
- Keep `normalizeLine(line)` as an exported compatibility helper, implemented through `canonicalizeLine` semantics: remove `\r` and trim trailing whitespace.
- Add a compatibility `computeLineHash(fileLines, index)` wrapper used by existing tests/diff helpers:

```ts
export function computeLineHash(fileLines: readonly string[], index: number): string {
  return computeSingleLineHash(fileLines[index] ?? "");
}
```

- Change `buildHashlineFile(content)` so `lineHashes` comes from `computeLineHashes(content)`, and assert `lineHashes.length === lines.length`.
- Change `formatHashlineRegion(lines, startLine, endLine)` so it uses `formatAnchorPrefix({ line: lineNumber, hash, lineNumberWidth })` and default output is `HASH│content`.

Expected formatting examples:

```text
aB3│function hello() {
xY7│  return 1;
```

With `PI_HASHLINE_ANCHOR_DISPLAY=line-hash`:

```text
1#aB3│function hello() {
2#xY7│  return 1;
```

- [ ] **Step 3: Replace anchor parsing with hash-only validation**

In `src/hashline.ts`, change `Anchor` and parsing behavior:

```ts
export type Anchor = { hash: string; line?: number };
```

`parseAnchorRef(ref: string)` must:

- accept only a trimmed 3-character hash matching `HASH_RE`
- reject strings beginning with digits, including `1#aB3`
- reject copied display lines such as `aB3│content`
- reject empty strings

Required error examples:

```text
[E_BAD_REF] Invalid anchor. Expected a 3-character base64url hash such as "aB3".
[E_BAD_REF] Invalid anchor "1#aB3". Use the hash alone; line numbers are display-only.
[E_BAD_REF] Invalid anchor "aB3│content". Copy only the 3-character hash before │.
```

Keep the internal `HashlineEdit` operation shape as `op: "replace" | "append" | "prepend"` for now so `edit.ts` and `insert.ts` can continue using one mutation engine.

- [ ] **Step 4: Update exact partitioning to resolve by unique live hash**

In `src/fuzzy-match.ts`, adapt `partitionExact` to work with hash-only anchors:

- Build a map from `file.lineHashes` to 1-indexed line numbers.
- A ref matches only when its hash appears exactly once.
- Return matched edits with `pos.line` and `end.line` filled from the live file.
- Return unmatched edits when a hash is absent or ambiguous.
- Preserve range order: if resolved start line is greater than end line, leave the edit unmatched so `validateAnchors` or mismatch formatting can reject with a clear message.

Representative helper shape:

```ts
function resolveUniqueHash(file: HashlineFile, hash: string): number | null {
  const matches: number[] = [];
  file.lineHashes.forEach((lineHash, index) => {
    if (lineHash === hash) matches.push(index + 1);
  });
  return matches.length === 1 ? matches[0]! : null;
}
```

For this task, `fuzzyMatch` may call the same unique-hash resolver and emit `[W_RELOCATED]` only when an incoming edit carried a previous `line` value and the live line differs. Snapshot merge refinement happens in Phase 4.

- [ ] **Step 5: Run core hashline tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- \
  test/core/hash-format.test.ts \
  test/core/anchor-display.test.ts \
  test/core/hashline.hash.test.ts \
  test/core/hashline.parse.test.ts \
  test/core/hashline.resolve.test.ts \
  test/core/hashline.apply.test.ts
```

Expected: PASS after updating old `LINE#HH` expectations to `HHH` hash-only expectations.

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/src/hashline.ts pi-hashline-edit-merged/src/fuzzy-match.ts pi-hashline-edit-merged/test/core
git commit -m "feat(hashline): use hash-only perfect anchors"
```

### Task 2: Update `read` output and read snapshots

**Files:**
- Modify: `pi-hashline-edit-merged/src/read.ts`
- Modify: `pi-hashline-edit-merged/src/read-snapshot.ts` if snapshot type assumes line-qualified anchors
- Modify: `pi-hashline-edit-merged/test/tools/read.test.ts`
- Modify: `pi-hashline-edit-merged/test/core/read-snapshot.test.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/read.ts`

- [ ] **Step 1: Write failing read-output tests**

Update `test/tools/read.test.ts` to include:

```ts
it("returns hash-only anchors by default", async () => {
  const file = await writeFixture("sample.ts", "const a = 1;\nconst b = 2;\n");
  const result = await executeRead({ path: file });
  const text = result.content[0].text;
  expect(text).toMatch(/^[A-Za-z0-9_\-]{3}│const a = 1;\n[A-Za-z0-9_\-]{3}│const b = 2;/);
  expect(text).not.toContain("1#");
});

it("supports line-number display through PI_HASHLINE_ANCHOR_DISPLAY", async () => {
  process.env.PI_HASHLINE_ANCHOR_DISPLAY = "line-hash";
  try {
    const file = await writeFixture("sample.ts", "alpha\nbeta\n");
    const result = await executeRead({ path: file });
    expect(result.content[0].text).toMatch(/^1#[A-Za-z0-9_\-]{3}│alpha\n2#[A-Za-z0-9_\-]{3}│beta/);
  } finally {
    delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
  }
});
```

Use the fixture helper names already present in the copied `test/tools/read.test.ts`; if they differ, adapt only the setup while preserving these assertions.

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/read.test.ts
```

Expected: FAIL until `read` awaits hasher readiness and uses new formatting.

- [ ] **Step 2: Await hasher readiness in `registerReadTool`**

In `src/read.ts`:

- Import `ensureHasherReady` from `./hash-format`.
- At the start of `execute`, before `formatHashlineReadPreview`, call:

```ts
await ensureHasherReady();
```

Keep raw mode unchanged: `raw: true` returns plain file text without anchors.

- [ ] **Step 3: Ensure snapshots store the same hashes shown to the model**

`read.ts` currently calls `setReadSnapshot` after reading. Verify that the snapshot stores a `HashlineFile` built by `buildHashlineFile(normalizedText)` after hasher readiness. If the snapshot test imports old line-qualified anchors, update it so it asserts:

```ts
expect(snapshot.file.lineHashes.every((hash) => /^[A-Za-z0-9_\-]{3}$/.test(hash))).toBe(true);
expect(new Set(snapshot.file.lineHashes).size).toBe(snapshot.file.lineHashes.length);
```

- [ ] **Step 4: Run read tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/read.test.ts test/core/read-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-hashline-edit-merged/src/read.ts pi-hashline-edit-merged/src/read-snapshot.ts pi-hashline-edit-merged/test/tools/read.test.ts pi-hashline-edit-merged/test/core/read-snapshot.test.ts
git commit -m "feat(read): emit hash-only anchors by default"
```

### Task 3: Update `edit` and `insert` schemas to hash-only anchors

**Files:**
- Modify: `pi-hashline-edit-merged/src/edit.ts`
- Modify: `pi-hashline-edit-merged/src/insert.ts`
- Modify: `pi-hashline-edit-merged/src/mutation.ts`
- Modify: `pi-hashline-edit-merged/tool-descriptions/edit.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/edit-snippet.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/insert.md`
- Modify: `pi-hashline-edit-merged/test/tools/edit.test.ts`
- Modify: `pi-hashline-edit-merged/test/tools/insert.test.ts`
- Modify: `pi-hashline-edit-merged/test/tools/edit.preview.test.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/edit.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/insert.ts`
- Reference: `JoshMock-hashline-edit/index.ts` (`current` field rationale)

- [ ] **Step 1: Write failing edit/insert schema tests**

Update `test/tools/edit.test.ts` and `test/tools/insert.test.ts` with these behaviors:

```ts
it("edits a single line using hash-only start/end anchors", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\ngamma\n");
  const readResult = await executeRead({ path: file });
  const beta = readResult.content[0].text.match(/^([A-Za-z0-9_\-]{3})│beta$/m)![1];

  const result = await executeEdit({
    path: file,
    edits: [{ start: beta, end: beta, lines: ["BETA"] }],
  });

  expect(result.isError).not.toBe(true);
  expect(await readText(file)).toBe("alpha\nBETA\ngamma\n");
});

it("rejects line-qualified edit anchors", async () => {
  const file = await writeFixture("sample.ts", "alpha\n");
  await expectExecuteEditError({
    path: file,
    edits: [{ start: "1#aB3", end: "1#aB3", lines: ["ALPHA"] }],
  }, /E_BAD_REF|line numbers are display-only/);
});

it("inserts after a hash-only anchor", async () => {
  const file = await writeFixture("sample.ts", "alpha\ngamma\n");
  const readResult = await executeRead({ path: file });
  const alpha = readResult.content[0].text.match(/^([A-Za-z0-9_\-]{3})│alpha$/m)![1];

  const result = await executeInsert({
    path: file,
    edits: [{ anchor: alpha, direction: "after", lines: ["beta"] }],
  });

  expect(result.isError).not.toBe(true);
  expect(await readText(file)).toBe("alpha\nbeta\ngamma\n");
});
```

Use existing fixture helpers in copied tests. Keep assertions focused on behavior, not exact hash values.

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/edit.test.ts test/tools/insert.test.ts
```

Expected: FAIL while schemas still require `range` and `LINE#HH` anchors.

- [ ] **Step 2: Change `edit` public schema and normalization**

In `src/edit.ts`:

- Replace `range: string[2]` with fields:

```ts
const editEntrySchema = Type.Object(
  {
    start: Type.String({ description: "3-character hash anchor copied from read output; no line number or content" }),
    end: Type.String({ description: "3-character hash anchor copied from read output; use same hash for single-line edits" }),
    lines: Type.Array(Type.String(), { description: "New content lines. Use [] to delete." }),
    current: Type.Optional(Type.String({ description: "Optional exact current line text for single-line replacements." })),
  },
  { additionalProperties: false },
);
```

- Update `normalizeEditItems`:

```ts
export function normalizeEditItems(edits: Record<string, unknown>[]): HashlineToolEdit[] {
  return edits.map((edit) => ({
    op: "replace",
    pos: edit.start as string,
    end: edit.end as string,
    lines: (edit.lines as string[]) || [],
    ...(typeof edit.current === "string" ? { current: edit.current } : {}),
  }));
}
```

- Update previews and rendered text so they say `replace <start>-<end>`, not `range [LINE#HASH, LINE#HASH]`.
- Import and await `ensureHasherReady()` before preview/mutation paths that build hashline files.

- [ ] **Step 3: Add optional `current` validation**

In `src/hashline.ts` and the internal `HashlineToolEdit`/`HashlineEdit` types, add `current?: string`.

During span resolution, after the start/end anchors resolve to live lines and before applying the edit:

```ts
if (edit.current !== undefined && startLine === endLine) {
  const actual = file.lines[startLine - 1] ?? "";
  if (actual !== edit.current) {
    throw new Error(`[E_CURRENT_MISMATCH] Anchor ${edit.pos.hash} current text mismatch. Expected ${JSON.stringify(edit.current)}, found ${JSON.stringify(actual)}.`);
  }
}
```

Rules:

- `current` is optional.
- Validate it only for single-line replacements.
- Do not require it.
- Do not autocorrect whitespace.

Add tests:

```ts
it("validates optional current text when supplied", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\n");
  const anchor = extractAnchorForLine(await executeRead({ path: file }), "beta");
  await expectExecuteEditError({
    path: file,
    edits: [{ start: anchor, end: anchor, current: "not beta", lines: ["BETA"] }],
  }, /E_CURRENT_MISMATCH/);
});

it("does not require current for single-line edit", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\n");
  const anchor = extractAnchorForLine(await executeRead({ path: file }), "beta");
  const result = await executeEdit({ path: file, edits: [{ start: anchor, end: anchor, lines: ["BETA"] }] });
  expect(result.isError).not.toBe(true);
});
```

If `extractAnchorForLine` does not exist, add a local helper in the test file:

```ts
function extractAnchor(text: string, line: string): string {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^([A-Za-z0-9_\\-]{3})│${escaped}$`, "m"));
  if (!match) throw new Error(`No anchor for ${line}`);
  return match[1]!;
}
```

- [ ] **Step 4: Change `insert` public schema to hash-only anchors**

In `src/insert.ts`:

- Update schema description for `anchor` to: `3-character hash anchor copied from read output; no line number or content`.
- Keep `direction: "after" | "before"` and `lines` unchanged.
- Keep internal normalization to `append`/`prepend`, but pass only `pos: anchor`.
- Await `ensureHasherReady()` in preview and execute paths before resolving anchors.
- Update preview output from `insert after 5#A3` to `insert after aB3`.

- [ ] **Step 5: Update tool descriptions**

Update `tool-descriptions/edit.md`, `edit-snippet.md`, and `insert.md` so examples use:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "start": "aB3", "end": "aB3", "lines": ["  console.log('hashline');"] }
  ]
}
```

and:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "anchor": "xY7", "direction": "after", "lines": ["import { foo } from './lib';"] }
  ]
}
```

Descriptions must explicitly say:

```text
Copy only the 3-character hash before │. Do not include line numbers, #, │, or content.
```

- [ ] **Step 6: Run core tool tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- \
  test/tools/read.test.ts \
  test/tools/edit.test.ts \
  test/tools/edit.preview.test.ts \
  test/tools/insert.test.ts \
  test/core/hashline.apply.test.ts \
  test/core/hashline.resolve.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pi-hashline-edit-merged/src/edit.ts pi-hashline-edit-merged/src/insert.ts pi-hashline-edit-merged/src/mutation.ts pi-hashline-edit-merged/src/hashline.ts pi-hashline-edit-merged/tool-descriptions pi-hashline-edit-merged/test/tools pi-hashline-edit-merged/test/core
git commit -m "feat(tools): switch edit and insert to hash-only anchors"
```

## Phase Verification

- [ ] Hashline core tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/hashline.hash.test.ts test/core/hashline.parse.test.ts test/core/hashline.resolve.test.ts test/core/hashline.apply.test.ts`
- [ ] Read/edit/insert focused tests pass: `cd pi-hashline-edit-merged && npm test -- test/tools/read.test.ts test/tools/edit.test.ts test/tools/insert.test.ts`
- [ ] Tool descriptions contain no `LINE#HASH` examples except where documenting rejected line-number display mode.
- [ ] `read` default output contains `HASH│content`; `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` output contains `LINE#HASH│content`; mutating tools still accept only `HASH`.
