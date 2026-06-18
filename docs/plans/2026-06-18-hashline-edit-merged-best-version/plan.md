# Merged Hashline Edit Best Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pi-hashline-edit-merged`, a focused best-of merge based on JerryAZR’s hashline editor with 3-character perfect hash anchors, hash-only default output, split `edit`/`insert`, warned recovery, core doom-loop warnings, and opt-in `grep`/`undo`.

**Architecture:** Copy `JerryAZR-pi-hashline-edit` into a new package directory as the trunk, then replace its 2-character line-qualified context-hash protocol with YuGiMob-style 3-character hash-only perfect anchors. Keep JerryAZR’s modular extension layout and recovery/mutation engine, adapt it to unique hash lookup, and port only selected safety features from JoshMock/coctostan.

**Tech Stack:** TypeScript ESM, Pi extension APIs, `@sinclair/typebox`, `vitest`, `diff`, `file-type`, `xxhash-wasm`, Node.js >= 20.

---

## Assumptions

- The implementation target is a new package directory: `pi-hashline-edit-merged/`.
- `JerryAZR-pi-hashline-edit/` is the source trunk to copy from.
- `grep` and `undo` must exist as package extension modules but must not be enabled by default.
- The planning package name is `pi-hashline-edit-merged`; publishing ownership/name can change later without changing behavior.
- This workspace root is not currently a Git repo. Commit steps are still included for implementers working in a Git checkout; if Git is unavailable, record the changed files instead of committing.

## Phases

1. [Phase 1: Create JerryAZR-based package trunk](phase-1.md)
2. [Phase 2: Replace hashing and anchor protocol](phase-2.md)
3. [Phase 3: Update core read/edit/insert behavior](phase-3.md)
4. [Phase 4: Adapt recovery, safety, and doom-loop warnings](phase-4.md)
5. [Phase 5: Optional modules, docs, and final hardening](phase-5.md)
