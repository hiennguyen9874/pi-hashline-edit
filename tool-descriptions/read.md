Read a UTF-8 text file or a supported image. For planning, design, review, answering questions, documentation, or reference reads, set `raw: true` to return plain text and save tokens.

Without `raw: true`, text lines are prefixed `LINE#HASH│content` for edit/insert anchors. Use this default when you plan to mutate the file.

Use the line number before `#` for `offset`/`limit` navigation. Copy only the 3-character hash between `#` and `│` into `edit` or `insert`; mutating tools reject line-qualified anchors.

Use `offset` and `limit` to page through. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}; when truncated, the tail of the output tells you the next `offset`.

Set `PI_HASHLINE_ANCHOR_DISPLAY=hash` to display legacy `HASH│content` output.