# Phase 2: Add Perfect Hash and Anchor Display Foundations

**Goal:** Add the new hash/display foundation beside the copied JerryAZR runtime, with focused tests, before rewiring read/edit/insert behavior in Phase 3.

**Tasks:** 3 related tasks.

### Task 1: Add 3-character perfect hash module

**Files:**
- Create: `pi-hashline-edit-merged/src/hash-format.ts`
- Create: `pi-hashline-edit-merged/test/core/hash-format.test.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/hash.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/test/core/hashline.hash.test.ts`

- [ ] **Step 1: Write failing tests for the new hash contract**

Create `pi-hashline-edit-merged/test/core/hash-format.test.ts`:

```ts
import { describe, expect, it, beforeAll } from "vitest";
import {
  HASH_ALPHABET,
  HASH_LENGTH,
  HASH_RE,
  computeLineHash,
  computeLineHashes,
  ensureHasherReady,
} from "../../src/hash-format";

describe("hash-format", () => {
  beforeAll(async () => {
    await ensureHasherReady();
  });

  it("uses 3-character URL-safe base64 anchors", () => {
    expect(HASH_LENGTH).toBe(3);
    expect(HASH_ALPHABET).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
    const hash = computeLineHash("hello");
    expect(hash).toHaveLength(3);
    expect(hash).toMatch(HASH_RE);
  });

  it("canonicalizes CR and trailing whitespace only", () => {
    expect(computeLineHash("value\r")).toBe(computeLineHash("value"));
    expect(computeLineHash("value   ")).toBe(computeLineHash("value"));
    expect(computeLineHash("a  b")).not.toBe(computeLineHash("a b"));
  });

  it("returns one perfect hash per visible file line", () => {
    const hashes = computeLineHashes("alpha\nbeta\ngamma");
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
    expect(hashes.every((hash) => HASH_RE.test(hash))).toBe(true);
  });

  it("assigns different anchors to identical content occurrences", () => {
    const hashes = computeLineHashes("}\n}\n}");
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
  });

  it("does not create a synthetic hash for terminal newline", () => {
    expect(computeLineHashes("alpha\nbeta\n")).toHaveLength(2);
    expect(computeLineHashes("")).toEqual([]);
  });
});
```

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/hash-format.test.ts
```

Expected: FAIL because `src/hash-format.ts` does not exist.

- [ ] **Step 2: Implement `src/hash-format.ts`**

Create `pi-hashline-edit-merged/src/hash-format.ts` using YuGiMob’s `xxhash-wasm` approach, adapted to JerryAZR’s visible-line splitting contract:

```ts
import xxhash from "xxhash-wasm";

export const HASH_LENGTH = 3;
export const HASH_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const HASH_ALPHABET_REGEX_SAFE = HASH_ALPHABET.replace(/-/g, "\\-");
export const HASH_RE = new RegExp(`^[${HASH_ALPHABET_REGEX_SAFE}]{${HASH_LENGTH}}$`);
export const HASH_CHARS_CLASS = `[${HASH_ALPHABET_REGEX_SAFE}]{${HASH_LENGTH}}`;

const HASH_ALPHABET_BITS = 6;
const HASH_ALPHABET_MASK = (1 << HASH_ALPHABET_BITS) - 1;

type Hasher = { h32(input: string, seed?: number): number };
let hasherSync: Hasher | null = null;
const hasherPromise = xxhash().then((hasher) => {
  hasherSync = hasher;
  return hasher;
});

export function ensureHasherReady(): Promise<Hasher> {
  return hasherPromise;
}

function getHasher(): Hasher {
  if (!hasherSync) {
    throw new Error("xxhash-wasm not initialized yet. Call ensureHasherReady() before hashing.");
  }
  return hasherSync;
}

function hashToString(value: number): string {
  const totalBits = HASH_LENGTH * HASH_ALPHABET_BITS;
  const shift = 32 - totalBits;
  const n = value >>> shift;
  let out = "";
  for (let index = 0; index < HASH_LENGTH; index++) {
    out += HASH_ALPHABET[(n >>> ((HASH_LENGTH - 1 - index) * HASH_ALPHABET_BITS)) & HASH_ALPHABET_MASK]!;
  }
  return out;
}

export function canonicalizeLine(line: string): string {
  return line.replace(/\r/g, "").trimEnd();
}

function splitVisibleLines(content: string): string[] {
  if (content.length === 0) return [];
  const parts = content.split("\n");
  return content.endsWith("\n") ? parts.slice(0, -1) : parts;
}

export function computeLineHash(line: string, retry = 0): string {
  const canonical = canonicalizeLine(line);
  const input = retry === 0 ? canonical : `${canonical}:R${retry}`;
  return hashToString(getHasher().h32(input, 0) >>> 0);
}

