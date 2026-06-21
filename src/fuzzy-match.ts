import {
  type Anchor,
  type HashlineFile,
  type HashlineEdit,
} from "./hashline";

/**
 * Result shape shared by all matchers (exact, fuzzy, snapshot).
 */
export interface MatchResult {
  matched: HashlineEdit[];
  unmatched: HashlineEdit[];
  warnings: string[];
}

type Relocation = {
  startHash: string;
  endHash?: string;
  oldStart: number;
  newStart: number;
  oldEnd?: number;
  newEnd?: number;
};

function formatRelocation(relocation: Relocation): string {
  if (relocation.endHash && relocation.oldEnd !== undefined && relocation.newEnd !== undefined) {
    return `  ${relocation.startHash}-${relocation.endHash}: lines ${relocation.oldStart}-${relocation.oldEnd} -> ${relocation.newStart}-${relocation.newEnd}`;
  }
  return `  ${relocation.startHash}: line ${relocation.oldStart} -> ${relocation.newStart}`;
}

function formatRelocationWarning(relocations: Relocation[]): string {
  const shown = relocations.slice(0, 5).map(formatRelocation);
  const hidden = relocations.length > shown.length
    ? [`  ... ${relocations.length - shown.length} more relocated range(s)`]
    : [];
  return [
    `[RELOCATED] ${relocations.length} range(s) relocated via hash matching:`,
    ...shown,
    ...hidden,
    "Please review the diff carefully.",
  ].join("\n");
}

export function findHashLines(file: Pick<HashlineFile, "lineHashes">, hash: string): number[] {
  const matches: number[] = [];
  file.lineHashes.forEach((lineHash, index) => {
    if (lineHash === hash) matches.push(index + 1);
  });
  return matches;
}

function resolveUniqueHash(file: HashlineFile, hash: string): number | null {
  const matches = findHashLines(file, hash);
  return matches.length === 1 ? matches[0]! : null;
}

function anchorMoved(anchor: Anchor | undefined, resolved: Anchor | undefined): boolean {
  return anchor?.line !== undefined && resolved?.line !== undefined && anchor.line !== resolved.line;
}

export function attachSnapshotLines(edits: HashlineEdit[], snapshotFile: HashlineFile): HashlineEdit[] {
  return edits.map((edit) => {
    if (edit.op === "insert_head" || edit.op === "insert_tail") {
      return edit;
    }
    const posLine = resolveUniqueHash(snapshotFile, edit.pos.hash);
    const endLine = edit.end ? resolveUniqueHash(snapshotFile, edit.end.hash) : null;
    return {
      ...edit,
      pos: posLine === null ? edit.pos : { ...edit.pos, line: posLine },
      ...(edit.end
        ? { end: endLine === null ? edit.end : { ...edit.end, line: endLine } }
        : {}),
    };
  });
}

function resolveAnchor(file: HashlineFile, anchor: Anchor): Anchor | null {
  const line = resolveUniqueHash(file, anchor.hash);
  return line === null ? null : { ...anchor, line };
}

function resolveEdit(file: HashlineFile, edit: HashlineEdit): HashlineEdit | null {
  if (edit.op === "insert_head" || edit.op === "insert_tail") {
    return edit;
  }
  const pos = resolveAnchor(file, edit.pos);
  if (!pos) return null;
  const end = edit.end ? resolveAnchor(file, edit.end) : undefined;
  if (edit.end && !end) return null;
  if (end && pos.line! > end.line!) return null;
  return {
    ...edit,
    pos,
    ...(end ? { end } : {}),
  };
}

/**
 * Partition edits by unique hash validity against a file. Edits whose anchor
 * hashes resolve exactly once go into `matched`; absent or ambiguous hashes go
 * into `unmatched`.
 */
export function partitionExact(
  edits: HashlineEdit[],
  file: HashlineFile,
): MatchResult {
  const matched: HashlineEdit[] = [];
  const unmatched: HashlineEdit[] = [];

  for (const edit of edits) {
    const resolved = resolveEdit(file, edit);
    if (resolved && !anchorMoved(edit.pos, resolved.pos) && !anchorMoved(edit.end, resolved.end)) {
      matched.push(resolved);
    } else {
      unmatched.push(edit);
    }
  }

  return { matched, unmatched, warnings: [] };
}

/**
 * Hash-only anchors no longer carry trusted line positions. Relocation is the
 * same unique-hash live resolution, with a warning only when a legacy/internal
 * line value was present and changed.
 */
export function fuzzyMatch(
  edits: HashlineEdit[],
  currentFile: HashlineFile,
): MatchResult {
  const matched: HashlineEdit[] = [];
  const unmatched: HashlineEdit[] = [];
  const relocations: Relocation[] = [];

  for (const edit of edits) {
    const resolved = resolveEdit(currentFile, edit);
    if (!resolved) {
      unmatched.push(edit);
      continue;
    }

    if (
      edit.op !== "insert_head" &&
      edit.op !== "insert_tail" &&
      resolved.op !== "insert_head" &&
      resolved.op !== "insert_tail" &&
      edit.pos.line !== undefined &&
      resolved.pos.line !== undefined &&
      (
        edit.pos.line !== resolved.pos.line ||
        (edit.end?.line !== undefined && resolved.end?.line !== undefined && edit.end.line !== resolved.end.line)
      )
    ) {
      relocations.push({
        startHash: edit.pos.hash,
        endHash: edit.end?.hash,
        oldStart: edit.pos.line,
        newStart: resolved.pos.line,
        oldEnd: edit.end?.line,
        newEnd: resolved.end?.line,
      });
    }
    matched.push(resolved);
  }

  return {
    matched,
    unmatched,
    warnings: relocations.length > 0
      ? [formatRelocationWarning(relocations)]
      : [],
  };
}
