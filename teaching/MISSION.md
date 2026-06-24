# Mission: pi-hashline-edit Internals

## Why
To develop a deep, working mental model of how pi-hashline-edit works under the hood — not just as a user of `read`/`edit`/`insert`, but understanding the protocol, architecture, and guarantees that make it reliable. This transforms me from a tool consumer into someone who can reason about, extend, and debug the system.

## Success looks like
- I can explain the hashline protocol end-to-end: how anchors are computed, displayed, resolved, and why stale anchors are rejected.
- I can trace a complete edit from tool invocation through anchor resolution, span computation, atomic write, and diff generation.
- I can describe how extensions register tools with Pi, how prompt text is loaded, and how the lifecycle works.
- I can reason about the correctness guarantees (atomic writes, collision resolution, 3-way merge, boundary warnings).

## Constraints
- Learning happens in short, focused sessions — one tight concept per lesson.
- Lessons must be directly tied to the source code (no speculation — ground everything in the real implementation).

## Out of scope
- Pi runtime internals outside this extension (the host agent, LLM integration, session management).
- Optional modules (grep.ts, undo.ts) — unless explicitly requested later.
- General TypeScript/node.js programming (assumed baseline knowledge).
