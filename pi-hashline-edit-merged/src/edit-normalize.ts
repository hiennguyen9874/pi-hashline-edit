import { buildHashlineFile } from "./hashline";
import { isRecord } from "./runtime";

export type NormalizedEditRequest = {
  path: string;
  edits: Record<string, unknown>[];
  warnings: string[];
};

function getLegacyText(input: Record<string, unknown>, camel: string, snake: string): unknown {
  return input[camel] ?? input[snake];
}

function countOccurrences(haystack: string, needle: string): { count: number; index: number } {
  if (needle.length === 0) {
    return { count: 0, index: -1 };
  }

  let count = 0;
  let index = -1;
  let searchFrom = 0;
  while (true) {
    const found = haystack.indexOf(needle, searchFrom);
    if (found === -1) break;
    count += 1;
    index = found;
    searchFrom = found + needle.length;
  }
  return { count, index };
}

function lineForIndex(content: string, index: number): number {
  let line = 1;
  for (let offset = 0; offset < index; offset++) {
    if (content[offset] === "\n") line += 1;
  }
  return line;
}

function lineStart(content: string, line: number): number {
  if (line === 1) return 0;
  let currentLine = 1;
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") {
      currentLine += 1;
      if (currentLine === line) return index + 1;
    }
  }
  return content.length;
}

function lineEnd(content: string, line: number): number {
  const start = lineStart(content, line);
  const newline = content.indexOf("\n", start);
  return newline === -1 ? content.length : newline;
}

function splitReplacementLines(text: string): string[] {
  const normalized = text.replaceAll("\r", "");
  const withoutSingleTrailingNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;
  return withoutSingleTrailingNewline.length === 0
    ? []
    : withoutSingleTrailingNewline.split("\n");
}

export function normalizeEditRequest(input: unknown, currentContent?: string): NormalizedEditRequest {
  if (!isRecord(input)) {
    throw new Error("Edit request must be an object.");
  }
  if (typeof input.path !== "string" || input.path.length === 0) {
    throw new Error('Edit request requires a non-empty "path" string.');
  }
  if (Array.isArray(input.edits)) {
    if (input.edits.length === 0) {
      throw new Error('Edit request requires a non-empty "edits" array.');
    }
    if (!input.edits.every(isRecord)) {
      throw new Error('Edit request "edits" entries must be objects.');
    }
    return {
      path: input.path,
      edits: input.edits,
      warnings: [],
    };
  }

  const oldText = getLegacyText(input, "oldText", "old_text");
  const newText = getLegacyText(input, "newText", "new_text");
  if (typeof oldText !== "string" || typeof newText !== "string") {
    throw new Error('Edit request requires a non-empty "edits" array.');
  }
  if (currentContent === undefined) {
    throw new Error("[E_LEGACY_NEEDS_CONTENT] Legacy oldText/newText normalization requires current file content.");
  }

  const occurrences = countOccurrences(currentContent, oldText);
  if (occurrences.count === 0) {
    throw new Error("[E_LEGACY_NOT_FOUND] oldText was not found exactly once.");
  }
  if (occurrences.count > 1) {
    throw new Error(`[E_LEGACY_NON_UNIQUE] oldText matched ${occurrences.count} times; use read + hash anchors.`);
  }

  const file = buildHashlineFile(currentContent);
  const startLine = lineForIndex(currentContent, occurrences.index);
  const endIndex = occurrences.index + oldText.length;
  const endLine = lineForIndex(currentContent, Math.max(occurrences.index, endIndex - 1));
  const startLineStart = lineStart(currentContent, startLine);
  const endLineEnd = lineEnd(currentContent, endLine);
  const prefix = currentContent.slice(startLineStart, occurrences.index);
  const suffix = currentContent.slice(endIndex, endLineEnd);
  const replacement = `${prefix}${newText}${suffix}`;

  return {
    path: input.path,
    edits: [{
      start: file.lineHashes[startLine - 1]!,
      end: file.lineHashes[endLine - 1]!,
      lines: splitReplacementLines(replacement),
    }],
    warnings: ["[LEGACY_NORMALIZED] Converted exact unique oldText/newText request to hashline edit. Prefer read + hash anchors."],
  };
}
