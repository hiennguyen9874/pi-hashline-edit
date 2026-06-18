# Silent edit failures and field misuse

## Part 1: Observed failure modes

Two recurring failure modes produce broken files even though the `edit` tool returns success (no `[E_*]` error). The edits are structurally valid — correct anchors, valid op — but semantically wrong.

### Failure mode 1: Single-anchor replace for multi-line intent

**Observation:** The model provides only `pos` (no `end`) when it intends to replace a block of lines. The runtime treats this as a single-line replace: only the line at `pos` is swapped out. The rest of the old block survives alongside the new content, producing garbled output.

Example — model wants to replace lines 5–8 with 3 new lines, but sends:

```json
{ "op": "replace", "pos": "5#AB", "lines": [
  "new line 1",
  "new line 2",
  "new line 3"
] }
```

Without `end`, only line 5 is replaced. Lines 6–8 remain unchanged. The file ends up with an interleaved mess of new and old lines.

**Usage data:** Across 4 sessions / 197 `replace` ops, **26.9% omit `end`**. Of those, **45.3% have `lines_count > 1`** — 24 replaces (12.2% of all replaces) where the model supplied multiple new lines but no end anchor, making FM1 nearly certain.

### Failure mode 2: Boundary line duplication

**Observation:** After an edit, a line immediately before or after the edited block appears twice — once in its original position and once embedded in the replacement text. This was detected by examining the actual diffs in the tool results (not just the runtime warning, which only covers one variant).

**Two variants, detected by scanning the diff output:**

**Variant A** (first added line duplicates the line before the block): the model includes the preceding line's content as the first entry in `lines`. The original preceding line persists, so that content appears twice: once as the boundary line and once at the start of the insertion.

**Variant B** (last added line duplicates the line after the block): the model includes the following line's content as the last entry in `lines`. The original following line persists, so that content appears twice: once at the end of the insertion and once as the boundary line.

**Usage data (diff-based, 265 results with diff data):**

| | Count | % of change-producing edits |
|---|---|---|
| Total boundary duplications | 23 | **8.7%** |
| Variant A (first line dups preceding) | 15 | 5.7% |
| Variant B (last line dups following) | 8 | 3.0% |

**The runtime only detects Variant B**, and even then only emits a warning (`Potential boundary duplication after replace …`) without rejecting the edit. Variant A — 65% of all boundary duplications — has no detection at all. The `hashline.ts` check at line 829 only inspects `edit.lines.at(-1)` against `fileLines[endLine]` (the next surviving line). There is no symmetric check for `edit.lines[0]` against the preceding line.

### Why the runtime cannot catch these

The runtime cannot distinguish "I deliberately replaced one line with five" from "I meant to replace five lines with five but forgot `end`." Both produce structurally identical tool calls with valid anchors.

For boundary duplication, the runtime has a partial detection — it checks whether the last line of `lines` matches the next surviving line after trim (Variant B only). But this is a warning, not a rejection. And there is **no symmetric check at all** for Variant A (first line of `lines` matching the preceding line), which accounts for 65% of observed boundary duplications.

---

### I had an AI agent review the tool schema and prompts. Here are the possible causes and fixes:

**Cause 1 — `end` is framed as optional/alternative, not as the way to express range intent.** The prompt says: `replace the line at pos, OR the inclusive range pos..end, with lines`. The word "OR" makes `end` sound like an alternative mode rather than the mechanism for multi-line replacement. The only example shows single-line: `{ "op": "replace", "pos": "12#MQ", "lines": ["const x = 1;"] }`. The schema describes `end` merely as "limit position" — it never says "this is how you specify the last line to replace."

**Fix:** Add a multi-line `replace` example alongside the existing one. Change the op description from "or the inclusive range pos..end" to something that communicates end is *how* you express range, e.g. "replace the line at pos. Add end to replace an inclusive range pos..end." Clarify the `end` schema description to "inclusive end anchor of the range to replace (copy from read output)."

**Cause 2 — No guidance on what `lines` contains relative to anchors.** The model sees `LINE#HASH:content` in read output and naturally copy-pastes boundary content into `lines`. No prompt says: "Anchors define the span being replaced. `lines` is the complete replacement for that span — do not include content from lines outside the pos..end range."

