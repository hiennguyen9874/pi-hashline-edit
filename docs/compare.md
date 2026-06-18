---

## Survey: 5 Versions of pi Hashline Edit

All descend from [oh-my-pi](https://github.com/can1357/oh-my-pi)'s hashline concept by can1357. The **origin** among these forks is **RimuruW-pi-hashline-edit** (`pi-hashline-edit` v0.7.0).

---

### 1. RimuruW-pi-hashline-edit (Origin, `pi-hashline-edit` v0.7.0)

**Hash algorithm:** xxHash32 → 2-char custom alphabet `ZPMQVRWSNKTXJBYH` (16 chars, 8-bit). Pure content hash (no context). Structurally-identical lines (e.g. repeated `}`) share the same hash.

**Edit schema:** Single `edit` tool with `op` enum — `replace`, `append`, `prepend`, `replace_text`. A `pos` anchor + optional `end` + `lines[]`.

**Output format:** `LINE#HASH:content` (colon separator, e.g. `10#BH:}`).

**Key characteristics:**
- Strict policy: stale anchors fail, no fallback relocation, strict patch content rejection
- Supports `replace_text` (legacy `oldText`/`newText` normalization)
- Diff preview in `details.diff`, model sees compact anchor block
- Image pass-through (JPEG/PNG/GIF/WebP)
- 3 return payload modes possible (changed/noop/diff)

---

### 2. JerryAZR-pi-hashline-edit (Fork, `@jerryan/pi-hashline-edit` v0.11.3)

**Hash algorithm:** Inline FNV-1a (32-bit, mask-reduced to 8-bit) → 2-char hex alphabet `0-9A-F`. **Context-based hashing** — each line's hash incorporates its immediate neighbors (prev + "\0" + curr + "\0" + next).

**Edit schema:** **Split tool design** — `edit` for replacement, `insert` for insertion. No `op` enum. `edit` uses `range: ["start#HH", "end#HH"]` always. `insert` uses `anchor` + `direction: "after"|"before"`.

**Output format:** `LINE#HASH│content` (box-drawing `│` separator, e.g. `10#B2│}`).

**Key differences from origin:**
| Area | RimuruW (origin) | JerryAZR |
|---|---|---|
| Hash alphabet | `ZPMQVRWSNKTXJBYH` (custom, avoids hex/vowels/confusables) | `0-9A-F` (standard hex, better LLM tokenization) |
| Hash context | Line content only | Line + neighbors (nearby edits invalidate, distant don't) |
| Tool design | Single `edit` with `op` enum | Split into `edit` (replace) + `insert` (add) |
| Anchor format | `pos: "LINE#HASH"` (optional end) | `range: ["start#HH", "end#HH"]` (always 2-elem array) |
| Separator | `:` colon | `│` box-drawing |
| Stale anchors | Strict fail only | **Multi-tier**: exact match → fuzzy relocation (±1/2 lines) → snapshot 3-way merge |
| Raw read mode | ❌ | ✅ `raw: true` returns plain text |
| `replace_text` | ✅ Accepted via normalization | ❌ Rejected, hashline-only |
| Extra tools | — | `insert`, `grep` (hashline-backed), `undo`, `/tool-usage` |
| Boundary dup detection | ❌ | ✅ Symmetric (both sides of replacement) |
| Full-file deletion guard | ❌ | ✅ `[E_WOULD_EMPTY]` for >50 lines |
| Extension modularity | Monolithic | Per-file: `core.ts`, `insert.ts`, `undo.ts`, `grep.ts`, `tool-usage.ts` |

---

### 3. JoshMock-hashline-edit (`@the-agency/pi-hashline-edit` v0.2.1)

**Hash algorithm:** Self-contained inline xxHash32 (no WASM, pure JS, works on Node + Bun) → custom nibble alphabet → `LINE#HASH:TEXT`.

**Edit schema:** Single `hashline_edit` tool with `op` enum (`replace`, `append`, `prepend`). Adds **`current` field** — for single-line replaces, the model must supply the exact current content of the line. Validates `current` matches before mutating.

**Output format:** `LINE#HASH:TEXT` (colon separator).

**Key differences from origin:**
| Area | RimuruW (origin) | JoshMock |
|---|---|---|
| Tool names | `read`, `edit` | `hashline_read`, `hashline_edit` (avoids conflict with built-in) |
| Single-line safety | Hash validates line number | Hash + **`current` content match** required |
| Hash impl | xxhashjs (npm dep) | Inline pure-JS xxHash32 (zero deps, works on Bun) |
| `replace_text` | ✅ | ❌ |
| Image support | ✅ | ❌ |
| Line count limits | 2000 lines default | 2000 lines default |
| Scope | Full read+edit override | Edit-only; uses built-in `read` still |
| Size | ~12 source files | **3 source files** (minimalist) |
| Claimed improvement | — | +8% Gemini, +14.4% Claude Sonnet 4.5 edit success rate |

---

### 4. YuGiMob-pi-hashline-edit-pro (Fork, `pi-hashline-edit-pro` v0.8.0)

**Hash algorithm:** xxHash32 via `xxhash-wasm` (WASM) → **3-char URL-safe base64 alphabet** `A-Za-z0-9-_` (64 chars, 18-bit entropy). **Perfect hashing with collision resolution** — if a hash collides with an already-assigned hash, it's incremented via retry (`R{retry}`) until unique. Every line gets a unique anchor.

**Edit schema:** Tool renamed to `replace` (not `edit`). Uses `start`/`end` anchors (hash-only, **no line numbers** in wire format). `{ start: "ve7", end: "ve7", lines: [...] }`.

**Output format:** `HASH│content` (hash only, no line number, e.g. `0qH│function hello() {`).

**Key differences from origin:**
| Area | RimuruW (origin) | YuGiMob-pro |
|---|---|---|
| Hash length | 2 chars, 8-bit | **3 chars, 18-bit** |
| Hash alphabet | 16-char custom | **64-char base64url** (full entropy) |
| Collisions | Duplicate hashes allowed | **Perfect hashing** (every line unique) |
| Anchor format | `LINE#HASH` (line number + hash) | **Hash-only** (`HASH`), no line numbers |
| Tool name | `edit` | `replace` |
| `replace_text` | ✅ Normalized | ❌ Rejected with `[E_LEGACY_SHAPE]` |
| Auto-read after write | ❌ | ✅ Optional (`/toggle-auto-read`) |
| Separator | `:` colon | `│` box-drawing |
| Bare-prefix detection | Simple regex | **Multi-tier** with hash-set cross-check |
| `HASH_LENGTH` configurable | ❌ | ✅ Constant in `hash.ts` |

---

### 5. coctostan-pi-hashline-readmap (`pi-hashline-readmap` v0.9.2)

**Not a fork** — a **superset** that wraps the hashline concept into a much larger unified extension.

**Hash algorithm:** xxHash32 via `xxhash-wasm` → **3-char hex** `0-9a-f` (16³ = 4096 buckets). Uses `LINE:HASH|content` format (e.g. `45:4bf|...`).

**Edit schema:** Structured edit types: `set_line` (single), `replace_lines` (range), `insert_after`, `replace` (substring). All use named anchor fields, not a generic `op` enum.

**Output format:** `LINE:HASH|content`.

**Key differences — this is a full tool suite, not just read/edit:**
| Area | RimuruW (origin) | coctostan-readmap |
|---|---|---|
| Scope | `read` + `edit` only | **`read`, `edit`, `grep`, `ls`, `find`, `write`, `nu`, `ast_search`, bash compressor** |
| Structural maps | ❌ | ✅ File structure maps, symbol-aware navigation |
| AST search | ❌ | ✅ `ast_search` via `ast-grep` |
| Symbol lookup | ❌ | ✅ `read({ symbol: "funcName" })` |
| Bash output compression | ❌ | ✅ Filters test/build/git/docker noise |
| Context hygiene | ❌ | ✅ Context budget tracking, stale context retirement |
| Doom-loop detection | ❌ | ✅ Repeated edit-failure patterns |
| File exploration | ❌ | ✅ Agent-friendly `ls` and `find` |
| NuShell exploration | ❌ | ✅ Optional `nu` tool |
| Image passthrough | ✅ | ✅ (pi-compatible) |
| Hash length | 2-char (custom alphabet) | 3-char (hex) |
| Anchor separator | `#` | `:` |
| Content separator | `:` | `\|` |
| Relocation | ❌ Strict only | ✅ Configurable relocation window |
| Prompt metadata system | ❌ | ✅ `defineToolPromptMetadata()` per tool |
| TUI diff component | ❌ | ✅ Custom `tui-diff-component`/`tui-diff-renderer` |
| Persistent map cache | ❌ | ✅ Disk cache for file maps |
| Language mappers | ❌ | ✅ Dedicated mappers for TS, JS, Python, Rust, Go, Java, C/C++, Swift, Shell, SQL, Markdown, JSON, YAML, TOML, CSV, GDScript; tree-sitter for Rust/C++/Java; ctags fallback |
| Diff preview | `details.diff` | `details.diff` + no-color textual `+`/`-`/space gutter |

---

## Summary Table

| Feature | RimuruW (origin) | JerryAZR | JoshMock | YuGiMob-pro | coctostan-readmap |
|---|---|---|---|---|---|
| npm name | `pi-hashline-edit` | `@jerryan/pi-hashline-edit` | `@the-agency/pi-hashline-edit` | `pi-hashline-edit-pro` | `pi-hashline-readmap` |
| Version | 0.7.0 | 0.11.3 | 0.2.1 | 0.8.0 | 0.9.2 |
| Hash algo | xxHash32 | FNV-1a | xxHash32 (inline) | xxHash32 (WASM) | xxHash32 (WASM) |
| Hash chars | 2 (custom) | 2 (hex) | 2 (custom) | 3 (base64url) | 3 (hex) |
| Context hashing | ❌ | ✅ (neighbors) | ❌ | ❌ | ❌ |
| Collision resolution | ❌ | ❌ | ❌ | ✅ (perfect) | ❌ |
| Anchor format | `LINE#HASH` | `LINE#HASH` | `LINE#HASH` | `HASH` only | `LINE:HASH` |
| Separator | `#` + `:` | `#` + `│` | `#` + `:` | `│` only | `:` + `\|` |
| Tool design | `edit` w/ `op` | `edit` + `insert` split | `hashline_edit` w/ `op` | `replace` only | Structured edit types |
| Fuzzy relocation | ❌ strict | ✅ 3-tier | ❌ strict | ❌ strict | ✅ configurable |
| Image support | ✅ | ✅ | ❌ | ✅ | ✅ |
| Raw read mode | ❌ | ✅ | ❌ | ❌ | ❌ |
| Extra tools | — | grep, insert, undo, /tool-usage | — | auto-read after write | grep, ls, find, write, nu, ast_search, bash compressor |
| Source files | 12 | 19 | 3 | 12+1 dir | 49 |
| Complexity | Medium | High | Low | Medium | Very high |
| Drop-in replacement | ✅ | ✅ | ✅ (edit only) | ✅ | ✅ (superset) |

---

### Bottom Line

- **RimuruW** is the clean reference implementation — strict, correct, minimal.
- **JerryAZR** adds the most safety guardrails (fuzzy relocation, context hashing, split tools, full-file deletion guard, undo) at the cost of complexity.
- **JoshMock** is the leanest — 3 files, self-contained, zero dependencies, requires `current` content for single-line edits.
- **YuGiMob-pro** focuses on hash entropy (3-char base64url, 18-bit, collision-free) and drops line numbers from anchors entirely.
- **coctostan-readmap** is a different beast — full tool suite replacement (read, edit, grep, ls, find, write, ast_search, bash compression) with structural maps, symbol navigation, and context hygiene.