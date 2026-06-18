Patch a text file by inserting new lines between existing ones. This tool
does NOT change or delete any existing lines — it only adds new content.

Each entry is an insertion operation:
- `anchor`: a 3-character hash anchor copied from read output. Copy only the 3-character hash before │. Do not include line numbers, #, │, or content.
- `direction`: `"after"` to insert after the anchor line, or `"before"` to insert before it.
- `lines`: the new content to insert (each array entry is one line).

The anchor line itself is preserved — `lines` are inserted after or before it.
Do not include the anchor line's content in `lines` unless intentional duplication.

Example:
```json
{
  "path": "src/main.ts",
  "edits": [
    { "anchor": "xY7", "direction": "after", "lines": ["import { foo } from './lib';"] }
  ]
}
```
