Replace or delete UTF-8 text using 3-character hash anchors copied from `read`. Use `insert` instead when you only need to add lines.

Submit one `edit` call per file. Put all replacements/deletions in `edits`; anchors must come from the same fresh source — the latest `read` or successful edit diff for this file.

Call shape:
```json
{
  "path": "src/main.ts",
  "edits": [
    { "start": "aB3", "end": "aB3", "lines": ["replacement line"] }
  ]
}
```

Each edit deletes the inclusive anchor range and replaces it with exactly `lines`:
- `start` / `end`: 3-character hash anchors. Use the same hash for one line.
- `lines`: replacement file content, not rendered hashline output. Copy any original lines you want to keep. Use `[]` to delete.
- `current`: optional exact current line text for single-line replacements.

Rules:
- Put `path` only at the top level. Do not put `path` inside an edit item.
- Copy only the 3-character hash. In `LINE#HASH│content`, use only `HASH`; do not include line numbers, #, │, or content.
- Do not guess anchors; copy them from the latest `read` or successful edit diff.
- Do not emit overlapping or adjacent edits — merge them into one.
