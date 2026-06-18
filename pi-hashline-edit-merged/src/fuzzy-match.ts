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

function resolveUniqueHash(file: HashlineFile, hash: string): number | null {
  const matches: number[] = [];
  file.lineHashes.forEach((lineHash, index) => {
    if (lineHash === hash) matches.push(index + 1);
  });
  return matches.length === 1 ? matches[0]! : null;
}

function resolveAnchor(file: HashlineFile, anchor: Anchor): Anchor | null {
  const line = resolveUniqueHash(file, anchor.hash);
  return line === null ? null : { ...anchor, line };
}

function resolveEdit(file: HashlineFile, edit: HashlineEdit): HashlineEdit | null {
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
    if (resolved) {
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
  let relocationCount = 0;

  for (const edit of edits) {
    const resolved = resolveEdit(currentFile, edit);
    if (!resolved) {
      unmatched.push(edit);
      continue;
    }

    if (
      (edit.pos.line !== undefined && edit.pos.line !== resolved.pos.line) ||
      (edit.end?.line !== undefined && resolved.end && edit.end.line !== resolved.end.line)
    ) {
      relocationCount++;
    }
    matched.push(resolved);
  }

  return {
    matched,
    unmatched,
    warnings: relocationCount > 0
      ? [`[RELOCATED] ${relocationCount} range(s) relocated via hash matching. Please review the diff carefully.`]
      : [],
  };
}