export function computeLineHashes(content: string): string[] {
  const lines = splitVisibleLines(content);
  const assigned = new Set<string>();
  return lines.map((line) => {
    let retry = 0;
    let hash = computeLineHash(line, retry);
    while (assigned.has(hash)) {
      retry += 1;
      hash = computeLineHash(line, retry);
    }
    assigned.add(hash);
    return hash;
  });
}
```

Important implementation detail: call `ensureHasherReady()` from tool execution paths before formatting or validating anchors. Tests in this task call it in `beforeAll`.

- [ ] **Step 3: Run focused hash tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/hash-format.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pi-hashline-edit-merged/src/hash-format.ts pi-hashline-edit-merged/test/core/hash-format.test.ts pi-hashline-edit-merged/package.json pi-hashline-edit-merged/package-lock.json
git commit -m "feat(hash): add perfect 3-character hash format"
```

### Task 2: Add anchor display formatting helper

**Files:**
- Create: `pi-hashline-edit-merged/src/anchor-display.ts`
- Create: `pi-hashline-edit-merged/test/core/anchor-display.test.ts`
- Reference: `JerryAZR-pi-hashline-edit/src/hashline.ts` (`CONTENT_SEP`, `formatHashlineRegion`)

- [ ] **Step 1: Write failing display-mode tests**

Create `pi-hashline-edit-merged/test/core/anchor-display.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_SEP, formatAnchorPrefix, getAnchorDisplayMode } from "../../src/anchor-display";

describe("anchor-display", () => {
  const original = process.env.PI_HASHLINE_ANCHOR_DISPLAY;

  afterEach(() => {
    if (original === undefined) delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    else process.env.PI_HASHLINE_ANCHOR_DISPLAY = original;
  });

  it("defaults to hash-only display", () => {
    delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    expect(getAnchorDisplayMode()).toBe("hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`aB3${CONTENT_SEP}`);
  });

  it("supports line-hash display through env", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "line-hash";
    expect(getAnchorDisplayMode()).toBe("line-hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`42#aB3${CONTENT_SEP}`);
  });

  it("treats unknown env values as hash-only", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "verbose";
    expect(getAnchorDisplayMode()).toBe("hash");
  });
});
```

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/anchor-display.test.ts
```

Expected: FAIL because `src/anchor-display.ts` does not exist.

- [ ] **Step 2: Implement display helper**

Create `pi-hashline-edit-merged/src/anchor-display.ts`:

```ts
export const ANCHOR_SEP = "#";
export const CONTENT_SEP = "│";
export type AnchorDisplayMode = "hash" | "line-hash";

export function getAnchorDisplayMode(): AnchorDisplayMode {
  return process.env.PI_HASHLINE_ANCHOR_DISPLAY === "line-hash" ? "line-hash" : "hash";
}

export function formatAnchorPrefix(input: { line: number; hash: string; lineNumberWidth?: number }): string {
  if (getAnchorDisplayMode() === "line-hash") {
    const line = input.lineNumberWidth ? String(input.line).padStart(input.lineNumberWidth, " ") : String(input.line);
    return `${line}${ANCHOR_SEP}${input.hash}${CONTENT_SEP}`;
  }
  return `${input.hash}${CONTENT_SEP}`;
}
```

- [ ] **Step 3: Run focused display tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/anchor-display.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pi-hashline-edit-merged/src/anchor-display.ts pi-hashline-edit-merged/test/core/anchor-display.test.ts
git commit -m "feat(hashline): add anchor display modes"
```

### Task 3: Add hasher readiness integration tests without rewiring runtime

**Files:**
- Modify: `pi-hashline-edit-merged/test/core/hash-format.test.ts`
- Reference: `YuGiMob-pi-hashline-edit-pro/src/hashline/hash.ts` (`ensureHasherReady`)

- [ ] **Step 1: Add a deterministic readiness test**

Append to `hash-format.test.ts`:

```ts
it("hashes deterministically after readiness is awaited", async () => {
  await ensureHasherReady();
  const first = computeLineHashes("same\ncontent\n}");
  const second = computeLineHashes("same\ncontent\n}");
  expect(second).toEqual(first);
});
```

- [ ] **Step 2: Run all new foundation tests**

Run:

```bash
cd pi-hashline-edit-merged
npm test -- test/core/hash-format.test.ts test/core/anchor-display.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run copied baseline suite**

Run:

```bash
cd pi-hashline-edit-merged
npm test
```

Expected: PASS. The new modules are not wired into `read`, `edit`, `insert`, or `grep` yet, so old protocol tests should still pass.

- [ ] **Step 4: Commit**

```bash
git add pi-hashline-edit-merged/test/core/hash-format.test.ts
git commit -m "test(hash): pin hasher readiness contract"
```

## Phase Verification

- [ ] New hash tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/hash-format.test.ts`
- [ ] Display tests pass: `cd pi-hashline-edit-merged && npm test -- test/core/anchor-display.test.ts`
- [ ] Full suite still passes before runtime rewiring: `cd pi-hashline-edit-merged && npm test`
- [ ] No runtime file imports `src/hash-format.ts` yet except tests; this keeps Phase 2 low-risk.
