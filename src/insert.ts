import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { constants } from "fs";
import { readFileSync } from "fs";
import {
  type HashlineToolEdit,
} from "./hashline";
import { resolveToCwd } from "./path-utils";
import { formatDiffResult } from "./edit-diff-render";
import { setReadSnapshot } from "./read-snapshot";
import { resolveEditTarget } from "./edit";
import { applyMutation } from "./mutation";
import { isRecord } from "./runtime";
import { ensureHasherReady } from "./hash-format";
import {
  consumeDoomLoopWarning,
  formatDoomLoopMessage,
  globalDoomLoopState,
  recordToolCall,
} from "./doom-loop";

const insertEntrySchema = Type.Object(
  {
    anchor: Type.String({
      description: "3-character hash anchor copied from read output; in LINE#HASH│content, use only HASH",
    }),
    direction: Type.String({
      enum: ["after", "before"],
      description: 'Insert direction: "after" or "before" the anchor line.',
    }),
    lines: Type.Array(Type.String(), {
      minItems: 1,
      description: "Lines to insert.",
    }),
    current: Type.Optional(Type.String({
      description: "Optional exact current text of the anchor line; rejects the insert if the live anchor line differs.",
    })),
  },
  { additionalProperties: false },
);

export const insertToolSchema = Type.Object(
  {
    path: Type.String({
      description: "Path to the UTF-8 text file to patch (relative or absolute)",
    }),
    edits: Type.Array(insertEntrySchema, {
      description: "Insert operations to apply.",
    }),
  },
  { additionalProperties: false },
);

// ─── Types ──────────────────────────────────────────────────────────────

type InsertRequestParams = {
  path: string;
  edits: Record<string, unknown>[];
};

type InsertMetrics = {
  edits_attempted: number;
  edits_noop: number;
  warnings: number;
  classification: "applied" | "noop";
  added_lines?: number;
  removed_lines?: number;
};

type InsertToolDetails = {
  diff: string;
  warnings?: string[];
  snapshotId?: string;
  classification?: "noop";
  metrics?: InsertMetrics;
  package: { name: string; version: string };
};

const INSERT_DESC = readFileSync(
  new URL("../tool-descriptions/insert.md", import.meta.url),
  "utf-8",
).trim();

const INSERT_PROMPT_SNIPPET = readFileSync(
  new URL("../tool-descriptions/insert-snippet.md", import.meta.url),
  "utf-8",
).trim();

// ─── Normalization ──────────────────────────────────────────────────────


export function assertInsertRequest(request: unknown): asserts request is InsertRequestParams {
  if (!isRecord(request)) {
    throw new Error("Insert request must be an object.");
  }
  const rootKeys = new Set(["path", "edits"]);
  for (const key of Object.keys(request)) {
    if (!rootKeys.has(key)) {
      throw new Error(`Insert request contains unknown field "${key}".`);
    }
  }
  if (typeof request.path !== "string" || request.path.length === 0) {
    throw new Error('Insert request requires a non-empty "path" string.');
  }
  if (!Array.isArray(request.edits) || request.edits.length === 0) {
    throw new Error('Insert request requires a non-empty "edits" array.');
  }
  const editKeys = new Set(["anchor", "direction", "lines", "current"]);
  for (const [index, edit] of request.edits.entries()) {
    if (!isRecord(edit)) {
      throw new Error(`Insert ${index + 1} must be an object.`);
    }
    for (const key of Object.keys(edit)) {
      if (!editKeys.has(key)) {
        throw new Error(`Insert ${index + 1} contains unknown field "${key}".`);
      }
    }
    if (typeof edit.anchor !== "string" || edit.anchor.length === 0) {
      throw new Error(`Insert ${index + 1} requires a non-empty "anchor" string.`);
    }
    if (edit.direction !== "before" && edit.direction !== "after") {
      throw new Error(`Insert ${index + 1} requires "direction" to be "before" or "after".`);
    }
    if (!Array.isArray(edit.lines) || edit.lines.length === 0 || !edit.lines.every((line) => typeof line === "string")) {
      throw new Error(`Insert ${index + 1} requires non-empty "lines" array of strings.`);
    }
    if (edit.current !== undefined && typeof edit.current !== "string") {
      throw new Error(`Insert ${index + 1} optional "current" must be a string.`);
    }
  }
}

