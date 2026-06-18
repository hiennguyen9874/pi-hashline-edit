# Implementation–Document Consistency Review

Date: 2026-05-31
Branch: main (post schema-redesign)

---

## 1. Prompts vs Published Schema

### ✅ Consistent
- **`prompts/edit.md`** accurately describes the current tool schema (`range: [startAnchor, endAnchor]`, `lines: [...]`) defined in `src/edit.ts:29-49`.
- **`prompts/read.md`** accurately describes `offset`, `limit`, and `raw`, matching `src/read.ts:137-158`.
- **No stale field names** appear in prompt text (no `op`, `pos`, `end`, `oldText`, `newText`, `replace_text`, `append`, `prepend`).

---

## 2. Stale References to Removed Features

### 🔴 README.md — severely outdated edit schema documentation

| Location | Issue | Current State |
|----------|-------|---------------|
| `README.md:56-63` | JSON example shows `"op": "replace"`, `"pos": "11#KT"` | Published schema uses `range` + `lines` only. |
| `README.md:65-70` | Op table documents `replace`, `append`, `prepend`, `replace_text` with `pos`/`end`/`oldText`/`newText` fields. | These ops/fields are hidden from the model; only `range` + `lines` is published. |
| `README.md:50` | Empty-file advisory suggests `prepend`/`append`. | The published schema has no `prepend`/`append` op; empty files can only be edited via `range` (which is impossible for an empty file). `src/read.ts:77` correctly advises "Use edit with prepend or append and omit pos to insert content" — but this is unreachable because the model cannot send `prepend`/`append`. |
| `README.md:87` | "Hidden legacy compatibility" section describes top-level `oldText`/`newText` payload. | `src/edit-compat.ts` exists but is **never imported by `src/edit.ts`**. The compatibility path is dead code. |
| `README.md:93-95` | Hashing section says hashes use xxhashjs + custom alphabet `ZPMQVRWSNKTXJBYH`. | `src/hashline.ts:42-65` uses **inline FNV-1a** and alphabet **`0-9 A-F`**. The "Differences from upstream" bullet (`README.md:18`) correctly notes the switch to hex, but the dedicated Hashing section contradicts it. |
| `README.md:43` | Correctly says `HASH` is hex digits `0-9 A-F`. | ✅ Accurate. |

### 🟡 src/ — internal dead code for removed features

| Location | Issue | Notes |
|----------|-------|-------|
| `src/hashline.ts:13-17` | `HashlineEdit` union still lists `append`, `prepend`, `replace_text` ops. | Internal types only; unreachable via published schema. |
| `src/hashline.ts:349-356` | `HashlineToolEdit` still defines `op`, `pos`, `end`, `oldText`, `newText`. | Internal bridge type; `normalizeEditItems` in `src/edit.ts:144-149` maps `range` → `op: "replace"`. |
| `src/edit-compat.ts` | Entire module (`extractLegacyTopLevelReplace`, `applyExactUniqueLegacyReplace`). | **Never imported by `src/edit.ts`**. Dead code. |
| `src/edit-response.ts:291-400` | `buildFullResponse` and `buildRangesResponse`. | Exported but **never called** from `src/edit.ts`. Only `buildChangedResponse` and `buildNoopResponse` are used (both hard-coded with `returnMode: "changed"`). |
| `src/edit.ts:51-54`, `77-83` | `ReturnRange`, `ReturnedRangePreview`, `FullContentPreview`, `EditMetrics` types. | `EditMetrics.return_mode` type is `"changed" \| "full" \| "ranges"`, but execute path always passes `"changed"`. |
| `src/edit.ts:354-391` | `formatRequestedRangePreviews` and helpers. | Dead code; `requestedReturnRanges` is always `undefined` in execute path. |
| `src/compatibility-notify.ts` | Registered in `index.ts:9`. | `details.compatibility` is always `undefined` in `src/edit.ts:752`, so the notification handler never fires. |
| `src/edit.ts:714` | `const legacyReplace = false;` | Hard-coded; `edit-compat.ts` is unreachable. |

### 🟢 AGENTS.md — mostly accurate
- `AGENTS.md:4` and `AGENTS.md:26` mention "compatibility notifications" and "compatibility mode". This is factually describing code that exists, even though the feature is dead at runtime. Not a doc bug per se, but worth noting.
- Guardrails (`AGENTS.md:34-40`) are fully consistent with current implementation.

### 🟢 Test references
- Tests in `test/core/hashline.*.test.ts` exercise `append`, `prepend`, `replace_text` against the internal `HashlineEdit` API. This is acceptable because they test the engine, not the published schema.
- `test/tools/edit.compatibility.test.ts` tests `edit-compat.ts` directly. Acceptable as unit tests for a module, even if the module is un-wired.

---

## 3. Error Messages

