# Phase 5: Optional Modules, Documentation, and Final Hardening

**Goal:** Adapt disabled-by-default `grep` and `undo`, update public docs/prompts to the final protocol, and run the full validation suite.

**Tasks:** 3 related tasks.

### Task 1: Adapt optional `grep` to hash-only perfect anchors

**Files:**
- Modify: `pi-hashline-edit-merged/src/grep.ts`
- Modify: `pi-hashline-edit-merged/extensions/grep.ts` if registration metadata changes
- Modify: `pi-hashline-edit-merged/tool-descriptions/grep.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/grep-snippet.md`
- Modify: `pi-hashline-edit-merged/test/tools/grep.test.ts`
- Modify: `pi-hashline-edit-merged/test/extension/register.test.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/grep.ts`
- Reference: `pi-hashline-edit-merged/src/hash-format.ts`
- Reference: `pi-hashline-edit-merged/src/hashline.ts`

- [ ] **Step 1: Write failing grep tests for hash-only output and disabled default**

Update `test/tools/grep.test.ts`:

```ts
it("returns hash-only anchors that can be used by edit", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\ngamma\n");
  const grepResult = await executeGrep({ pattern: "beta", path: file, literal: true });
  const text = grepResult.content[0].text;
  const anchor = text.match(/^([A-Za-z0-9_\-]{3})│beta$/m)?.[1];
  expect(anchor).toBeDefined();

  const editResult = await executeEdit({
    path: file,
    edits: [{ start: anchor!, end: anchor!, lines: ["BETA"] }],
  });
  expect(editResult.isError).not.toBe(true);
  expect(await readText(file)).toBe("alpha\nBETA\ngamma\n");
});

it("does not emit line-qualified anchors by default", async () => {
  const file = await writeFixture("sample.ts", "alpha\nbeta\n");
  const result = await executeGrep({ pattern: "alpha", path: file, literal: true });
  expect(result.content[0].text).toMatch(/^[A-Za-z0-9_\-]{3}│alpha/m);
  expect(result.content[0].text).not.toMatch(/^\s*1#/m);
});
```

Update `test/extension/register.test.ts` to keep this assertion from Phase 1:

```ts
expect(packageJson.pi.extensions).toEqual([
  "./extensions/core.ts",
  "./extensions/insert.ts",
]);
```

and keep direct optional registration tests for `grep` and `undo`.

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/grep.test.ts test/extension/register.test.ts
```

Expected: FAIL while `grep` still computes context hashes and emits `LINE#HH│` anchors.

- [ ] **Step 2: Compute grep anchors from the full matched file content**

In `src/grep.ts`, remove use of `computeHashFromContext`. Perfect hashing requires the full file’s assigned hash array, so update grep formatting flow:

- For each file with at least one displayed match/context line, read the full file once with `readFileSync` or `fs.promises.readFile`.
- Normalize line endings the same way `read` does: strip BOM from first line and normalize CRLF to LF.
- Call `await ensureHasherReady()` before computing hashes.
- Build a `HashlineFile` or call `computeLineHashes(normalizedContent)` once per file.
- When formatting a displayed line number `N`, use `fileHashes[N - 1]`.
- Format with `formatAnchorPrefix({ line: N, hash, lineNumberWidth })` so env line-number display mode is consistent with `read`.

Important behavior:

- If a ripgrep JSON line is truncated by grep output limits, still hash the full file line from the file read, not the truncated display string.
- If the file cannot be read after ripgrep found it, return a clear per-file error block and continue with other files if the current grep implementation already supports partial results; otherwise fail the tool with `Cannot read matched file: <path>`.

- [ ] **Step 3: Update grep prompt docs**

In `tool-descriptions/grep.md` and `grep-snippet.md`, replace `LINE#HASH│` examples with:

```text
aB3│matching line
```

Add:

```md
Use the 3-character hash before `│` directly in `edit.start`, `edit.end`, or `insert.anchor`. Do not include line numbers, `#`, `│`, or content.
```

Also state that `grep` is optional and disabled by default in the package metadata; users enable `extensions/grep.ts` explicitly.

- [ ] **Step 4: Run grep tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/grep.test.ts test/extension/register.test.ts
```

