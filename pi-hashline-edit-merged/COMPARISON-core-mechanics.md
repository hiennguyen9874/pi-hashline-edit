# Core Mechanics Comparison: pi-hashline-edit vs. pi-mono

**Scope:** file-reading pipeline, edit-application pipeline, and filesystem interaction only. Feature additions (hashline anchors, diff formatting, TUI rendering, return modes, metrics) are noted only when they affect core mechanics.

---

## 1. Path Resolution and Validation

### pi-mono
- **Primary resolver:** `resolveToCwd` in `path-utils.ts` delegates to `resolvePath(filePath, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true })` (line 48–50). This normalizes Unicode spaces and strips `@` prefixes.
- **macOS fallbacks:** `resolveReadPath` / `resolveReadPathAsync` (lines 52–118) try multiple on-disk variants if the resolved path does not exist:
  - NFD-normalized filename
  - Curly-quote variant (`'` → `\u2019`)
  - Narrow-no-break-space variant for AM/PM screenshots
  - Combined NFD + curly quote
- **Sanity checks:** Edit tool calls `ops.access(absolutePath, constants.R_OK | constants.W_OK)` (`edit.ts:325`). Write tool does not check existence before writing.
- **Symlinks:** No explicit symlink resolution in the edit/write execution path. The queue key (see §5) resolves via `realpath`, but the actual file path passed to `readFile`/`writeFile` is the CWD-resolved string.

### pi-hashline-edit
- **Primary resolver:** `resolveToCwd` in `path-utils.ts` (lines 10–12) is minimal: expands `~`, then `isAbsolute ? expanded : resolvePath(cwd, expanded)`. **No Unicode normalization, no `@` stripping, no macOS variants.**
- **Sanity checks:**
  - Read: `fsAccess(absolutePath, constants.R_OK)` (`read.ts:160`).
  - Edit: `fsAccess(absolutePath, constants.R_OK | constants.W_OK)` (`edit.ts:951`).
  - Both reject directories, images, and binary files via `loadFileKindAndText` (`file-kind.ts`) before reading content (see §2).
- **Symlinks:** Explicit component-wise symlink resolution in `fs-write.ts:resolveMutationTargetPath` (lines 5–47). It walks each path segment with `lstat`, detects `isSymbolicLink()`, resolves via `readlink`, detects loops (`ELOOP`), and reconstructs the true target path.

### Key Difference
The extension **drops** pi-mono’s Unicode/macOS path normalization and **adds** explicit symlink resolution. On macOS, a file named with NFD or curly quotes that pi-mono would find may be reported as missing by the extension.

---

## 2. File Reading

### pi-mono
- **Encoding:** Reads into a `Buffer`, then calls `.toString("utf-8")` (`edit.ts:335–336`). Preview path uses `readFile(absolutePath, "utf-8")` (`edit-diff.ts:429`).
- **Normalization:** Strips BOM (`stripBom`), detects line endings (`detectLineEnding`), normalizes to LF (`normalizeToLF`).
- **Truncation:** None in the edit path. The read tool (not compared here) has its own truncation logic.
- **Type safety:** No file-type detection. Will happily read a JPEG or binary file as UTF-8 text.

### pi-hashline-edit
- **Encoding:** `loadFileKindAndText` (`file-kind.ts:61–153`) opens a file handle, reads in 8 KiB chunks, and decodes with `TextDecoder("utf-8", { fatal: true })` in streaming mode.
- **Type detection:** Sniffs MIME type via `fileTypeFromBuffer`. Rejects images, binaries (null bytes or invalid UTF-8), and directories **before** returning text.
- **Normalization:** Same BOM stripping and LF normalization as pi-mono (`edit.ts:980–982`).
- **Truncation:** The read tool uses `formatHashlineReadPreview` which calls `truncateHead` (imported from `@earendil-works/pi-coding-agent`) to enforce byte/line caps and emit pagination hints.

### Key Difference
The extension adds **strict UTF-8 validation** and **binary/image rejection**, preventing edits to non-text files. pi-mono blindly reads any file as UTF-8. The extension also implements chunked streaming reads rather than loading the entire file into a Buffer at once.

---

## 3. Edit Application