### ✅ Accurate / well-formed
- **`E_STALE_ANCHOR`** (`src/hashline.ts:198`): "Retry with the >>> LINE#HASH lines below; keep both endpoints for range replaces." — Correctly references `range` and `LINE#HASH`.
- **`E_INVALID_PATCH`** (`src/hashline.ts:235`): References `"lines"` correctly and never mentions old field names.
- **`E_BAD_REF`** (`src/hashline.ts:93-126`, `146-156`): All messages reference `LINE#HASH`, `0-9 A-F`, and line numbers correctly.

### 🟡 Misleading (references unreachable features)
- **`E_BAD_OP`** (`src/hashline.ts:285`, `292`, `305`, `317`, `331`, `842`, `851`): Error messages mention `"replace", "append", "prepend", "replace_text"`, `pos`, `end`, `oldText`, `newText`. Because the published schema only accepts `range` + `lines`, the model can never trigger these. A user (or future developer) seeing these in source might think those ops are supported. **Risk: internal error leakage into code comprehension.**
- **`E_BAD_RANGE`** (`src/hashline.ts:563`): "Ensure the range tuple is [start, end] with start ≤ end." — The model sends a JSON array (`range: ["42#A4", "42#A4"]`), so "tuple" is technically accurate. This is acceptable.

---

## 4. index.ts

| Location | Issue |
|----------|-------|
| `index.ts:2` | Imports `registerCompatibilityNotifications` from dead notification system. |
| `index.ts:9` | Calls `registerCompatibilityNotifications(pi)`. Since `edit.ts` never sets `details.compatibility`, this handler never fires. |

**Verdict:** Extension registration itself is clean (read/edit tools are correct). The compatibility notification registration is harmless but references a removed feature path.

---

## 5. AGENTS.md Guardrails

- **Consistent** with current implementation.
- One note: `AGENTS.md:26` says "Any change to anchor parsing, diff preview, compatibility mode, or atomic writes should include or update tests..." — "compatibility mode" is dead code, but this is a testing guideline, not an implementation rule.
- No stale field names or schema rules.

---

## 6. README.md — Additional Stale Details

| Location | Issue |
|----------|-------|
| `README.md:93` | "Hashes are computed with xxhashjs (xxHash32)" — false. Code uses inline FNV-1a (`src/hashline.ts:42-65`). |
| `README.md:95` | Alphabet described as `ZPMQVRWSNKTXJBYH` — false. Code uses `0-9 A-F` (`src/hashline.ts:33-34`). |
| `README.md:76` | "`--- Updated anchors ---` block" — actual output uses `--- Anchors N-M ---` (`src/edit-response.ts:431`). |
| `README.md:87` | "top-level `oldText`/`newText` payload... Usage is surfaced to the interactive UI" — the UI notification path is dead (`compatibility-notify.ts` never sees `used: true`). |

---

## Summary Table

| File | Severity | Count | Nature |
|------|----------|-------|--------|
| `README.md` | 🔴 High | ~8 | Documents removed schema (ops, pos/end, legacy replace), wrong hashing algorithm, wrong alphabet, stale output format. |
| `src/edit-compat.ts` | 🟡 Medium | 1 module | Dead code; never imported. |
| `src/edit-response.ts` | 🟡 Medium | 2 functions | `buildFullResponse`, `buildRangesResponse` exported but never called. |
| `src/edit.ts` | 🟡 Medium | ~4 | Dead `legacyReplace`, dead range-preview helpers, unused `returnMode` branches. |
| `src/compatibility-notify.ts` | 🟡 Medium | 1 module | Registered but never triggered. |
| `src/hashline.ts` | 🟢 Low | ~2 | Internal types retain removed ops (acceptable for engine tests). Error messages mention unreachable ops. |
| `index.ts` | 🟡 Medium | 1 | Registers dead compatibility notification system. |
| `prompts/*.md` | ✅ None | 0 | Prompts match published schema. |
| `AGENTS.md` | 🟢 Low | 1 | Mentions "compatibility mode" in testing guidelines. |

---

## Recommended Actions

1. **Rewrite `README.md` edit examples and op table** to reflect the current `range` + `lines` schema.
2. **Fix `README.md` Hashing section** to describe FNV-1a and hex alphabet `0-9 A-F`.
3. **Fix `README.md` empty-file advisory** — explain that empty files cannot be edited via the current schema (or restore `prepend`/`append` if intended).
4. **Remove or deprecate `src/edit-compat.ts`** and its tests if the legacy path is intentionally removed.
5. **Remove `registerCompatibilityNotifications`** from `index.ts` if legacy compatibility is permanently removed.
6. **Prune dead code** in `src/edit-response.ts` (`buildFullResponse`, `buildRangesResponse`) and `src/edit.ts` (range-preview helpers) if `returnMode` is permanently fixed to `"changed"`.
7. **Audit `E_BAD_OP` messages** — either delete them along with unreachable op branches, or add a code comment noting they are internal-only and unreachable from the published schema.