Expected: PASS. If `rg` is unavailable, existing tests should skip or assert the clear `ripgrep (rg) is not available` error according to the copied trunk’s pattern.

- [ ] **Step 5: Commit**

```bash
git add pi-hashline-edit-merged/src/grep.ts pi-hashline-edit-merged/extensions/grep.ts pi-hashline-edit-merged/tool-descriptions/grep.md pi-hashline-edit-merged/tool-descriptions/grep-snippet.md pi-hashline-edit-merged/test/tools/grep.test.ts pi-hashline-edit-merged/test/extension/register.test.ts
git commit -m "feat(grep): emit hash-only perfect anchors"
```

### Task 2: Verify optional `undo` and package defaults

**Files:**
- Modify: `pi-hashline-edit-merged/src/undo.ts` if assumptions about anchor format appear in undo text
- Modify: `pi-hashline-edit-merged/extensions/undo.ts` if registration metadata changes
- Modify: `pi-hashline-edit-merged/test/tools/undo.test.ts`
- Modify: `pi-hashline-edit-merged/README.md`
- Reference: `JerryAZR-pi-hashline-edit/src/undo.ts`
- Reference: `JerryAZR-pi-hashline-edit/test/tools/undo.test.ts`

- [ ] **Step 1: Inspect undo for protocol assumptions**

Run:

```bash
grep -RIn "LINE#\|#HASH\|range\|anchor" pi-hashline-edit-merged/src/undo.ts pi-hashline-edit-merged/test/tools/undo.test.ts
```

Expected: undo should primarily restore previous file content snapshots and should not require hashline anchor parsing. If matches only appear in user-facing text, update them to the new protocol language.

- [ ] **Step 2: Add undo optional-default test**

In `test/tools/undo.test.ts` or `test/extension/register.test.ts`, assert:

```ts
it("undo remains available as an optional extension", () => {
  expect(collectTools(registerUndo).sort()).toEqual(["undo"]);
});

it("undo is not enabled by default in package metadata", () => {
  expect(packageJson.pi.extensions).not.toContain("./extensions/undo.ts");
});
```

Keep existing undo behavior tests that verify an edit can be reverted.

- [ ] **Step 3: Run undo tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/tools/undo.test.ts test/extension/register.test.ts
```

Expected: PASS.

- [ ] **Step 4: Update README optional module instructions**

In `README.md`, document default install behavior:

```md
Default loaded extensions:
- `extensions/core.ts` (`read`, `edit`)
- `extensions/insert.ts` (`insert`)

Optional disabled-by-default extensions:
- `extensions/grep.ts`
- `extensions/undo.ts`
```

Add an enablement example:

```json
{
  "packages": [{
    "source": "npm:pi-hashline-edit-merged",
    "extensions": [
      "extensions/core.ts",
      "extensions/insert.ts",
      "extensions/grep.ts",
      "extensions/undo.ts"
    ]
  }]
}
```

Do not mention `extensions/tool-usage.ts` as an available module.

- [ ] **Step 5: Commit**

```bash
git add pi-hashline-edit-merged/src/undo.ts pi-hashline-edit-merged/extensions/undo.ts pi-hashline-edit-merged/test/tools/undo.test.ts pi-hashline-edit-merged/test/extension/register.test.ts pi-hashline-edit-merged/README.md
git commit -m "test(undo): keep undo optional with merged protocol"
```

### Task 3: Final documentation, migration notes, and full validation

**Files:**
- Modify: `pi-hashline-edit-merged/README.md`
- Modify: `pi-hashline-edit-merged/AGENTS.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/read.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/read-snippet.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/read-guidelines.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/edit.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/edit-snippet.md`
- Modify: `pi-hashline-edit-merged/tool-descriptions/edit-guidelines.md` if present
- Modify: `pi-hashline-edit-merged/tool-descriptions/insert.md`
- Modify: `pi-hashline-edit-merged/package.json`
- Test: full `pi-hashline-edit-merged/test/` suite

- [ ] **Step 1: Update README to final behavior**

Rewrite behavior examples in `README.md` to match final protocol.

Required `read` example:

```text
aB3│function hello() {
xY7│  console.log("world");
qR9│}
```

Required `edit` example:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "start": "xY7", "end": "xY7", "lines": ["  console.log('hashline');"] }
  ]
}
```