### pi-mono
- **Model:** Substring replacement. Each edit is `{ oldText, newText }`.
- **Pipeline (`edit-diff.ts:193–260`):**
  1. Normalize all edits to LF.
  2. For each edit, call `fuzzyFindText`: exact `indexOf` first, then fuzzy-normalized fallback (`normalizeForFuzzyMatch`).
  3. If any edit used fuzzy matching, the entire operation runs in fuzzy-normalized content space.
  4. Count occurrences to enforce uniqueness.
  5. Sort matched edits by position; check for overlap.
  6. Apply in **reverse order** via string concatenation: `content.substring(0, idx) + newText + content.substring(idx + len)`.
  7. Throw if result is identical to input.

### pi-hashline-edit
- **Model:** Two separate pipelines.
  1. **Hashline edits** (`hashline.ts:746–918`): line-anchor-based (`LINE#HASH`).
     - Parse anchors (`resolveEditAnchors`).
     - Build `LineIndex` (lines, char offsets, terminal newline flag).
     - Validate each anchor by recomputing FNV-1a hash; supports fuzzy anchor validation with `textHint`.
     - Resolve edits to character spans (`ResolvedEditSpan`): replace, insert (append/prepend).
     - Detect conflicts: overlapping replaces, inserts at same boundary, inserts inside replaces.
     - Apply in **reverse order** by `end` descending: `result.slice(0, start) + replacement + result.slice(end)`.
     - Track noop edits and warnings.
  2. **Legacy `replace_text`** (`edit.ts:1005–1026`): exact unique substring match (no fuzzy fallback for the legacy path in the main edit flow; preview may differ).

### Key Difference
The core mutation strategy is the same—**reverse-order string splicing**—but the extension adds:
- Line-index bookkeeping for anchor validation.
- Explicit conflict detection between replace and insert operations.
- No-op tracking (edits that change nothing are recorded, not thrown).
- No whole-file fuzzy normalization; fuzzy matching is scoped to anchor validation and the separate `replace_text` path.

---

## 4. Atomic / Safe Writes

### pi-mono
- **Direct write:** `ops.writeFile(absolutePath, content, "utf-8")` (`edit.ts:347`).
- **No temp file, no atomic rename.** If the process crashes mid-write, the file may be partially written or truncated.
- **Hard links:** No special handling; direct write modifies the target but no explicit detection.
- **Directory creation:** Write tool creates parent dirs via `ops.mkdir(dir)` recursively (`write.ts:214`). Edit tool does not create directories.

### pi-hashline-edit
- **Atomic write:** `writeFileAtomically` (`fs-write.ts:49–75`):
  1. Resolve symlinks to get `targetPath`.
  2. Stat the target. If `nlink > 1` (hard linked), **write directly** to preserve hard links across all linked names.
  3. Otherwise:
     - Create temp file with `randomUUID()` in the same directory.
     - `mkdir(dir, { recursive: true })`.
     - Write with `flag: "wx"` (exclusive) and mode `0o600` (or inherited from existing file).
     - `rename(tempPath, targetPath)` for atomic replacement.

### Key Difference
The extension introduces **true atomic writes** (temp + exclusive create + rename) and **hard-link preservation**. pi-mono has no atomic-write guarantee. The extension also auto-creates parent directories for edits (implied by `mkdir` in `writeFileAtomically`), whereas pi-mono’s edit tool requires the file to already exist.

---

## 5. File Mutation Queue

### pi-mono
- `withFileMutationQueue` in `file-mutation-queue.ts` (lines 32–61).
- Serializes operations targeting the same file key.
- Key is `await realpath(resolvedPath)` (line 19), falling back to `resolvedPath` on `ENOENT`/`ENOTDIR`.

### pi-hashline-edit
- **Imports the exact same `withFileMutationQueue`** from `@earendil-works/pi-coding-agent` (`edit.ts:4`).
- However, it passes `mutationTargetPath = await resolveMutationTargetPath(absolutePath)` (`edit.ts:947–948`).

### Key Difference
The queue implementation is **identical**. The extension pre-resolves symlinks using its own component-wise resolver before handing the path to the queue. In practice both should resolve to the same real file for queue serialization, but the extension does it explicitly and earlier.

---

## 6. Behavioral Differences in How Files Are Modified on Disk

| Scenario | pi-mono | pi-hashline-edit |
|---|---|---|
| **Plain text edit** | Direct overwrite | Atomic rename (unless hard linked) |
| **Symlink target** | OS follows symlink; writes target | Explicitly resolves chain; writes target |
| **Hard-linked file** | Direct overwrite (all links see change) | Direct overwrite (detects `nlink>1`) |
| **Binary file edit** | Allowed (reads as UTF-8, corrupts) | Blocked by `loadFileKindAndText` |
| **Directory passed as path** | `access` fails with generic error | Blocked with explicit "is a directory" error |
| **Parent dir missing** | Edit fails; write creates dirs | Atomic writer creates dirs recursively |
| **BOM handling** | Preserved (stripped for matching, prepended on write) | Same |
| **Line endings** | Detected, normalized for diff, restored on write | Same |

