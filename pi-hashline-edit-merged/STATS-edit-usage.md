# Edit tool usage statistics

**Source:** 4 session logs, 317 edit tool calls, 397 individual edit items

## Sessions analyzed

| Session | Calls | Items |
|---|---|---|
| tModLoader (May 16) | 121 | 147 |
| Remotion-BevyTD (May 28) | 97 | 111 |
| Bevy-tower-defense (May 26) | 49 | 78 |
| tModLoader (May 19) | 50 | 61 |

---

## Operation distribution

| Op | Count | % |
|---|---|---|
| `replace` | 197 | 74.6% (of valid) |
| `replace_text` | 60 | 22.7% |
| `prepend` | 4 | 1.5% |
| `append` | 3 | 1.1% |
| *(no op)* | 133 | — |

`replace` dominates. `append`/`prepend` are barely used.

---

## Malformed edit items (rejected by runtime)

| Category | Count | % of all items |
|---|---|---|
| **Missing `op` field** (all are `oldText`+`newText` without `"op": "replace_text"`) | 133 | 33.5% |
| `replace` missing `lines` | 3 | 0.8% |
| `replace` missing `pos` | 1 | 0.3% |

**Summary:** ~34% of edit items (133+/397) are structurally invalid. Every
single one of the 133 missing-op items uses `oldText`/`newText` inside the
`edits` array but omits `"op": "replace_text"`. The model copies the
legacy top-level field names into the structured array without declaring
the op.

---

## `replace`: end anchor usage

| | Count | % |
|---|---|---|
| With `end` | 144 | 73.1% |
| Without `end` | 53 | 26.9% |

**Potential Failure Mode 1** (multi-line `lines` but no `end`): **24
replaces (12.2%)**. Among without-end replaces, 45.3% have >1 line in
`lines` — these are almost certainly the model intending a range replace
but forgetting `end`.

**lines_count when `end` is omitted:**

| lines_count | Count |
|---|---|
| 0 | 5 |
| 1 | 24 |
| 2 | 10 |
| 3-6 | 10 |
| 8-33 | 4 |

24 replaces are single-line (legitimate). 29 replaces (55%) have >1 line
— 24 of those would produce FM1 (old text persists alongside new), and 5
have `lines_count=0` (deletions that only delete 1 line instead of a
block).

---

## Forbidden fields on valid ops

| Op | Field(s) | Count |
|---|---|---|
| `replace` | `oldText`/`newText` | 2 |

Minimal forbidden-field misuse on valid ops. The real problem is the
missing-op category (structurally invalid, not forbidden-fields-in-valid).

---

## Return modes

| Mode | Count |
|---|---|
| `changed` (default) | 317 |

Never used `full` or `ranges`. `returnRanges` never used. The model
exclusively relies on the default changed-mode anchor block for chaining.

---

## `replace_text`: oldText lengths

| Range | Count |
|---|---|
| 0–99 chars | 46 |
| 100–199 | 10 |
| 200–299 | 2 |
| 400–499 | 1 |
| 600–699 | 1 |

Min: 3, Max: 664, Avg: 86. Most replace_text usages are small targeted
replacements; a few are large block replacements (which would be better
served by anchored `replace`).

---

## `append` / `prepend`: pos usage

| | With `pos` | Without `pos` |
|---|---|---|
| `append` | 0 | 3 |
| `prepend` | 1 | 3 |

All appends are EOF. Nearly all prepends are BOF. The model doesn't use
anchored insertions — it either replaces via anchors or inserts at file
boundaries.

---

## Key takeaways

1. **The biggest problem is missing `op` (33.5% of items).** The model
   treats `{ "oldText": ..., "newText": ... }` as a valid edit item
   without realizing it needs `"op": "replace_text"`. This is a prompt
   gap — the legacy top-level API and the structured API share field names
   but have different requirements.

2. **26.9% of replaces omit `end`; 12.2% are likely FM1.** The model
   routinely forgets the `end` anchor on multi-line replacements.

3. **No one uses `full`/`ranges` return modes or `returnRanges`.** The
   feature exists but has zero adoption in these sessions.

4. **`append`/`prepend` are barely touched** — the model strongly prefers
   `replace` + anchors for everything.