Required `insert` example:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "anchor": "aB3", "direction": "after", "lines": ["  const value = 1;"] }
  ]
}
```

Required migration notes:

```md
## Migration from JerryAZR

- `LINE#HH│content` is now `HHH│content` by default.
- `range: ["42#A4", "45#C7"]` is now `start: "aB3", end: "xY7"`.
- Hashes are 3-character base64url anchors with per-file collision resolution.
- `grep` and `undo` ship as optional extensions but are not enabled by default.
```

- [ ] **Step 2: Update all tool prompt files to final protocol**

Run:

```bash
grep -RIn "LINE#\|#HASH\|2-character\|0-9 A-F\|range" pi-hashline-edit-merged/tool-descriptions pi-hashline-edit-merged/README.md pi-hashline-edit-merged/AGENTS.md
```

For every match:

- Keep it only if documenting migration from old behavior or an explicit rejected input.
- Otherwise replace with `HASH│content`, `3-character hash`, `start`/`end`, or `anchor` as appropriate.

Prompts must say:

```md
Copy only the 3-character hash before `│`; do not include `│`, content, line numbers, or `#`.
```

- [ ] **Step 3: Add final package metadata checks**

In `package.json`, ensure:

```json
{
  "name": "pi-hashline-edit-merged",
  "version": "0.1.0",
  "description": "Focused merged hashline editor for pi with split tools and 3-character perfect anchors.",
  "dependencies": {
    "diff": "^8.0.2",
    "file-type": "^21.3.4",
    "xxhash-wasm": "^1.1.0"
  },
  "pi": {
    "extensions": [
      "./extensions/core.ts",
      "./extensions/insert.ts"
    ]
  }
}
```

Do not include `extensions/grep.ts` or `extensions/undo.ts` in default `pi.extensions`.

- [ ] **Step 4: Run full validation**

Run:

```bash
cd pi-hashline-edit-merged
npm test
```

Expected: PASS.

Also run a final protocol grep:

```bash
grep -RIn "LINE#\|#HASH\|0-9 A-F\|2-character\|range: \[" \
  README.md AGENTS.md tool-descriptions src test \
  || true
```

Expected: Remaining matches are only migration notes, rejected-input messages, or old test names that still describe historical behavior. Any model-facing prompt examples must use `HASH│content` and `start`/`end`.

- [ ] **Step 5: Run package dry check**

Run:

```bash
cd pi-hashline-edit-merged
npm pack --dry-run
```

Expected: tarball includes:

```text
extensions/core.ts
extensions/insert.ts
extensions/grep.ts
extensions/undo.ts
src/
tool-descriptions/
README.md
LICENSE
package.json
```

Expected: tarball does not include:

```text
extensions/tool-usage.ts
profiling/
node_modules/
```

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/README.md pi-hashline-edit-merged/AGENTS.md pi-hashline-edit-merged/tool-descriptions pi-hashline-edit-merged/package.json pi-hashline-edit-merged/package-lock.json pi-hashline-edit-merged/test
git commit -m "docs: finalize merged hashline edit protocol"
```

## Phase Verification

- [ ] Grep focused tests pass: `cd pi-hashline-edit-merged && npm test -- test/tools/grep.test.ts`
- [ ] Undo focused tests pass: `cd pi-hashline-edit-merged && npm test -- test/tools/undo.test.ts`
- [ ] Extension defaults pass: `cd pi-hashline-edit-merged && npm test -- test/extension/register.test.ts`
- [ ] Full suite passes: `cd pi-hashline-edit-merged && npm test`
- [ ] Package dry run passes: `cd pi-hashline-edit-merged && npm pack --dry-run`
- [ ] Prompt/docs grep has no stale model-facing `LINE#HASH` examples outside migration or rejected-input documentation.
