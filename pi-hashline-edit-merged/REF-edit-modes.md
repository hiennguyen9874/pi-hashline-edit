# Edit tool modes reference

## Operations (`edits[].op`)

### 1. `replace` — line-based anchored replacement

| Field | Required? | Notes |
|---|---|---|
| `pos` | required | Anchor copied from `read` output. First line to replace. |
| `end` | optional | If provided, replaces the inclusive range `pos`..`end`. If omitted, replaces only the single line at `pos`. |
| `lines` | required | Literal new content. Replaces everything from `pos` to `end` (or just `pos`). |
| `oldText` | forbidden | |
| `newText` | forbidden | |

**Intended use:** Replace exactly the line(s) between `pos` and `end`
(both inclusive) with `lines`. Use after `read` to get fresh anchors.

**Common mistake:** Omitting `end` when intending to replace multiple
lines. Without `end`, `endLine` defaults to `pos.line`, so only one line
is replaced regardless of how many entries `lines` has.

---

### 2. `append` — insert lines after a position

| Field | Required? | Notes |
|---|---|---|
| `pos` | optional | Anchor copied from `read` output. If provided, inserts after this line. If omitted, inserts at EOF. |
| `lines` | required | Content to insert. |
| `end` | forbidden | |
| `oldText` | forbidden | |
| `newText` | forbidden | |

**Intended use:** Add new content after a known line, or at end of file.

---

### 3. `prepend` — insert lines before a position

| Field | Required? | Notes |
|---|---|---|
| `pos` | optional | Anchor copied from `read` output. If provided, inserts before this line. If omitted, inserts at BOF. |
| `lines` | required | Content to insert. |
| `end` | forbidden | |
| `oldText` | forbidden | |
| `newText` | forbidden | |

**Intended use:** Add new content before a known line, or at start of file.

---

### 4. `replace_text` — text-based replacement

| Field | Required? | Notes |
|---|---|---|
| `oldText` | required | Exact text to replace. Must have exactly one unique occurrence in the file. |
| `newText` | required | Replacement text. |
| `pos` | forbidden | |
| `end` | forbidden | |
| `lines` | forbidden | |

**Intended use:** Replace one exact unique occurrence of `oldText` with
`newText`. Only when the match is guaranteed unique; otherwise re-read and
use anchored `replace`. No anchors needed — the runtime searches the file
for the exact text.

---

### Deprecated: legacy top-level replacement

Top-level fields (no `edits` array). Cannot be mixed with structured
`edits`. Mixing camelCase and snake_case is rejected.

| Field | Required? | Notes |
|---|---|---|
| `oldText` / `old_text` | required (one pair) | Text to replace (exact unique match). |
| `newText` / `new_text` | required (one pair) | Replacement text. |

---

## Return modes (`returnMode`)

| Mode | What the model receives in `text` | Requires |
|---|---|---|
| `changed` (default) | `--- Anchors A-B ---` block with fresh `LINE#HASH` for the changed region (±2 context lines, max 12 lines) | — |
| `full` | Message pointing to `details.fullContent` | — |
| `ranges` | Message pointing to `details.returnedRanges` | `returnRanges` (non-empty array) |

**`changed`** is the default and the primary workflow mode. The model
receives fresh anchors for the edited region and can chain follow-up edits
without re-reading.

**`full`** and **`ranges`** put preview content in `details` (host UI
only); the model gets a pointer message but no anchors. For distant
follow-ups after these modes, or on any error, the model must `read`
again.

---

## `returnRanges` (only when `returnMode` is `ranges`)

Each range: `{ start: <int ≥1>, end?: <int ≥1> }` (both 1-indexed).

Returns `LINE#HASH` previews for the requested post-edit line ranges in
`details.returnedRanges`. Not visible to the model in `text`.

---

## Summary: field requirement matrix

| op | `pos` | `end` | `lines` | `oldText` | `newText` |
|---|---|---|---|---|---|
| `replace` | required | optional (range if present) | required | forbidden | forbidden |
| `append` | optional (anchored if present, EOF if absent) | forbidden | required | forbidden | forbidden |
| `prepend` | optional (anchored if present, BOF if absent) | forbidden | required | forbidden | forbidden |
| `replace_text` | forbidden | forbidden | forbidden | required | required |
