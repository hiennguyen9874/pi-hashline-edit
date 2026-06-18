/**
 * Three-way merge for stale-anchor recovery.
 *
 * When the agent reads a file, then the file changes, then the agent issues an
 * edit with anchors from the old read, we can sometimes recover by:
 *   1. Applying the edits to the *old* (snapshot) text.
 *   2. Diffing old → old+edits to get a patch.
 *   3. Applying that patch to the *current* live text.
 *
 * This is analogous to git rebase: edits authored on base are replayed onto
 * current.
 *
 * fuzzFactor is 0 (no sliding) so that misaligned hunks are rejected rather
 * than silently corrupted.
 */

import * as Diff from "diff";

export function threeWayMerge(
  base: string,
  baseEdited: string,
  current: string,
): string | null {
  if (base === current) {
    return baseEdited;
  }

  const patch = Diff.structuredPatch("a", "b", base, baseEdited, "", "", {
    context: 3,
  });

  const merged = Diff.applyPatch(current, patch, { fuzzFactor: 0 });

  if (typeof merged !== "string" || merged === current) {
    return null;
  }

  return merged;
}
