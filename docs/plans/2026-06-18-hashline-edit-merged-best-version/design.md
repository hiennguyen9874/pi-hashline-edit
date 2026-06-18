# Design: Merged Best Version of Hashline Edit

Date: 2026-06-18

## Summary

Create a new merged hashline-edit package that uses **JerryAZR-pi-hashline-edit** as the implementation trunk and selectively merges the strongest ideas from the other four versions. The result is a focused, optimized editor package rather than a broad readmap-style tool suite.

The new version prioritizes edit correctness, model-friendly schemas, low token cost, and high-value safety guardrails. Features that are uncertain or not clearly worth their prompt/runtime cost are deferred or made opt-in.

## Feature size

**Medium.** This is a focused package merge with protocol-level changes and test updates. It should fit into no more than five implementation phases:

1. Hash and anchor protocol upgrade.
2. Core `read`/`edit`/`insert` schema and behavior updates.
3. Recovery, safety guardrails, and legacy normalization.
4. Optional `grep` and `undo` modules.
5. Documentation, migration notes, and test hardening.

## Source context and selected baseline

The workspace contains five versions:

- `RimuruW-pi-hashline-edit`: origin, strict, minimal `read`/`edit`, 2-character custom hashes.
- `JerryAZR-pi-hashline-edit`: modular focused fork with split `edit`/`insert`, `grep`, `undo`, fuzzy relocation, snapshot merge, raw reads, and safety guardrails.
- `JoshMock-hashline-edit`: small edit-focused package with an optional-like `current` content assertion concept for single-line replacement safety.
- `YuGiMob-pi-hashline-edit-pro`: strict fork with 3-character base64url anchors and perfect per-file collision resolution.
- `coctostan-pi-hashline-readmap`: broad unified tool suite with structural maps, AST search, file exploration, bash output compression, doom-loop detection, and many other features.

The merged version should use **JerryAZR** as the trunk because it already has the focused modular editor architecture, split tools, recovery pipeline, optional modules, and a comparable test surface. YuGiMob contributes the hash system. JoshMock contributes the `current` assertion idea. coctostan contributes only lightweight doom-loop detection; the full readmap suite is out of scope.

## Approaches considered

### 1. JerryAZR trunk plus selective merge — selected

Start from `JerryAZR-pi-hashline-edit`, then replace the hash/anchor protocol and add selected safety behavior.

Pros:

- Best fit for the desired focused editor scope.
- Existing split `edit`/`insert` design matches the selected schema.
- Existing recovery flow, optional `grep`/`undo`, raw read mode, atomic writes, and guardrails reduce implementation risk.
- Most changes are protocol and safety updates rather than broad feature ports.

Cons:

- Requires coordinated updates across read output, edit/insert parsing, grep output, diff rendering, prompts, and tests.
- Existing context-based 2-character hashing must be removed or replaced everywhere.

### 2. YuGiMob trunk plus feature ports

Start from the perfect-hash strict fork and add JerryAZR features.

Pros:

- Strongest existing 3-character perfect-hash implementation.
- Clean strict validation around hash-only anchors.

Cons:

- More work to add split insert, fuzzy relocation, snapshot merge, optional grep, optional undo, and JerryAZR-style modular extensions.
- Higher risk of recreating already-tested behavior.

### 3. Clean-room merge

Build a new package from scratch using the best concepts from all five.

Pros:

- Cleanest architecture on paper.
- Avoids inheriting old protocol assumptions.

Cons:

- Highest schedule and correctness risk.
- Duplicates proven code and requires a much larger test effort before trust is comparable.

## Goals

- Produce the best focused hashline editor from the five versions.
- Keep the default tool surface small and model-friendly.
- Use unique, compact anchors that work well on repeated or boilerplate-heavy files.
- Preserve high-value safety guarantees: stale detection, guarded recovery, strict patch-content validation, atomic writes, and deletion protection.
- Let useful but non-core tools exist as opt-in modules.
- Keep model-visible output compact; place rich diffs and metrics in host-only details.

## Non-goals

- Do not merge the full `pi-hashline-readmap` suite.
- Do not include `ls`, `find`, `ast_search`, structural maps, symbol reads, NuShell, or bash output compression.
- Do not include `auto-read` after writes in this design.
- Do not include `tool-usage` in this design.
- Do not include post-edit syntax validation in this design.
- Do not support fuzzy legacy text replacement.
- Do not silently autocorrect malformed edit content such as copied hashline prefixes or diff rows.

## Package and module model

The design is for a **new merged package**, not an assumed next release of any existing npm identity. Use `pi-hashline-edit-merged` as the planning name until publishing ownership is decided.

Default enabled modules:

- `read`
- `edit`
- `insert`
- lightweight doom-loop warnings

