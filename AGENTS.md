# Repository Guidelines

## What this is

`pi-hashline-edit` is a focused pi hashline editor derived from `JerryAZR-pi-hashline-edit`.

Default tools:
- `read`
- `edit`
- `insert`
- `grep`

Optional disabled-by-default tools:
- `undo`

Do not add readmap-style `ls`, `find`, `ast_search`, NuShell, bash compression, auto-read, tool-usage, or syntax validation in this package.

## Protocol invariants

- Default read output is `LINE#HASH│content` with a 3-character base64url hash and display-only line number.
- Legacy hash-only display is controlled by `PI_HASHLINE_ANCHOR_DISPLAY=hash` and prints `HASH│content`.
- `edit` and `insert` accept hash-only anchors; line-qualified anchors are display-only and rejected by mutating tools.
- Hashes are computed through one perfect per-file hash array; do not recompute call-site-specific anchors.

## Project Structure & Module Organization
- `extensions/` contains Pi extension entrypoints: `core.ts` registers `read`/`edit`, `insert.ts` registers `insert`, `grep.ts` registers `grep`, and optional modules live in `undo.ts`.
- `src/` contains the implementation, split by responsibility: `read.ts`, `edit.ts`, `insert.ts`, `hashline.ts`, `edit-diff.ts`, `file-kind.ts`, `fs-write.ts`, and small runtime/path helpers.
- `tool-descriptions/` holds the Markdown prompt text loaded by the tools at runtime.
- `test/` mirrors the code layout: `core/` for hashline primitives, `tools/` for tool behavior, `extension/` for registration, `integration/` for end-to-end flows, and `support/fixtures.ts` for temp-file helpers.
- `assets/` is documentation media only.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm test` — run the full test suite with `vitest`.
- `npm test -- test/tools` — run tool-facing tests while iterating on `read`/`edit`/`insert` behavior.
- `npm test -- test/integration/strict-hashline-loop.test.ts` — run the strict hashline integration scenario.
- There is no separate build step today; Pi loads the TypeScript entrypoints directly from `extensions/*.ts`.

## Coding Style & Naming Conventions
- Use TypeScript with ESM imports, two-space indentation, double quotes, and semicolons to match the existing codebase.
- Keep modules narrow and named by responsibility (`fs-write.ts`, `compatibility-notify.ts`).
- Export typed functions and use specific error paths; avoid broad refactors or speculative abstractions.
- No ESLint or Prettier config is checked in, so preserve local style and keep diffs tight.

## Testing Guidelines
- Write tests with `vitest` and place them under the matching `test/` subfolder.
- Name files `<feature>.test.ts`; group assertions around one behavior per `describe` block.
- Any change to anchor parsing, diff preview, compatibility mode, or atomic writes should include or update tests in the affected layer.
- New integration scenarios (e.g. compound edits, stale-position edge cases) go under `test/integration/` as standalone `<scenario>.test.ts` files.

## Commit & Pull Request Guidelines
- Follow the existing Conventional Commit pattern: `fix(hashline): ...`, `refactor(read, edit): ...`, `docs: ...`.
- Keep commits focused and imperative; separate behavior changes from documentation-only updates.
- PRs should summarize the user-visible effect, list the tests run, and include before/after snippets when tool output or prompts change.

## Architecture Guardrails
- Keep `read`, `edit`, `insert`, prompt text, and tests in sync whenever the hashline format changes.
- Do not bypass `src/fs-write.ts`; atomic writes are part of the extension’s safety guarantees.
- Preserve stale-anchor rejection semantics unless the change explicitly redesigns the protocol.
- Do not introduce autocorrection heuristics into `applyHashlineEdits`. The runtime must not silently patch model errors — if the model sends wrong content, reject or warn, don't fix.
- Keep tool output token-efficient.
- Prompt clarity and model guidance that prevents errors pays for its token cost. When in doubt, teach the model how the tool's fields compose.
