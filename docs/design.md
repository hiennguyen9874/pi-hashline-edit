## Recommendation: Base on **JerryAZR** (`@jerryan/pi-hashline-edit` v0.11.3)

### Why JerryAZR as the base:

1. **Already a fork of RimuruW** — it inherits the original's clean architecture and strict semantics, then adds substantive improvements
2. **Most feature-complete** — split tools, context hashing, fuzzy relocation, grep, undo, guardrails are already built and tested
3. **Highest version maturity** (v0.11.3) and active maintenance
4. **Modular extension system** already in place — tools are separate files, easy to add/remove features

### Features to merge from other versions:

**From YuGiMob-pro (highest priority):**

| Feature | Why |
|---|---|
| **3-char hashes + 64-char base64url alphabet** | 18-bit entropy (up from 8-bit). LLMs tokenize base64 well. Hash-only anchors drop line numbers from wire format — saves tokens. |
| **Perfect hashing (collision resolution)** | Every line gets a unique anchor. Repeated `}` or `import` lines no longer collide. Critical for large files with boilerplate. |
| **Multi-tier bare-prefix detection** | Cross-checks suspect lines against actual file hashes. Catches the common model mistake of pasting `HASH│` into edit content. |

**From JoshMock:**

| Feature | Why |
|---|---|
| **`current` field for single-line replaces** | The model must supply the exact content being replaced. Adds a content-based safety check on top of hash validation. Catches off-by-one errors. |
| **Self-contained xxHash32** (optional) | Zero native dependencies, works on Bun. JerryAZR's FNV-1a is already self-contained though. |

**From coctostan-readmap:**

| Feature | Why |
|---|---|
| **Doom-loop detection** | Detects repeated edit-failure patterns and warns the model. Low implementation cost, high value. |
| **`set_line` / `replace_lines` edit types** | More descriptive than generic `range` arrays. Models understand named operations better. |

**From RimuruW (upstream):**

| Feature | Why |
|---|---|
| **`replace_text` normalization** | Backward compatibility with models that still send `oldText`/`newText`. JerryAZR removed this — add it back as a normalization layer (not a separate op). |

---

### Key design tensions to resolve:

**1. Context hashing vs. Perfect hashing — pick ONE.**

JerryAZR's context hashing (`fnv(prev + curr + next)`) and YuGiMob-pro's perfect hashing solve different problems:
- Context hashing: distant edits don't invalidate distant anchors, nearby ones do
- Perfect hashing: every line has a unique anchor, no collisions

**My recommendation:** Use perfect hashing (3-char, collision-free) + keep JerryAZR's multi-tier stale resolution (exact → fuzzy → snapshot merge). This gives you:
- Unique anchors for every line (no more "which `}` do I mean?")
- Fuzzy relocation handles shifted lines
- Snapshot merge handles concurrent changes

Drop the context hashing — it adds complexity and perfect hashing already eliminates the collision problem it partially solved.

**2. Split tools — KEEP JerryAZR's design.**

`edit` (replace range) + `insert` (add lines) is proven better for models than a single tool with optional `op` fields. Models struggle with optional parameters.

**3. Anchor format — adopt YuGiMob-pro's hash-only style.**

| Current (JerryAZR) | Proposed |
|---|---|
| `range: ["42#A4", "45#C7"]` | `start: "aB3", end: "xY7"` |

Dropping line numbers from anchors saves tokens and simplifies the model's mental model. The hash uniquely identifies the line; the line number is redundant.

**4. Hash alphabet — use base64url, not hex.**

JerryAZR uses hex (`0-9A-F`). YuGiMob-pro uses base64url (`A-Za-z0-9-_`). With 3-char hashes, base64url gives 64³ = 262K buckets vs hex's 16³ = 4K. Maximum entropy per character. LLMs tokenize base64 well.

---

### What NOT to merge:

| Feature | From | Why not |
|---|---|---|
| Full readmap suite (maps, ls, find, nu, ast_search, bash compression) | coctostan | Different scope. Keep hashline-edit focused on read+edit+grep. Users who want the full suite can install readmap separately. |
| Context-based hashing | JerryAZR | Conflicts with perfect hashing. Drop in favor of perfect hashing + fuzzy relocation. |
| Hash-only with no line numbers in output | YuGiMob-pro | Keep line numbers in `read` output for human readability, but drop them from edit anchors. The output format `42#aB3│content` is more readable than `aB3│content`. |

---

### Concrete plan:

```
Base: JerryAZR-pi-hashline-edit (extensions/core.ts, extensions/insert.ts, 
      extensions/grep.ts, extensions/undo.ts, extensions/tool-usage.ts)

Phase 1 — Hash upgrade:
  - Replace FNV-1a with xxHash32 (WASM or inline, like JoshMock)
  - Bump to 3-char base64url alphabet
  - Add perfect hashing (collision resolution) from YuGiMob-pro
  - Port bare-prefix detection improvements

Phase 2 — Schema refinement:
  - Drop line numbers from edit anchors (hash-only)
  - Add `current` field for single-line replaces (from JoshMock)
  - Rename edit types: `range` → `start`/`end`, `insert` keeps `anchor`/`direction`
  - Add `replace_text` normalization layer back (from RimuruW)

Phase 3 — Safety additions:
  - Port doom-loop detection (from coctostan-readmap)
  - Keep: full-file deletion guard, symmetric boundary-dup detection, 
    multi-tier stale resolution, atomic writes, per-file mutation queue

Phase 4 — Polish:
  - Unified diff output with fresh anchors for chained edits
  - keep `raw` mode for token-saving reads
  - keep grep with hashline anchors
  - keep undo
```

---

### Estimated outcome vs. current best:

| Metric | Current best | After merge |
|---|---|---|
| Hash collisions | ~1/256 per line | 0 (perfect hashing) |
| Hash entropy | 8 bits | 18 bits |
| Anchor uniqueness | ❌ collisions on repeated lines | ✅ every line unique |
| Edit success (cold) | Good (split tools + fuzzy) | Better (unique anchors + `current` field) |
| Token efficiency | Good | Better (hash-only anchors, no line numbers) |
| Safety guardrails | Strong | Stronger (+ doom-loop, + `current` check) |