**Fix:** Add a rule explicitly stating the separation of concerns: anchors define the range boundary, `lines` defines the new content for that entire range. The content after `:` in anchors is for the model's reference; it does not belong in `lines` unless the model intends to keep that specific line as part of the replacement.

**Cause 3 — The edit response feedback loop, and a one-sided runtime check.** After a successful edit in `changed` mode, the model receives `--- Anchors A-B ---` with fresh `LINE#HASH:content` lines. If it copies the content portion into the next edit's `lines`, it will duplicate boundary lines. The response block serves as anchor refresh but also looks similar enough to read output that the model may treat the content as "what should go into lines."

Compounding this: the runtime's boundary-duplication warning only checks one direction (last line vs. next surviving line). 65% of observed duplications are the other direction (first line matches preceding context), which has no detection at all. Adding the symmetric check would at minimum surface these cases as warnings.

---

## Part 2: Field misuse and compatibility-mode confusion

### Numbers

Across 4 sessions, 317 edit tool calls containing 397 individual edit items:

| | Count | % of all items |
|---|---|---|
| Items **missing `op`** | 133 | 33.5% |
| All 133 are `oldText`+`newText` without `"op": "replace_text"` | 133 | 33.5% |
| `replace` op with forbidden `oldText`/`newText` fields | 2 | 0.5% |
| `replace` missing `lines` | 3 | 0.8% |
| `replace` missing `pos` | 1 | 0.3% |
| Legacy top-level `oldText`/`newText` (deprecated path) | 0 | 0.0% |

Additionally, the `lines` field accepts `Array | String | null` per the schema. Across all 204 `replace`/`append`/`prepend` items:

| `lines` form | Count | % |
|---|---|---|
| String array | 201 | 98.5% |
| Plain string | **0** | 0.0% |
| null | 0 | 0.0% |
| Missing | 3 | 1.5% |

The model uses the array form exclusively. The `String` and `null` variants in the union type are dead weight — they appear in the schema description but the model never reaches for them.

**One-third of all edit items are structurally invalid because the model puts `oldText`/`newText` inside the `edits` array without declaring `"op": "replace_text"`.** The items look like:

```json
{ "oldText": "...", "newText": "..." }
```

This is not valid in the structured API, and the runtime rejects it with `Edit N requires an "op" string.`

The model never uses the actual deprecated legacy top-level path (0 instances). It has learned that `oldText`/`newText` are the "text replacement fields" but doesn't understand the structural distinction between the top-level and the edits-array contexts.

### How the compatibility layer is causing this

The schema currently documents three parallel surfaces for the same operation, all visible to the model simultaneously:

1. **Edits array with `"op": "replace_text"`** — the intended path. `edits[].oldText` + `edits[].newText`.

2. **Deprecated top-level camelCase** — `oldText` + `newText` at the call root. Description says: "Deprecated. Use edits[].oldText with op replace_text."

3. **Deprecated top-level snake_case** — `old_text` + `new_text` at the call root. Description says: "Deprecated. Use oldText or edits[].oldText."

The model reads these descriptions and concludes: "I should put `oldText` and `newText` into the edits array." That part is correct. But it **stops there** — it doesn't register that `"op": "replace_text"` is also required, because the field names `oldText`/`newText` themselves signal "replace_text" to a human but not to an LLM. The op field is a separate concept that the model must connect explicitly.

The deprecated fields are acting as an **attractive nuisance**: they advertise the field names the model should use without teaching it the surrounding structure those fields require. The model assembles the pieces it recognizes (`oldText` + `newText` in edits) and omits the piece it doesn't (`op`), because no prompt or schema description draws the connection.

### Suggestion

Remove the deprecated top-level fields from the schema description entirely, or at minimum stop cross-referencing them in field descriptions (e.g. "Deprecated. Use edits[].oldText with op replace_text"). Each cross-reference reads as a tutorial on how to upgrade from the old API, but the model executes the tutorial incompletely — it follows the "move oldText into edits[]" instruction and misses the "with op replace_text" clause.

If the legacy surface must stay for backward compatibility, keep the fields accepted at runtime but remove them from the published schema descriptions and prompt text. The model doesn't need to know the deprecated path exists.

Similarly, the `lines` field's `String | null` variants can be removed from the published schema. The model uses arrays exclusively (201/201); the alternate types add description surface without any value. The runtime can still accept them for backward compatibility.
