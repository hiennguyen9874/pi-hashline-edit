# pi-hashline-edit Resources

## Knowledge

- [Source: `src/hash-format.ts`](../src/hash-format.ts)
  Hash computation engine: xxHash with context-aware hashing, collision resolution, base64url alphabet. Use for: understanding how the 3-character anchor hashes are produced.

- [Source: `src/hashline.ts`](../src/hashline.ts)
  Core hashline engine: buildHashlineFile, resolveEditAnchors, resolveEditSpans, applySpans, formatMismatchError, noop detection, boundary duplication warnings. Use for: the edit engine pipeline.

- [Source: `src/anchor-display.ts`](../src/anchor-display.ts)
  Display formatting: ANCHOR_SEP, CONTENT_SEP, formatAnchorPrefix, display mode switching. Use for: understanding the LINE#HASH│content rendering.

- [Source: `src/read.ts`](../src/read.ts)
  Read tool implementation: formatHashlineReadPreview, registerReadTool, snapshot recording, truncation handling. Use for: how the read tool produces hashline output.

- [Source: `src/edit.ts`](../src/edit.ts)
  Edit tool implementation: schema validation, normalizeEditItems, resolveEditTarget, renderCall/renderResult, registerEditTool. Use for: the edit tool lifecycle.

- [Source: `src/insert.ts`](../src/insert.ts)
  Insert tool implementation: schema validation, normalizeInsertItems, registerInsertTool, snapshots. Use for: the insert tool lifecycle.

- [Source: `src/mutation.ts`](../src/mutation.ts)
  Shared mutation engine: applyMutation, 3-tier anchor resolution (exact → fuzzy → 3-way merge), atomic write orchestration. Use for: the complete edit/insert pipeline.

- [Source: `src/fs-write.ts`](../src/fs-write.ts)
  Atomic file writes: symlink-safe path resolution, temp-file + rename strategy, hardlink fallback. Use for: understanding write safety guarantees.

- [Source: `src/edit-diff.ts`](../src/edit-diff.ts)
  Diff generation: line ending detection/normalization, BOM stripping, unified diff with hashline anchors. Use for: how edit results are diffed.

- [Source: `src/fuzzy-match.ts`](../src/fuzzy-match.ts)
  Anchor resolution: partitionExact, fuzzyMatch, attachSnapshotLines, relocation warnings. Use for: understanding the 3-tier resolution strategy.

- [Source: `src/merge.ts`](../src/merge.ts)
  Three-way merge: git-like rebase for stale-anchor recovery. Use for: understanding how edits survive file changes.

- [Source: `src/read-snapshot.ts`](../src/read-snapshot.ts)
  Snapshot storage: in-memory last-read snapshot for 3-way merge fallback. Use for: how stale anchors are recovered.

- [Source: `extensions/core.ts`](../extensions/core.ts)
  Extension entrypoint: registers read and edit tools with Pi runtime. Use for: understanding extension registration.

- [Source: `extensions/insert.ts`](../extensions/insert.ts)
  Insert extension entrypoint: registers insert tool. Use for: understanding insert registration.

## Wisdom (Communities)

- [AGENTS.md](../AGENTS.md) — the project's own architecture guardrails and protocol invariants. The closest thing to a community standard for this codebase.
