# pi-hashline-edit

Focused merged hashline editor for pi with split tools, atomic writes, stale-anchor safety, and 3-character perfect anchors.

Every text line returned by `read` is prefixed with a compact hash anchor. Mutating tools use those hashes instead of raw search text, so stale or ambiguous edits are rejected before writing the file.

## Extensions

Default loaded extensions:
- `extensions/core.ts` (`read`, `edit`)
- `extensions/insert.ts` (`insert`)
- `extensions/grep.ts` (`grep`)

Optional disabled-by-default extensions:
- `extensions/undo.ts`

Enable optional extensions explicitly:

```json
{
  "packages": [{
    "source": "npm:pi-hashline-edit",
    "extensions": [
      "extensions/core.ts",
      "extensions/insert.ts",
      "extensions/grep.ts",
      "extensions/undo.ts"
    ]
  }]
}
```

## `read`

Text files are returned as `LINE#HASH│content` by default:

```text
1#aB3│function hello() {
2#xY7│  console.log("world");
3#qR9│}
```

Use the line number before `#` for `offset`/`limit`. Copy only the 3-character hash between `#` and `│`; do not include `│`, content, line numbers, or `#`.

Parameters:
- `path` — file path to read.
- `offset` — optional 1-indexed starting line.
- `limit` — optional maximum number of lines.
- `raw` — returns plain text without anchors. Do not use `raw` if you plan to edit.

Set `PI_HASHLINE_ANCHOR_DISPLAY=hash` to display legacy `HASH│content`; mutating tools still accept only hash-only anchors.

## `edit`

Replace an inclusive range using hash-only anchors:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "start": "xY7", "end": "xY7", "lines": ["  console.log('hashline');"] }
  ]
}
```

- `start` and `end` are 3-character hashes from a fresh `read` or successful edit diff.
- Use the same hash for a single-line replacement.
- `lines` must be literal file content, not rendered hashline output.
- Use `[]` to delete the range.

## `insert`

Insert lines before or after an existing anchor line:

```json
{
  "path": "src/main.ts",
  "edits": [
    { "anchor": "aB3", "direction": "after", "lines": ["  const value = 1;"] }
  ]
}
```

`insert` preserves the anchor line and only adds new content.

## Optional `grep`

`grep` searches files and emits the same hash-only anchors as `read`:

```text
aB3│matching line
```

Use the 3-character hash before `│` directly in `edit.start`, `edit.end`, or `insert.anchor`.

## Optional `undo`

`undo` reverts the most recent hashline edit snapshot in the current session when it is still within the undo window.

## Migration from JerryAZR

- `LINE#HH│content` is now `HHH│content` by default.
- `range: ["42#A4", "45#C7"]` is now `start: "aB3", end: "xY7"`.
- Hashes are 3-character base64url anchors with per-file collision resolution.
- `grep` and `undo` ship as optional extensions but are not enabled by default.

## Safety guarantees

- Hash-only anchors are validated against the current file snapshot.
- All edits in one call validate before any write is performed.
- Writes are atomic and preserve line endings where possible.
- Large full-file deletion attempts are guarded.
- Rendered hashline prefixes inside `lines` are rejected instead of silently stripped.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm test
```

## License

[MIT](LICENSE)
