Read a UTF-8 text file or a supported image. Text lines are prefixed `HASH│content` by default — copy only the 3-character hash before │ into `edit` or `insert`.

Use `offset` and `limit` to page through. Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}; when truncated, the tail of the output tells you the next `offset`.

Set `raw: true` to skip hash prefixing and return plain text. Don't use if you plan to edit this file — saves tokens on exploration, documentation, and reference reads.

For debugging, `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` displays `LINE#HASH│content`, but mutating tools still accept only the 3-character hash.