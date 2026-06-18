# Phase 1: Create JerryAZR-Based Package Trunk

**Goal:** Create `pi-hashline-edit-merged/` by copying JerryAZR’s focused editor implementation, then adjust package identity and default extension exposure without changing behavior yet.

**Tasks:** 3 related tasks.

### Task 1: Copy JerryAZR source as the implementation base

**Files:**
- Create: `pi-hashline-edit-merged/`
- Copy from: `JerryAZR-pi-hashline-edit/extensions/`
- Copy from: `JerryAZR-pi-hashline-edit/src/`
- Copy from: `JerryAZR-pi-hashline-edit/test/`
- Copy from: `JerryAZR-pi-hashline-edit/tool-descriptions/`
- Copy from: `JerryAZR-pi-hashline-edit/assets/`
- Copy from: `JerryAZR-pi-hashline-edit/package.json`
- Copy from: `JerryAZR-pi-hashline-edit/README.md`
- Copy from: `JerryAZR-pi-hashline-edit/AGENTS.md`
- Copy from: `JerryAZR-pi-hashline-edit/LICENSE` if present
- Do not copy: `JerryAZR-pi-hashline-edit/profiling/`
- Do not copy: `JerryAZR-pi-hashline-edit/node_modules/`

- [ ] **Step 1: Copy the JerryAZR package into the new package directory**

Run from workspace root:

```bash
rm -rf pi-hashline-edit-merged
mkdir -p pi-hashline-edit-merged
rsync -a \
  --exclude node_modules \
  --exclude profiling \
  --exclude .git \
  JerryAZR-pi-hashline-edit/ pi-hashline-edit-merged/
```

Expected: `pi-hashline-edit-merged/src/hashline.ts`, `pi-hashline-edit-merged/extensions/core.ts`, `pi-hashline-edit-merged/extensions/insert.ts`, `pi-hashline-edit-merged/extensions/grep.ts`, and `pi-hashline-edit-merged/extensions/undo.ts` exist.

- [ ] **Step 2: Confirm source layout matches the trunk**

Run:

```bash
find pi-hashline-edit-merged -maxdepth 2 -type f \
  \( -path '*/src/*' -o -path '*/extensions/*' -o -path '*/test/*' -o -name package.json \) \
  | sort | head -80
```

Expected: copied files include at least these paths:

```text
pi-hashline-edit-merged/extensions/core.ts
pi-hashline-edit-merged/extensions/grep.ts
pi-hashline-edit-merged/extensions/insert.ts
pi-hashline-edit-merged/extensions/undo.ts
pi-hashline-edit-merged/src/edit.ts
pi-hashline-edit-merged/src/fuzzy-match.ts
pi-hashline-edit-merged/src/grep.ts
pi-hashline-edit-merged/src/hashline.ts
pi-hashline-edit-merged/src/insert.ts
pi-hashline-edit-merged/src/mutation.ts
pi-hashline-edit-merged/src/read.ts
pi-hashline-edit-merged/src/undo.ts
pi-hashline-edit-merged/test/core/hashline.hash.test.ts
pi-hashline-edit-merged/test/tools/edit.test.ts
pi-hashline-edit-merged/test/tools/insert.test.ts
```

- [ ] **Step 3: Install dependencies and capture baseline test behavior**

Run:

```bash
cd pi-hashline-edit-merged
npm install
npm test
```

Expected: PASS. This is still JerryAZR behavior; no hash-only protocol changes are expected yet.

- [ ] **Step 4: Commit**

```bash
git add pi-hashline-edit-merged
git commit -m "chore: copy JerryAZR hashline edit as merged base"
```

If this workspace is not a Git repo, record the copied path and continue.

### Task 2: Set package identity and default extension surface

**Files:**
- Modify: `pi-hashline-edit-merged/package.json`
- Modify: `pi-hashline-edit-merged/test/extension/register.test.ts`
- Remove: `pi-hashline-edit-merged/extensions/tool-usage.ts`
- Modify: `pi-hashline-edit-merged/README.md`

- [ ] **Step 1: Update `package.json` identity and default extensions**

Change `pi-hashline-edit-merged/package.json` to these package-level values while preserving existing peer dependencies and scripts:

```json
{
  "name": "pi-hashline-edit-merged",
  "version": "0.1.0",
  "description": "Focused merged hashline editor for pi with split tools and 3-character perfect anchors.",
  "author": "pi-hashline-edit-merged contributors",
  "license": "MIT",
  "pi": {
    "extensions": [
      "./extensions/core.ts",
      "./extensions/insert.ts"
    ]
  }
}
```

