Read a UTF-8 text file or a supported image. Text lines are prefixed `LINE#HASH│content` by default.

Use the line number before `#` for `offset`/`limit` navigation. Copy only the 3-character hash between `#` and `│` into `edit` or `insert`; mutating tools reject line-qualified anchors.

Use `offset` and `limit` to page through. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}; when truncated, the tail of the output tells you the next `offset`.

Set `raw: true` to skip hash prefixing and return plain text. Don't use if you plan to edit this file — saves tokens on exploration, documentation, and reference reads.

Set `PI_HASHLINE_ANCHOR_DISPLAY=hash` to display legacy `HASH│content` output.