The most significant behavioral change is that the extension **rejects binary files** and **guarantees atomic replacement** for normal files. pi-mono would silently corrupt a binary file if the model sent an `edit` call.

---

## 7. Safety Guarantees: Bypassed vs. Added

### Bypassed / Lost
1. **Remote operation delegation.** pi-mono’s `EditOperations` / `WriteOperations` interfaces (`edit.ts:74–81`, `write.ts:25–30`) allow hosts to inject remote filesystem implementations (e.g., SSH). The extension ignores this abstraction and calls its own local `fs-write.ts` functions directly. A host relying on custom `EditOperations` will see them bypassed for the overridden `edit`/`read` tools.
2. **macOS path variant resolution.** Files with NFD or curly-quote names may not be found (see §1).
3. **Unicode space normalization and `@` prefix stripping.** Not performed.

### Added / Improved
1. **Atomic writes** via temp+rename (except hard links).
2. **Explicit symlink resolution** with loop detection (`ELOOP`).
3. **Binary / image / directory rejection** before mutation.
4. **Strict UTF-8 validation** with fatal decoding.
5. **Hash-anchored edit validation** — stale anchors are rejected with fresh anchor hints (`hashline.ts` mismatch formatting).
6. **No autocorrection** for display prefixes or model errors (enforced by `assertNoDisplayPrefixes` and AGENTS.md policy).
7. **Hard-link preservation** — avoids breaking hard links via temp-rename.

### Verdict on Safety
The extension **adds strong local-safety guarantees** (atomicity, type validation, symlink safety) but **weakens portability** by bypassing the pluggable operation layer and dropping macOS-specific path normalization.

---

## 8. Path Resolution and Target File Identity

### Does the extension ever modify a *different* file than pi-mono would?

**Normal files (no symlinks, ASCII names):** No. Both resolve relative to CWD and operate on the same inode.

**Symlinks:**
- pi-mono passes the CWD-resolved path string to `fs.writeFile`. On POSIX and Windows with default Node.js behavior, `writeFile` follows symlinks, so the *target* file is modified.
- The extension explicitly resolves the symlink chain to the ultimate target path and writes there.
- **Result:** Same target file is modified, but the extension is more explicit and handles intermediate symlinks (e.g., `a/b/c` where `a` is a symlink) more robustly than simple `resolveToCwd` + OS follow.

**Hard links:**
- pi-mono writes directly, so all hard-linked names see the change.
- The extension detects `nlink > 1` and also writes directly. **Same behavior.**

**Missing parent directories:**
- pi-mono edit tool: throws on access failure.
- The extension: `writeFileAtomically` calls `mkdir(dir, { recursive: true })`, so parent directories are created. This is a behavioral change: the extension may succeed where pi-mono would fail.

**macOS screenshot / NFD filenames:**
- pi-mono: tries variants and may find the intended file.
- Extension: does not try variants; may report "File not found" for a file that exists under an NFD name.
- **Result:** The extension may fail to modify a file that pi-mono would successfully edit.

---

## Overall Verdict

**Improvement for local filesystem safety, neutral-to-regression for portability and macOS compatibility.**

- **Improvements:** Atomic writes, binary-file rejection, strict UTF-8 validation, explicit symlink resolution, hard-link preservation, and hash-anchored stale-edit detection are all clear safety wins over pi-mono’s direct-write, type-blind approach.
- **Regressions / Concerns:**
  1. **Bypasses pluggable `EditOperations`/`WriteOperations`.** If pi-mono is configured with remote/SST ops, the extension silently reverts to local filesystem access.
  2. **Dropped macOS path normalization.** Users on macOS may see "File not found" for screenshot files or NFD-named files that pi-mono handles correctly.
  3. **Dropped Unicode space normalization and `@` stripping.** Could affect paths copied from chat interfaces.
  4. **Auto-creates parent directories** during edit. This is convenient but changes the failure mode compared to pi-mono, which requires the file to already exist in an existing directory.

**Recommendation:** If the project is primarily editing local source code on standard ASCII paths, the extension is a clear improvement. If the project relies on remote tool operations or targets macOS users with non-ASCII filenames, the missing path normalization and bypassed operation layer are real concerns that should be addressed.