Available but disabled by default:

- `grep`
- `undo`

Configuration model:

- Use package extension selection for optional `grep` and `undo` modules.
- Use `PI_HASHLINE_ANCHOR_DISPLAY=hash` as the default protocol display mode.
- Use `PI_HASHLINE_ANCHOR_DISPLAY=line-hash` for optional line-number display.
- Do not add runtime slash commands for this design.
- Do not add per-call display toggles.

## Anchor and hash protocol

### Default read output

Default model-facing output uses hash-only anchors:

```text
aB3│const value = 1;
xY7│return value;
```

The model copies only the 3-character anchor into `edit` and `insert` calls.

### Optional line-number display

A configurable display mode may show line numbers for human readability:

```text
42#aB3│const value = 1;
43#xY7│return value;
```

Even in this mode, the canonical edit anchor remains the 3-character hash. Tool prompts must tell the model to pass only the hash. Line-qualified anchors are display-only and rejected by `edit`/`insert` with a clear error.

### Hash algorithm

Use YuGiMob-style hashing:

- `xxhash-wasm` for xxHash32.
- 3-character URL-safe base64 alphabet: `A-Z`, `a-z`, `0-9`, `_`, `-`.
- 18 bits of anchor space per base hash.
- Perfect per-file collision resolution: when a computed anchor collides with an already assigned line anchor, retry with a deterministic retry suffix until the anchor is unique.

Rationale:

- Repeated lines such as `}`, imports, or blank-ish boilerplate get distinct anchors.
- 3-character hashes are compact enough for model output while much stronger than 2-character 8-bit anchors.
- Perfect hashing removes ambiguity that context hashing only partially mitigates.

### Context hashing

Do not keep JerryAZR’s neighbor-context FNV hashing. It conflicts conceptually with perfect per-file hashing and adds complexity. Stale/shifted context is handled by the recovery pipeline instead.

## Tool schema

### `read`

Core behavior:

- Reads text files with hashline anchors.
- Supports `offset` and `limit` pagination.
- Supports raw mode for non-edit reads where anchors would waste tokens.
- Preserves image pass-through behavior where supported by the trunk.
- Rejects binary and directory paths with clear errors.

### `edit`

`edit` replaces or deletes an inclusive range.

Canonical item shape:

```json
{
  "start": "aB3",
  "end": "xY7",
  "lines": ["replacement line"],
  "current": "optional exact current line text"
}
```

Rules:

- `start` and `end` are required hash-only anchors.
- Single-line replacement uses the same anchor for `start` and `end`.
- `lines` is an array of literal file-content lines.
- `lines: []` deletes the range.
- `current` is optional. When supplied for a single-line replacement, the runtime validates it against the current line content before mutation. A mismatch rejects the edit.
- Multi-edit calls validate against one pre-edit snapshot and apply bottom-up or through an equivalent deterministic span application strategy.

### `insert`

`insert` adds lines before or after one anchor without replacing the anchor line.

Canonical item shape:

```json
{
  "anchor": "aB3",
  "direction": "after",
  "lines": ["inserted line"]
}
```

Rules:

- `anchor` is required.
- `direction` is `before` or `after`.
- `lines` is an array of literal file-content lines.
- The anchor line is preserved.

### Legacy normalization

Accept native-style `oldText`/`newText` only as a compatibility layer when an anchored edit is not supplied.

Rules:

- Normalize to exact unique text replacement.
- Reject if `oldText` is missing, `newText` is missing, not found, or found more than once.
- Emit a warning that hashline anchors are preferred.
- Do not perform fuzzy legacy matching.
- Keep normalization in one module so canonical edit validation remains simple.

## Stale-anchor recovery

Use JerryAZR’s recovery philosophy, adapted to hash-only perfect anchors:

1. **Live unique-anchor resolution:** Recompute the current file’s perfect hash map. If `start` and `end` anchors each exist exactly once and preserve range order, the edit can target those live lines.
2. **Warned relocation classification:** Compare resolved live positions with the most recent read/grep/diff snapshot when available. If anchors are still present but moved, apply the edit and emit a `[RELOCATED]`-style warning. Hash-only anchors make this a direct unique-anchor lookup, not a line-number fuzzy search.
3. **Snapshot 3-way merge:** If one or more anchors are absent from the live file but match the most recent snapshot, attempt a safe 3-way merge/rebase. Emit a warning when used.
4. **Reject:** If any edit remains ambiguous, absent without a usable snapshot, reordered unexpectedly, or unsafe, reject the entire request with a stale-anchor error and return fresh nearby anchors when possible.

Recovery must not hide risk. Every non-exact recovery path must be visible in model text and host details.

## Safety and validation

Preserve and adapt these guardrails:

