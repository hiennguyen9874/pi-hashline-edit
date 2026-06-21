/**
 * Hashline engine — hash-anchored line editing.
 *
 * Uses 3-character xxHash anchors with per-file collision resolution.
 */

import {
  computeLineHashes,
  computeLineHashFromContext,
  HASH_RE,
  HASH_CHARS_CLASS,
} from "./hash-format";
import { ANCHOR_SEP, CONTENT_SEP, formatAnchorPrefix } from "./anchor-display";

// --- Types ---

export type Anchor = { hash: string; line?: number };
export type HashlineEdit = {
  op: "replace" | "append" | "prepend";
  pos: Anchor;
  end?: Anchor;
  lines: string[];
  current?: string;
};

interface HashMismatch {
  line?: number;
  expected: string;
  actual?: string;
  candidates?: number[];
}

export interface NoopEdit {
  editIndex: number;
  loc: string;
  currentContent: string;
}

export interface HashlineFile {
  readonly lines: readonly string[];
  readonly lineHashes: readonly string[];
  readonly lineStarts: readonly number[];
  readonly content: string;
}

// --- Hash computation ---

export { ANCHOR_SEP, CONTENT_SEP };

export function normalizeLine(line: string): string {
  return line.replace(/\r/g, "").trimEnd();
}

export function computeLineHash(fileLines: readonly string[], index: number): string {
  return computeLineHashFromContext(
    fileLines[index - 1] ?? "",
    fileLines[index] ?? "",
    fileLines[index + 1] ?? "",
  );
}

export function computeHashFromContext(prev: string, curr: string, next: string): string {
  return computeLineHashFromContext(prev, curr, next);
}

export function buildHashlineFile(content: string): HashlineFile {
  const lines = content.length === 0
    ? []
    : content.endsWith("\n")
      ? content.split("\n").slice(0, -1)
      : content.split("\n");

  const lineHashes = computeLineHashes(content);
  if (lineHashes.length !== lines.length) {
    throw new Error("Hash count does not match visible line count.");
  }

  const lineStarts: number[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(offset);
    offset += lines[i]!.length;
    if (i < lines.length - 1) offset += 1;
  }

  return { lines, lineHashes, lineStarts, content };
}

/**
 * Patterns used to detect (and reject) hashline display prefixes inside edit
 * payloads. The runtime no longer strips them — the model must send literal
 * file content. Matching any of these triggers `[E_INVALID_PATCH]`.
 */
const HASHLINE_PREFIX_RE = new RegExp(
  `^\\s*(?:>>>|>>)?\\s*(?:\\d+\\s*${ANCHOR_SEP}\\s*)?(${HASH_CHARS_CLASS})${CONTENT_SEP}`);
const HASHLINE_PREFIX_PLUS_RE = new RegExp(
  `^\\+\\s*(?:\\d+\\s*${ANCHOR_SEP}\\s*)?(${HASH_CHARS_CLASS})${CONTENT_SEP}`);
const DIFF_MINUS_RE = /^-\s*\d+\s{3,}│/;

// ─── Parsing ────────────────────────────────────────────────────────────

function diagnoseLineRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed.length) {
    return `[E_BAD_REF] Invalid anchor. Expected a 3-character base64url hash such as "aB3".`;
  }
  if (/^\d/.test(trimmed)) {
    return `[E_BAD_REF] Invalid anchor "${trimmed}". Use the hash alone; line numbers are display-only.`;
  }
  if (trimmed.includes(CONTENT_SEP)) {
    return `[E_BAD_REF] Invalid anchor "${trimmed}". Copy only the 3-character hash before ${CONTENT_SEP}.`;
  }
  return `[E_BAD_REF] Invalid anchor. Expected a 3-character base64url hash such as "aB3".`;
}


function parseAnchorRef(ref: string): Anchor {
  const trimmed = ref.trim();
  if (!HASH_RE.test(trimmed)) {
    throw new Error(diagnoseLineRef(ref));
  }
  return { hash: trimmed };
}

// ─── Mismatch formatting ────────────────────────────────────────────────

