# Refactor plan

## 1. Hash algorithm — `src/hashline.ts`

- **Replace `xxhashjs` with inline FNV-1a (mask reduction).**
  Drop the `xxhashjs` npm dependency. Implement FNV-1a inline: offset basis `0x811c9dc5`, prime `0x01000193`, mask reduction `hash & 0xFF`. No fold variant needed.

- **Always incorporate `lineIndex` unconditionally.**
  Remove the `RE_SIGNIFICANT` regex check and the conditional seed logic. XOR `lineIndex` into the starting hash value on every call. Two blank lines at different positions will always get different hashes.

- **Switch hash alphabet to standard hex.**
  Replace `ZPMQVRWSNKTXJBYH` → `0123456789ABCDEF`. Update `NIBBLE_STR`, `DICT`, and `HASH_ALPHABET_RE`. Update the README's Hashing section to document the hex alphabet (and drop the elaborate justification).

- **Update `computeLineHash`** to accept the new algorithm and return hex pair strings (e.g. `A4`, `3F`).

## 2. Boundary duplication — `src/hashline.ts`

- **Add symmetric Variant A check.**
  Current code at `applyHashlineEdits` checks only `edit.lines.at(-1)` against `fileLines[endLine]` (next surviving line). Add a mirror check for `edit.lines[0]` against the line immediately before the replaced range (`fileLines[startLine - 2]` when `startLine > 1`). Emit the same warning style.

## 3. Published schema — `src/edit.ts`

- **Hide deprecated top-level fields from the model's view.**
  The runtime still accepts `oldText`, `newText`, `old_text`, `new_text` for backward compatibility, but remove them from the TypeBox schema descriptions. The model only sees `path`, `returnMode`, `returnRanges`, `edits`.

- **Simplify `lines` type in published schema.**
  Runtime still accepts `Array | String | null`, but the published schema shows `Array` only. The model never uses the other variants (0 out of 201 uses).

## 4. Compatibility modules

- **Remove `src/compatibility-notify.ts`.**
  No longer needed if legacy fields are hidden from the schema — there's nothing to notify about.

- **Remove `src/edit-compat.ts` call from `index.ts`.**
  Keep the module in `src/` but don't register it. Or delete it entirely if no other callers exist.

## 5. Prompts — `prompts/edit.md`

- **Add a multi-line `replace` example.** Show `pos`, `end`, and `lines` working together for a range replacement.

- **Clarify `end` field.** Change "limit position" to "inclusive end anchor of the range to replace. Copy from read output."

- **Add a rule about `lines` vs anchors.**
  "Anchors define the range being replaced. `lines` is the literal new content for that entire range — do not include content from lines before or after the `pos..end` span."

- **Add a `replace_text` example.** Show `"op": "replace_text"` with `oldText`/`newText` so the model doesn't learn the wrong pattern from deprecated field descriptions.

## 6. README

- Already updated with "Differences from upstream" section.
- Update the "Hashing" section to reflect hex alphabet.

## 7. Tests

- Update expected hash values across all test fixtures.
- Add test for Variant A boundary warning.
- Add test that `lineIndex` is always incorporated (two blank lines ≠ same hash).
- Verify legacy fields still accepted at runtime (backward compat).