- Strict patch-content validation rejects copied `HASH│content`, `LINE#HASH│content`, and diff `+`/`-` rows in `lines`.
- Bare-prefix detection should cross-check suspect prefixes against real file anchors where possible.
- Full-file deletion guard rejects edits that would empty files above the existing large-file threshold unless a future explicit override is designed.
- Symmetric boundary-duplication detection warns or rejects duplicated boundary lines according to the trunk’s established behavior.
- Atomic writes must go through the trunk’s safe write path.
- Per-file mutation queue serializes concurrent mutations to the same canonical write target.
- Symlink, hardlink, BOM, and line-ending behavior should preserve the trunk’s guarantees.
- Schema validation rejects unknown or malformed fields with specific, actionable error messages.
- Doom-loop detection warns when the session repeats identical tool calls or repeated call cycles without progress.

## Output contract

### Successful mutation text

Default model-visible text should be compact:

- mutation classification: applied or noop
- warnings such as relocation, merge, legacy normalization, boundary duplication, or doom-loop hints
- fresh hashline anchors around changed regions
- concise retry guidance when useful

### Host-only details

Put rich output in details:

- full unified diff in `details.diff`
- metrics such as attempted edits, noops, warnings, added/removed lines
- recovery tier used where useful
- snapshot/fingerprint information if already present in the trunk

Do not duplicate full diffs or broad file content in model text by default.

## Optional tools

### `grep` — disabled by default

When enabled, `grep` returns search matches with the same hash-only anchors as `read`, so results can feed directly into `edit` and `insert` without an intermediate read.

Requirements:

- It must share the same hash computation and formatting functions as `read`.
- Context lines should also include anchors.
- It should respect the trunk’s `.gitignore`, truncation, and output-budget behavior where applicable.

### `undo` — disabled by default

When enabled, `undo` reverts recent mutations made through this package during the session.

Requirements:

- It must understand both `edit` and `insert` mutations.
- It must interact safely with the per-file mutation queue.
- It must reject or warn when the file has diverged in a way that makes undo unsafe.

## Testing strategy

Add or update tests in the selected trunk for:

- 3-character base64url hash generation.
- Perfect collision resolution, including repeated identical lines.
- Hash-only read output.
- Optional line-number display mode.
- `edit` range replacement, single-line replacement, deletion, and multi-edit ordering.
- `insert` before/after behavior.
- Optional `current` validation success and mismatch rejection.
- Legacy `oldText`/`newText` exact unique normalization and rejection cases.
- Strict patch-content rejection for hashline prefixes and diff rows.
- Exact stale validation, fuzzy relocation warning, snapshot merge warning, and stale rejection.
- Full-file deletion guard.
- Boundary duplication detection.
- Atomic write and mutation queue behavior where existing tests cover it.
- Compact success output and host-only `details.diff`.
- Optional `grep` and `undo` modules disabled by default but valid when enabled.
- Doom-loop repeated-call and repeated-cycle warnings.

Validation commands should at minimum include the selected package’s full test suite. If typecheck exists after merge, include it in the final validation gate.

## Migration notes

From JerryAZR:

- `LINE#HH│content` becomes hash-only `HHH│content` by default.
- `range: ["42#A4", "45#C7"]` becomes `start: "aB3", end: "xY7"`.
- Context FNV hashes are replaced with 3-character xxHash perfect anchors.
- `grep` and `undo` are no longer default-enabled.

From YuGiMob:

- Keep 3-character perfect hashes.
- Use `edit` plus `insert`, not `replace` only.
- Allow warned recovery instead of strict stale rejection only.

From RimuruW:

- Keep native edit normalization concept, but only as strict exact unique replacement.
- Do not keep single-tool `op` schema.

From JoshMock:

- Keep the `current` content assertion idea, but optional rather than required.

From coctostan-readmap:

- Keep lightweight doom-loop warnings.
- Do not merge structural maps, AST search, file exploration, bash compression, or syntax validation.

## Success criteria

The design is successful if:

- The merged package remains a focused editor, not a broad tool suite.
- Default protocol is compact and model-friendly.
- Repeated lines get unique anchors.
- Split `edit`/`insert` calls are easy for models to form correctly.
- Stale edits recover when safe and reject when ambiguous.
- Optional features do not enlarge the default tool surface.
- Uncertain features are deferred unless they provide clear safety or performance value.
- Tests pin the new protocol so future changes cannot accidentally reintroduce 2-character/context-hash assumptions.

## Implementation planning notes

The implementation plan should break this medium feature into no more than five phases and keep protocol changes, safety behavior, optional modules, and documentation updates independently testable. Publishing ownership can be decided later without changing this design because the planning package name is `pi-hashline-edit-merged`.
