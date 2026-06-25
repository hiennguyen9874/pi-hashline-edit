Search file contents for a regex or literal pattern. Output is grouped by file with hashline anchors:

```text
aB3│matching line
```

Use the 3-character hash before `│` directly in `edit.start`, `edit.end`, or `insert.anchor`. Do not include line numbers, `#`, `│`, or content.

`grep` is enabled by default and returns hashline anchors usable by `edit` and `insert`. It respects .gitignore by default.

**Parameters:**
- `pattern` (required) — regex or literal search pattern
- `path` (optional) — directory or file to search; defaults to the project root
- `glob` (optional) — file filter, e.g. `*.ts` or `**/*.spec.ts`
- `ignoreCase` (optional) — case-insensitive mode; default false
- `literal` (optional) — treat pattern as a literal string; default false
- `context` (optional) — lines of context before/after each match; default 0
- `limit` (optional) — maximum matches returned; default 100

Output is truncated at 100 matches or 50KB, whichever comes first. Capped matches display a truncation notice. Long lines (>500 chars) are truncated with a `…` suffix.