Also add the runtime dependency that will be used in Phase 2:

```json
"dependencies": {
  "diff": "^8.0.2",
  "file-type": "^21.3.4",
  "xxhash-wasm": "^1.1.0"
}
```

Rationale: `core.ts` registers `read`/`edit`; `insert.ts` registers `insert`. `grep.ts` and `undo.ts` remain shipped but are disabled by default because they are not listed in `pi.extensions`.

- [ ] **Step 2: Remove the out-of-scope tool-usage extension**

Run:

```bash
rm -f pi-hashline-edit-merged/extensions/tool-usage.ts
```

Expected: `extensions/tool-usage.ts` is absent. Do not remove `extensions/grep.ts` or `extensions/undo.ts`.

- [ ] **Step 3: Update extension registration tests for default and optional modules**

In `pi-hashline-edit-merged/test/extension/register.test.ts`, keep the existing tests that directly import and register `core`, `insert`, `grep`, and `undo`. Add a package metadata assertion:

```ts
import packageJson from "../../package.json" assert { type: "json" };

it("package defaults enable only core and insert extensions", () => {
  expect(packageJson.pi.extensions).toEqual([
    "./extensions/core.ts",
    "./extensions/insert.ts",
  ]);
});
```

If the current Vitest/TypeScript setup does not support JSON import assertions, use `readFileSync(new URL("../../package.json", import.meta.url), "utf-8")` and `JSON.parse` instead.

- [ ] **Step 4: Update README scope language without changing protocol docs yet**

In `pi-hashline-edit-merged/README.md`, change the title/intro to identify the package as `pi-hashline-edit-merged` and state:

```md
Default extensions: `extensions/core.ts` and `extensions/insert.ts`.
Optional extensions: `extensions/grep.ts` and `extensions/undo.ts`.
`tool-usage` is intentionally not part of this merged package.
```

Do not update anchor examples yet; those are Phase 3 documentation changes.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/extension/register.test.ts
```

Expected: PASS. Optional `grep` registration may still be conditional on `rg` availability, matching the copied trunk behavior.

- [ ] **Step 6: Commit**

```bash
git add pi-hashline-edit-merged/package.json pi-hashline-edit-merged/package-lock.json pi-hashline-edit-merged/test/extension/register.test.ts pi-hashline-edit-merged/README.md pi-hashline-edit-merged/extensions
git commit -m "chore: set merged package defaults"
```

### Task 3: Add local implementation guide for the merged package

**Files:**
- Modify: `pi-hashline-edit-merged/AGENTS.md`

- [ ] **Step 1: Replace JerryAZR-specific guidance with merged-package invariants**

Update `pi-hashline-edit-merged/AGENTS.md` so it says:

```md
# Repository Guidelines

## What this is

`pi-hashline-edit-merged` is a focused pi hashline editor derived from `JerryAZR-pi-hashline-edit`.

Default tools:
- `read`
- `edit`
- `insert`

Optional disabled-by-default tools:
- `grep`
- `undo`

Do not add readmap-style `ls`, `find`, `ast_search`, NuShell, bash compression, auto-read, tool-usage, or syntax validation in this package.
```

Keep JerryAZR’s existing guidance for project structure, test commands, atomic writes, and narrow modules. Add the protocol invariant that later phases must implement:

```md
## Protocol invariants

- Default read output is `HASH│content` with a 3-character base64url hash.
- Optional line-number display is controlled by `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` and prints `LINE#HASH│content`.
- `edit` and `insert` accept hash-only anchors; line-qualified anchors are display-only and rejected by mutating tools.
- Hashes are computed through one perfect per-file hash array; do not recompute call-site-specific anchors.
```

- [ ] **Step 2: Run baseline tests again**

Run:

```bash
cd pi-hashline-edit-merged
npm test
```

Expected: PASS. This phase should not yet change runtime behavior, except package metadata and removed `tool-usage` extension file.

- [ ] **Step 3: Commit**

```bash
git add pi-hashline-edit-merged/AGENTS.md
git commit -m "docs: add merged package implementation guardrails"
```

## Phase Verification

- [ ] Package directory exists: `test -d pi-hashline-edit-merged/src`
- [ ] Default package extensions are core and insert only: `node -e 'console.log(require("./pi-hashline-edit-merged/package.json").pi.extensions)'`
- [ ] Focused extension tests pass: `cd pi-hashline-edit-merged && npm test -- test/extension/register.test.ts`
- [ ] Full copied baseline passes before protocol work: `cd pi-hashline-edit-merged && npm test`