function normalizeInsertItems(edits: Record<string, unknown>[]): HashlineToolEdit[] {
  return edits.map((edit) => {
    const anchor = edit.anchor as string;
    const direction = edit.direction as string;
    const op = direction === "before" ? "prepend" as const : "append" as const;
    return {
      op,
      pos: anchor,
      lines: edit.lines as string[],
      ...(edit.current !== undefined ? { current: edit.current as string } : {}),
    };
  });
}

// ─── Render ─────────────────────────────────────────────────────────────

type EditPreview = { diff: string } | { error: string };
type InsertRenderState = {
  argsKey?: string;
  preview?: EditPreview;
  previewGeneration?: number;
};

function getRenderablePreviewInput(args: unknown): InsertRequestParams | null {
  if (!isRecord(args) || typeof args.path !== "string") {
    return null;
  }
  const request: InsertRequestParams = {
    path: args.path,
    edits: Array.isArray(args.edits) ? args.edits : [],
  };
  return request.edits.length > 0 ? request : null;
}

function formatInsertCall(
  args: InsertRequestParams | undefined,
  state: InsertRenderState,
  theme: {
    bold: (text: string) => string;
    fg: (token: string, text: string) => string;
  },
): string {
  const path = args?.path;
  const pathDisplay =
    typeof path === "string" && path.length > 0
      ? theme.fg("accent", path)
      : theme.fg("toolOutput", "...");
  let text = `${theme.fg("toolTitle", theme.bold("insert"))} ${pathDisplay}`;

  return text;
}

