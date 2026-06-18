Replace content in a UTF-8 text file using 3-character hash anchors copied from `read`. The entire anchor range is deleted and only `lines` survives — if you want to keep any original lines from the range, you must copy them into `lines`.

Submit one `edit` call per file. All operations go in a single `edits` array; anchors must come from the same fresh source — the most recent `read` or diff output of a successful `edit` on this file.

Each edit entry drops the current anchor range and replaces it with `lines`:
```json
{ "start": "aB3", "end": "aB3", "lines": [...] }
```
- `start` — 3-character hash anchor copied from read output.
- `end` — 3-character hash anchor copied from read output. Use the same hash for single-line edits.
- `current` — optional exact current line text for single-line replacements.
- `lines` — replacement content (string array). The range is wiped and replaced by exactly these lines. Copy any original lines you want to keep. Use `[]` to delete.
  Must be literal file content, not HASH│-prefixed output. Match indentation exactly.

Copy only the 3-character hash before │. Do not include line numbers, #, │, or content.

Example:
```json
{
  "path": "src/main.ts",
  "edits": [
    { "start": "aB3", "end": "aB3", "lines": ["  console.log('hashline');"] }
  ]
}
```

Rules:
- Do not guess or construct anchors. Copy them from the most recent `read` or diff output of this file.
- Do not emit overlapping or adjacent edits — merge them into one.
