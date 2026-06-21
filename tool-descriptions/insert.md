Patch a text file by inserting new lines between existing ones. This tool
does NOT change or delete any existing lines — it only adds new content.

Submit one `insert` call per file. Put all insertions for that file in `edits`.

Each entry is an insertion operation:
- `anchor`: a 3-character hash anchor copied from read output. Required for `"after"`/`"before"`; omit for `"head"`/`"tail"`. In `LINE#HASH│content`, copy only `HASH`; do not include line numbers, #, │, or content.
- `direction`: `"after"` to insert after the anchor line, `"before"` to insert before it, `"head"` to insert at the start of the file, or `"tail"` to insert at the end of the file.
- `lines`: the new content to insert (each array entry is one line).
- `current`: optional exact current text of the anchor line. If provided and the live anchor line differs, the insert is rejected with `E_CURRENT_MISMATCH`.

The anchor line itself is preserved for `"after"`/`"before"` — `lines` are inserted after or before it.
Do not include the anchor line's content in `lines` unless intentional duplication.
Do not use `after` or `before` as object keys. Use `anchor` plus `direction` for anchored inserts, or only `direction` for `"head"`/`"tail"`.

Example:
```json
{
  "path": "src/main.ts",
  "edits": [
    { "anchor": "xY7", "direction": "after", "current": "import './setup';", "lines": ["import { foo } from './lib';"] },
    { "direction": "tail", "lines": ["export { foo };"] }
  ]
}
```