export async function computeInsertPreview(
  request: unknown,
  cwd: string,
): Promise<EditPreview> {
  try {
    assertInsertRequest(request);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const params = request as InsertRequestParams;
  const path = params.path;
  const absolutePath = resolveToCwd(path, cwd);
  const toolEdits = normalizeInsertItems(params.edits);

  await ensureHasherReady();
  const target = await resolveEditTarget(absolutePath, path, constants.R_OK);
  if (!target.ok) {
    return { error: target.error };
  }

  const lines: string[] = [];
  for (const edit of toolEdits) {
    const direction = edit.op === "prepend" ? "before" : "after";
    lines.push(`  insert ${direction} ${edit.pos}`);
  }

  return { diff: `Inserting ${toolEdits.length} block(s):\n${lines.join("\n")}` };
}

// ─── Tool definition ────────────────────────────────────────────────────

type InsertToolDefinition = ToolDefinition<
  typeof insertToolSchema,
  InsertToolDetails,
  InsertRenderState
> & { renderShell?: "default" | "self" };

const insertToolDefinition: InsertToolDefinition = {
  name: "insert",
  label: "Insert",
  description: INSERT_DESC,
  promptSnippet: INSERT_PROMPT_SNIPPET,
  parameters: insertToolSchema,
  renderShell: "default",
  renderCall(args, theme, context) {
    const previewInput = getRenderablePreviewInput(args);
    if (context.executionStarted) {
      context.state.argsKey = undefined;
      context.state.preview = undefined;
      context.state.previewGeneration = (context.state.previewGeneration ?? 0) + 1;
    } else if (!context.argsComplete || !previewInput) {
      context.state.argsKey = undefined;
      context.state.preview = undefined;
      context.state.previewGeneration = (context.state.previewGeneration ?? 0) + 1;
    } else {
      const argsKey = JSON.stringify(previewInput);
      if (context.state.argsKey !== argsKey) {
        context.state.argsKey = argsKey;
        context.state.preview = undefined;
        const previewGeneration = (context.state.previewGeneration ?? 0) + 1;
        context.state.previewGeneration = previewGeneration;
        computeInsertPreview(previewInput, context.cwd)
          .then((preview) => {
            if (
              context.state.argsKey === argsKey &&
              context.state.previewGeneration === previewGeneration
            ) {
              context.state.preview = preview;
              context.invalidate();
            }
          })
          .catch((err: unknown) => {
            if (
              context.state.argsKey === argsKey &&
              context.state.previewGeneration === previewGeneration
            ) {
              context.state.preview = {
                error: err instanceof Error ? err.message : String(err),
              };
              context.invalidate();
            }
          });
      }
    }
    const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
    text.setText(
      formatInsertCall(
        getRenderablePreviewInput(args) ?? undefined,
        context.state as InsertRenderState,
        theme as { bold: (text: string) => string; fg: (token: string, text: string) => string },
      ),
    );
    return text;
  },

  renderResult(result, { isPartial }, theme, context) {
    if (isPartial) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(theme.fg("warning", "Inserting..."));
      return text;
    }

    const typedResult = result as {
      content?: Array<{ type: string; text?: string }>;
      details?: InsertToolDetails;
    };

    if (context.isError) {
      const textContent = typedResult.content?.find(
        (entry): entry is { type: "text"; text: string } =>
          entry.type === "text" && typeof entry.text === "string",
      );
      if (!textContent) return new Text("", 0, 0);
      const text = context.lastComponent instanceof Text
        ? context.lastComponent
        : new Text("", 0, 0);
      text.setText(`\n${theme.fg("error", textContent.text)}`);
      return text;
    }

    const details = typedResult.details;
    const metrics = details?.metrics;
    if (metrics?.classification === "applied" && details?.diff) {
      const maxLines = context.expanded ? Infinity : 16;
      const rendered = formatDiffResult(details.diff, maxLines, theme);

      const sections: string[] = [];
      if (rendered) sections.push(rendered);

      if (metrics.added_lines !== undefined || metrics.removed_lines !== undefined) {
        const parts: string[] = [];
        if (metrics.added_lines) parts.push(`${metrics.added_lines} insertion${metrics.added_lines !== 1 ? "s" : ""}(+)`);
        if (metrics.removed_lines) parts.push(`${metrics.removed_lines} removal${metrics.removed_lines !== 1 ? "s" : ""}(-)`);
        if (parts.length) sections.push(theme.fg("accent", parts.join(", ")));
      }
      if (details.warnings?.length) {
        sections.push(`Warnings:\n${details.warnings.join("\n")}`);
      }

      if (sections.length) {
        const text = context.lastComponent instanceof Text
          ? context.lastComponent
          : new Text("", 0, 0);
        text.setText(sections.join("\n\n"));
        return text;
      }
    }

    return new Text("", 0, 0);
  },

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    recordToolCall(globalDoomLoopState, "insert", _toolCallId, params as Record<string, unknown>);
    assertInsertRequest(params);

    await ensureHasherReady();

    const path = (params as InsertRequestParams).path;
    const absolutePath = resolveToCwd(path, ctx.cwd);
    const toolEdits = normalizeInsertItems(
      (params as InsertRequestParams).edits,
    );

    const result = await applyMutation({
      pi: _insertPi,
      path,
      absolutePath,
      toolEdits,
      signal,
      ctx,
    });
    const warning = consumeDoomLoopWarning(globalDoomLoopState, _toolCallId);
    if (warning) {
      result.content[0]!.text += `\n\n${formatDoomLoopMessage(warning)}`;
    }
    return result;
  },
};

let _insertPi: ExtensionAPI | undefined;

export function registerInsertTool(pi: ExtensionAPI): void {
  _insertPi = pi;
  pi.events.on("hashline:read-snapshot", (data: { path: string; file: import("./hashline").HashlineFile }) => {
    setReadSnapshot(data.path, data.file);
  });
  pi.registerTool(insertToolDefinition);
}