export function formatMismatchError(
  mismatches: HashMismatch[],
  fileLines: readonly string[],
  retryLines: ReadonlySet<number> = new Set<number>(),
): string {
  const lineHashes = computeLineHashes(fileLines.join("\n"));

  // De-duplicate: same expected hash + same candidate set = same anchor.
  const seenKeys = new Set<string>();
  const uniqueMismatches = mismatches.filter((m) => {
    const candidates = m.candidates?.join(",") ?? "";
    const key = `${m.line ?? "?"}:${m.expected}:${candidates}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const ambiguous = uniqueMismatches.filter((m) => (m.candidates?.length ?? 0) > 1);
  const stale = uniqueMismatches.filter((m) => m.candidates === undefined || m.candidates.length === 0);
  const out: string[] = [];

  for (const mismatch of ambiguous) {
    const candidates = mismatch.candidates ?? [];
    out.push(
      `[E_AMBIGUOUS_ANCHOR] anchor "${mismatch.expected}" matches lines ${candidates.join(", ")}.`,
    );
    for (const num of candidates.slice(0, 5)) {
      const content = fileLines[num - 1] ?? "";
      const hash = lineHashes[num - 1] ?? computeLineHash(fileLines, num - 1);
      out.push(`    ${hash}${CONTENT_SEP}${content}`);
    }
  }

  if (stale.length > 0) {
    const staleAnchors = [...new Set(stale.map((m) => m.expected))];
    const quotedAnchors = staleAnchors.map((anchor) => `"${anchor}"`).join(", ");
    out.push(
      staleAnchors.length === 1
        ? `[E_STALE_ANCHOR] stale anchor ${quotedAnchors}. Call read() to get fresh anchors.`
        : `[E_STALE_ANCHOR] stale anchors ${quotedAnchors}. Call read() to get fresh anchors.`,
    );

    const retryLineSet = new Set<number>(retryLines);
    for (const mismatch of stale) {
      if (mismatch.line !== undefined) retryLineSet.add(mismatch.line);
    }
    const sorted = [...retryLineSet]
      .filter((line) => line >= 1 && line <= fileLines.length)
      .sort((a, b) => a - b);
    for (const num of sorted.slice(0, 5)) {
      const content = fileLines[num - 1] ?? "";
      const hash = lineHashes[num - 1] ?? computeLineHash(fileLines, num - 1);
      out.push(`    ${hash}${CONTENT_SEP}${content}`);
    }
  }

  return out.join("\n");
}

// ─── Content preprocessing ─────────────────────────────────────────────────────

/**
 * Reject hashline display prefixes in edit payloads. Strict semantics: the
 * model must send literal file content for `lines`, not the rendered read /
 * diff form. Silent stripping is no longer performed — see AGENTS.md.
 */
function assertNoDisplayPrefixes(lines: string[], file?: HashlineFile): void {
  for (const line of lines) {
    if (!line.length) continue;
    const bareMatch = line.match(HASHLINE_PREFIX_RE) ?? line.match(HASHLINE_PREFIX_PLUS_RE);
    if (bareMatch) {
      const hash = bareMatch[1]!;
      const realHash = file ? file.lineHashes.includes(hash) : undefined;
      const realHashText = realHash === undefined
        ? "Real file hash check unavailable."
        : realHash
          ? "The prefix matches a real file hash."
          : "The prefix does not match a real file hash.";
      throw new Error(
        `[E_BARE_HASH_PREFIX] "lines" must contain literal file content, not rendered "HASH${CONTENT_SEP}content" prefixes. ${realHashText} Offending line: ${JSON.stringify(line)}`,
      );
    }
    if (DIFF_MINUS_RE.test(line)) {
      throw new Error(
        `[E_INVALID_PATCH] "lines" must contain literal file content, not rendered "LINE${ANCHOR_SEP}HASH${CONTENT_SEP}" or diff "+/-" prefixes. Offending line: ${JSON.stringify(line)}`,
      );
    }
  }
}

/**
 * Parse replacement text into lines.
 *
 * String input is normalized to LF and drops exactly one trailing newline,
 * matching read-preview style content. Array input is preserved verbatim so
 * explicitly provided blank lines remain intact. Display prefixes are
 * rejected by `assertNoDisplayPrefixes`, never silently stripped.
 */
export function hashlineParseText(edit: string[] | string | null, file?: HashlineFile): string[] {
  if (edit === null) return [];
  const lines = typeof edit === "string"
    ? (edit.endsWith("\n") ? edit.slice(0, -1) : edit).replaceAll("\r", "").split("\n")
    : edit;
  assertNoDisplayPrefixes(lines, file);
  return lines;
}

/**
 * Map flat tool-schema edits into typed internal representations.
 *
 * Strict: provided anchors must parse successfully.
 */
export function resolveEditAnchors(edits: HashlineToolEdit[], file?: HashlineFile): HashlineEdit[] {
  return edits.map((edit) => ({
    op: edit.op,
    pos: parseAnchorRef(edit.pos),
    ...(edit.end ? { end: parseAnchorRef(edit.end) } : {}),
    lines: hashlineParseText(edit.lines ?? null, file),
    ...(edit.current !== undefined ? { current: edit.current } : {}),
  }));
}

// ─── Main edit engine ───────────────────────────────────────────────────

/** Schema-level edit as received from the tool layer (pos/end are tag strings, lines may be string|null). */
export type HashlineToolEdit = {
  op: "replace" | "append" | "prepend";
  pos: string;
  end?: string;
  lines?: string[] | string | null;
  current?: string;
};

function maybeWarnSuspiciousUnicodeEscapePlaceholder(
  edits: HashlineEdit[],
  warnings: string[],
): void {
  for (const edit of edits) {
    if (edit.lines.some((line) => /\\uDDDD/i.test(line))) {
      warnings.push(
        "Detected literal \\uDDDD in edit content; no autocorrection applied. Verify whether this should be a real Unicode escape or plain text.",
      );
    }
  }
}

function describeEdit(edit: HashlineEdit): string {
  return edit.end
    ? `replace ${edit.pos.hash}-${edit.end.hash}`
    : `replace ${edit.pos.hash}`;
}

export type AnchorValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateAnchors(
  file: HashlineFile,
  edits: HashlineEdit[],
) : AnchorValidation {
  for (const edit of edits) {
    if (
      edit.end &&
      edit.pos.line !== undefined &&
      edit.end.line !== undefined &&
      edit.pos.line > edit.end.line
    ) {
      return {
        ok: false,
        message: `[E_BAD_RANGE] Range start line ${edit.pos.line} must be <= end line ${edit.end.line}`,
      };
    }

    const refs = edit.end ? [edit.pos, edit.end] : [edit.pos];
    for (const ref of refs) {
      if (ref.line === undefined) {
        continue;
      }
      if (ref.line < 1 || ref.line > file.lines.length) {
        return {
          ok: false,
          message: `[E_RANGE_OOB] Line ${ref.line} does not exist (file has ${file.lines.length} lines)`,
        };
      }
    }
  }
  return { ok: true };
}

export type EditSpan = {
  index: number;
  label: string;
  start: number;
  end: number;
  replacement: string;
  op: "replace" | "append" | "prepend";
  lineShiftStart: number;
  lineDelta: number;
};

type BoundaryDuplicationWarning = {
  label: "after" | "before";
  editLabel: string;
  survivingLineIndex: number;
  survivingLineContent: string;
};

export type SpanResolution =
  | { ok: true; spans: EditSpan[]; noopEdits: NoopEdit[]; warnings: string[]; boundaryWarnings: BoundaryDuplicationWarning[] }
  | { ok: false; code: string; message: string };

export function resolveEditSpans(
  file: HashlineFile,
  edits: HashlineEdit[],
): SpanResolution {
  const noopEdits: NoopEdit[] = [];
  const warnings: string[] = [];
  const boundaryWarnings: BoundaryDuplicationWarning[] = [];

  maybeWarnSuspiciousUnicodeEscapePlaceholder(edits, warnings);

  const seenSpanKeys = new Set<string>();
  const spans: EditSpan[] = [];

  for (const [index, edit] of edits.entries()) {
    const startLine = edit.pos.line;
    const endLine = edit.end?.line ?? edit.pos.line;
    if (startLine === undefined || endLine === undefined) {
      return {
        ok: false,
        code: "E_UNRESOLVED_ANCHOR",
        message: "[E_UNRESOLVED_ANCHOR] Anchor hashes must resolve to live lines before applying edits.",
      };
    }
    const originalLines = file.lines.slice(startLine - 1, endLine);

    if (edit.current !== undefined && startLine === endLine) {
      const actual = file.lines[startLine - 1] ?? "";
      if (actual !== edit.current) {
        return {
          ok: false,
          code: "E_CURRENT_MISMATCH",
          message: `[E_CURRENT_MISMATCH] Anchor ${edit.pos.hash} current text mismatch. Expected ${JSON.stringify(edit.current)}, found ${JSON.stringify(actual)}.`,
        };
      }
    }

    // Append/prepend: insert pure content, no deletion
    if (edit.op === "append") {
      let start: number;
      if (startLine < file.lines.length) {
        start = file.lineStarts[startLine]!; // right after anchor line's \n
      } else {
        start = file.content.length;
      }
      const replacement = startLine < file.lines.length
        ? edit.lines.join("\n") + "\n"
        : (file.content.endsWith("\n") ? "" : "\n") + edit.lines.join("\n");
      spans.push({
        index,
        label: describeEdit(edit),
        start,
        end: start,
        replacement,
        op: "append",
        lineShiftStart: startLine + 1,
        lineDelta: edit.lines.length,
      });
      continue;
    }

    if (edit.op === "prepend") {
      const start = file.lineStarts[startLine - 1]!;
      const replacement = edit.lines.join("\n") + "\n";
      spans.push({
        index,
        label: describeEdit(edit),
        start,
        end: start,
        replacement,
        op: "prepend",
        lineShiftStart: startLine,
        lineDelta: edit.lines.length,
      });
      continue;
    }

    // Noop detection
    if (
      originalLines.length === edit.lines.length &&
      originalLines.every((line, i) => line === edit.lines[i])
    ) {
      noopEdits.push({
        editIndex: index,
        loc: edit.pos.hash,
        currentContent: originalLines.join("\n"),
      });
      continue;
    }

    // Boundary duplication warning
    const checkBoundary = (
      candidate: string | undefined,
      boundary: string | undefined,
      label: "after" | "before",
      survivingLineIndex: number,
    ) => {
      if (!candidate || !boundary) return;
      if (/[\p{L}\p{N}]/u.test(candidate) && candidate === boundary) {
        boundaryWarnings.push({
          label,
          editLabel: describeEdit(edit),
          survivingLineIndex,
          survivingLineContent: boundary,
        });
      }
    };
    checkBoundary(edit.lines.at(-1), file.lines[endLine], "after", endLine + 1);
    if (startLine > 1) checkBoundary(edit.lines[0], file.lines[startLine - 2], "before", startLine - 1);

    // Resolve to span
    const lineDelta = edit.lines.length - (endLine - startLine + 1);
    let span: EditSpan;
    if (edit.lines.length > 0) {
      span = {
        index,
        label: describeEdit(edit),
        start: file.lineStarts[startLine - 1]!,
        end: file.lineStarts[endLine - 1]! + file.lines[endLine - 1]!.length,
        replacement: edit.lines.join("\n"),
        op: "replace",
        lineShiftStart: endLine + 1,
        lineDelta,
      };
    } else if (startLine === 1 && endLine === file.lines.length) {
      span = {
        index,
        label: describeEdit(edit),
        start: 0,
        end: file.content.length,
        replacement: "",
        op: "replace",
        lineShiftStart: endLine + 1,
        lineDelta,
      };
    } else if (endLine < file.lines.length) {
      span = {
        index,
        label: describeEdit(edit),
        start: file.lineStarts[startLine - 1]!,
        end: file.lineStarts[endLine]!,
        replacement: "",
        op: "replace",
        lineShiftStart: endLine + 1,
        lineDelta,
      };
    } else {
      span = {
        index,
        label: describeEdit(edit),
        start: Math.max(0, file.lineStarts[startLine - 1]! - 1),
        end: file.lineStarts[endLine - 1]! + file.lines[endLine - 1]!.length,
        replacement: "",
        op: "replace",
        lineShiftStart: endLine + 1,
        lineDelta,
      };
    }

    const spanKey = `replace:${span.start}:${span.end}:${span.replacement}`;
    if (seenSpanKeys.has(spanKey)) continue;
    seenSpanKeys.add(spanKey);
    spans.push(span);
  }

  // Check for overlapping spans
  for (let leftIndex = 0; leftIndex < spans.length; leftIndex++) {
    const left = spans[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < spans.length; rightIndex++) {
      const right = spans[rightIndex]!;
      if (left.start < right.end && right.start < left.end) {
        return {
          ok: false,
          code: "E_EDIT_CONFLICT",
          message: `[E_EDIT_CONFLICT] Conflicting edits in a single request: edit ${left.index} (${left.label}) and edit ${right.index} (${right.label}) overlap on the same original line range. Merge them into one non-overlapping change or split the request.`,
        };
      }
    }
  }

  return { ok: true, spans, noopEdits, warnings, boundaryWarnings };
}

export function finalizeBoundaryDuplicationWarnings(
  resultFile: HashlineFile,
  spans: readonly EditSpan[],
  boundaryWarnings: readonly BoundaryDuplicationWarning[],
): string[] {
  return boundaryWarnings.flatMap((warning) => {
    const resultLineIndex = warning.survivingLineIndex + spans.reduce((delta, span) => (
      span.lineShiftStart <= warning.survivingLineIndex ? delta + span.lineDelta : delta
    ), 0);
    const resultContent = resultFile.lines[resultLineIndex - 1];
    if (resultContent !== warning.survivingLineContent) {
      return [];
    }
    const hash = resultFile.lineHashes[resultLineIndex - 1];
    if (!hash) {
      return [];
    }
    return [
      `Potential boundary duplication ${warning.label} ${warning.editLabel}: the replacement ${warning.label === "after" ? "ends" : "starts"} with a line that matches the ${warning.label === "after" ? "next surviving" : "preceding"} line. Surviving line anchor (post-edit): "${hash}". Verify and remove the duplicate if unintended.`,
    ];
  });
}

export function applySpans(
  file: HashlineFile,
  spans: EditSpan[],
): { file: HashlineFile; firstChangedLine: number | undefined; lastChangedLine: number | undefined } {
  const orderedSpans = [...spans].sort((left, right) => {
    if (right.end !== left.end) return right.end - left.end;
    return left.index - right.index;
  });

  let result = file.content;
  for (const span of orderedSpans) {
    result = result.slice(0, span.start) + span.replacement + result.slice(span.end);
  }

  const changedRange = computeChangedLineRange(file.content, result);
  return {
    file: buildHashlineFile(result),
    firstChangedLine: changedRange?.firstChangedLine,
    lastChangedLine: changedRange?.lastChangedLine,
  };
}


export function formatHashlineRegion(
  fileLines: readonly string[],
  startLine: number,
  endLine: number,
  lineHashes: readonly string[],
): string {
  const lineNumberWidth = String(endLine).length;
  return fileLines
    .slice(startLine - 1, endLine)
    .map((line, index) => {
      const lineNumber = startLine + index;
      const hash = lineHashes[startLine - 1 + index] ?? computeLineHash(fileLines, startLine - 1 + index);
      return `${formatAnchorPrefix({ line: lineNumber, hash, lineNumberWidth })}${line}`;
    })
    .join("\n");
}

// ─── Edit line range computation ────────────────────────────────────────

/**
 * Compute first/last changed line numbers from the edit result.
 * Uses character-level diff to locate the changed span, then maps to line
 * numbers in the result document so downstream anchor chaining works.
 */
function computeChangedLineRange(
  original: string,
  result: string,
): { firstChangedLine: number; lastChangedLine: number } | null {
  if (original === result) return null;

  function countVisibleLines(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    const lines = text.split("\n");
    return text.endsWith("\n") ? lines.length - 1 : lines.length;
  }

  if (original.length === 0) {
    return {
      firstChangedLine: 1,
      lastChangedLine: countVisibleLines(result),
    };
  }

  if (result.startsWith(original) && original.endsWith("\n")) {
    return {
      firstChangedLine: countVisibleLines(original) + 1,
      lastChangedLine: countVisibleLines(result),
    };
  }

  let firstDiff = 0;
  const minLen = Math.min(original.length, result.length);
  while (firstDiff < minLen && original[firstDiff] === result[firstDiff]) {
    firstDiff++;
  }
  if (firstDiff === minLen && original.length === result.length) return null;

  let lastOrig = original.length - 1;
  let lastRes = result.length - 1;
  while (
    lastOrig >= firstDiff &&
    lastRes >= firstDiff &&
    original[lastOrig] === result[lastRes]
  ) {
    lastOrig--;
    lastRes--;
  }

  function indexToLine(charIdx: number, text: string): number {
    let line = 1;
    for (let i = 0; i < charIdx && i < text.length; i++) {
      if (text[i] === "\n") line++;
    }
    return line;
  }

  const firstChangedLine = indexToLine(firstDiff + 1, result);
  let lastChangedLine: number;
  if (lastRes < firstDiff) {
    lastChangedLine = result.length === 0 ? 1 : countVisibleLines(result);
  } else if (firstDiff === 0 && original.length > 0 && result.endsWith(original)) {
    lastChangedLine = firstChangedLine;
  } else {
    lastChangedLine = indexToLine(lastRes + 1, result);
  }

  return { firstChangedLine, lastChangedLine };
}
