/**
 * Edit response builders.
 *
 * Model-visible output stays compact; full unified diffs are exposed in
 * host-only details for UI rendering.
 */

import { generateDiffString } from "./edit-diff";
import { PACKAGE_INFO } from "./package-info";

// ─── Public types ───────────────────────────────────────────────────────

export type EditMetrics = {
  edits_attempted: number;
  edits_noop: number;
  warnings: number;
  classification: "applied" | "noop";
  added_lines?: number;
  removed_lines?: number;
};

// ─── Builder inputs ─────────────────────────────────────────────────────

type NoopEditEntry = {
  editIndex: number;
  loc: string;
  currentContent: string;
};

export interface NoopResponseInput {
  path: string;
  noopEdits: NoopEditEntry[] | undefined;
  originalNormalized: string;
  snapshotId: string;
  editsAttempted: number;
  warnings: string[] | undefined;
}

export interface SuccessResponseInput {
  path: string;
  originalNormalized: string;
  result: string;
  warnings: string[] | undefined;
  snapshotId: string;
  editsAttempted: number;
  noopEditsCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function countDiffLines(diff: string, marker: "+" | "-"): number {
  if (!diff) return 0;
  let count = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith(marker) && !line.startsWith(`${marker}${marker}${marker}`)) {
      count += 1;
    }
  }
  return count;
}

function buildMetrics(args: {
  classification: "applied" | "noop";
  editsAttempted: number;
  noopEditsCount: number;
  warningsCount: number;
  addedLines?: number;
  removedLines?: number;
}): EditMetrics {
  const metrics: EditMetrics = {
    edits_attempted: args.editsAttempted,
    edits_noop: args.noopEditsCount,
    warnings: args.warningsCount,
    classification: args.classification,
  };
  if (args.addedLines !== undefined) metrics.added_lines = args.addedLines;
  if (args.removedLines !== undefined) metrics.removed_lines = args.removedLines;
  return metrics;
}

function warningsBlockOf(warnings: string[] | undefined): string {
  return warnings?.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "";
}

// ─── Builders ───────────────────────────────────────────────────────────

export function buildNoopResponse(input: NoopResponseInput): ToolResult {
  const {
    path,
    noopEdits,
    snapshotId,
    editsAttempted,
    warnings,
  } = input;

  const noopDetailsText = noopEdits?.length
    ? noopEdits
        .map(
          (edit) =>
            `Edit ${edit.editIndex}: replacement for ${edit.loc} is identical to current content:\n  ${edit.loc}: ${edit.currentContent}`,
        )
        .join("\n")
    : "The edits produced identical content.";

  const text = `No changes made to ${path}\nClassification: noop\n${noopDetailsText}`;

  const metrics = buildMetrics({
    classification: "noop",
    editsAttempted,
    noopEditsCount: noopEdits?.length ?? 0,
    warningsCount: warnings?.length ?? 0,
  });

  return {
    content: [{ type: "text", text }],
    details: {
      diff: "",
      snapshotId,
      classification: "noop" as const,
      metrics,
      package: PACKAGE_INFO,
    },
  };
}

export function buildChangedResponse(input: SuccessResponseInput): ToolResult {
  const { result, warnings, snapshotId, originalNormalized, editsAttempted, noopEditsCount } =
    input;

  const diffResult = generateDiffString(originalNormalized, result);
  const addedLines = countDiffLines(diffResult.diff, "+");
  const removedLines = countDiffLines(diffResult.diff, "-");
  const warningsBlock = warningsBlockOf(warnings);

  const text = [`Applied changes to ${input.path}\nClassification: applied`, warningsBlock.trimStart()]
    .filter((section) => section.length > 0)
    .join("\n\n");

  const metrics = buildMetrics({
    classification: "applied",
    editsAttempted,
    noopEditsCount,
    warningsCount: warnings?.length ?? 0,
    addedLines,
    removedLines,
  });

  return {
    content: [{ type: "text", text }],
    details: {
      diff: diffResult.diff,
      warnings,
      snapshotId,
      metrics,
      package: PACKAGE_INFO,
    },
  };
}

// Local shape — pi-coding-agent does not export a public `ToolResult`. The
// builders return `details` as `any` so callers can keep their own per-tool
// details type without re-asserting it here. This file intentionally does
// not import the agent's tool-result type to stay decoupled from internals.
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  details: any;
};
