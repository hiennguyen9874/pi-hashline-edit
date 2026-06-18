import { readFileSync } from "fs";
import { resolve } from "path";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeToLF, stripBom } from "./edit-diff";
import { buildHashlineFile } from "./hashline";
import { formatAnchorPrefix } from "./anchor-display";
import { ensureHasherReady } from "./hash-format";
import { buildFffQuery } from "./fff-query";

const DEFAULT_GREP_LIMIT = 20;
const DEFAULT_FIND_LIMIT = 30;
const GREP_MAX_LINE_LENGTH = 500;
const FIND_WEAK_SAMPLE_SIZE = 5;
const HOT_FRECENCY = 25;
const WARM_FRECENCY = 20;

type FffNodeModule = {
  FileFinder: {
    create(options: Record<string, unknown>): { ok: true; value: FffFinder } | { ok: false; error: string };
  };
};

type FffFinder = {
  isDestroyed?: boolean;
  destroy(): void;
  waitForScan(ms: number): Promise<void>;
  fileSearch(query: string, options: Record<string, unknown>): FffResult<FffSearchResult>;
  grep(query: string, options: Record<string, unknown>): FffResult<FffGrepResult>;
  healthCheck?: () => FffResult<Record<string, unknown>>;
  getScanProgress?: () => FffResult<Record<string, unknown>>;
};

type FffResult<T> = { ok: true; value: T } | { ok: false; error: string };

type FffSearchItem = {
  relativePath: string;
  gitStatus?: string;
  totalFrecencyScore?: number;
  accessFrecencyScore?: number;
};

type FffSearchResult = {
  items: FffSearchItem[];
  scores?: { total?: number }[];
  totalMatched: number;
  totalFiles: number;
};

type FffGrepMatch = {
  relativePath: string;
  lineNumber: number;
  lineContent: string;
  contextBefore?: string[];
  contextAfter?: string[];
  gitStatus?: string;
  totalFrecencyScore?: number;
  accessFrecencyScore?: number;
};

type FffGrepResult = {
  items: FffGrepMatch[];
  totalMatched: number;
  totalFiles: number;
  nextCursor?: unknown;
  regexFallbackError?: string;
};

type FindCursor = {
  query: string;
  pattern: string;
  pageSize: number;
  nextPageIndex: number;
};

const grepCursorCache = new Map<string, unknown>();
let grepCursorCounter = 0;
const findCursorCache = new Map<string, FindCursor>();
let findCursorCounter = 0;

function storeGrepCursor(cursor: unknown): string {
  const id = `fff_c${++grepCursorCounter}`;
  grepCursorCache.set(id, cursor);
  if (grepCursorCache.size > 200) {
    const first = grepCursorCache.keys().next().value;
    if (first) grepCursorCache.delete(first);
  }
  return id;
}

function getGrepCursor(id: string): unknown | undefined {
  return grepCursorCache.get(id);
}

function storeFindCursor(cursor: FindCursor): string {
  const id = `${++findCursorCounter}`;
  findCursorCache.set(id, cursor);
  if (findCursorCache.size > 200) {
    const first = findCursorCache.keys().next().value;
    if (first) findCursorCache.delete(first);
  }
  return id;
}

function getFindCursor(id: string): FindCursor | undefined {
  return findCursorCache.get(id);
}

async function loadFffNode(): Promise<FffNodeModule> {
  try {
    return await import("@ff-labs/fff-node") as unknown as FffNodeModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load @ff-labs/fff-node: ${message}`);
  }
}

function truncateLine(line: string): { text: string; truncated: boolean } {
  if (line.length <= GREP_MAX_LINE_LENGTH) return { text: line, truncated: false };
  return { text: `${line.slice(0, GREP_MAX_LINE_LENGTH)}…`, truncated: true };
}

function fileAnnotation(item: {
  gitStatus?: string;
  totalFrecencyScore?: number;
  accessFrecencyScore?: number;
}): string {
  const git = item.gitStatus;
  if (git && git !== "clean" && git !== "unknown" && git !== "") {
    return `  [${git} in git]`;
  }

  const frecency = item.totalFrecencyScore ?? item.accessFrecencyScore ?? 0;
  if (frecency >= HOT_FRECENCY) return "  [VERY often touched file]";
  if (frecency >= WARM_FRECENCY) return "  [often touched file]";

  return "";
}

function weakScoreThreshold(pattern: string): number {
  const perfect = pattern.length * 12;
  return Math.floor((perfect * 50) / 100);
}

function formatFindOutput(
  result: FffSearchResult,
  limit: number,
  pattern: string,
): { output: string; weak: boolean; shownCount: number } {
  if (result.items.length === 0) {
    return { output: "No files found matching pattern", weak: false, shownCount: 0 };
  }

  const topScore = result.scores?.[0]?.total ?? 0;
  const weak = topScore < weakScoreThreshold(pattern);
  const effective = weak ? Math.min(FIND_WEAK_SAMPLE_SIZE, limit) : limit;
  const shown = result.items.slice(0, effective);

  return {
    output: shown.map((item) => `${item.relativePath}${fileAnnotation(item)}`).join("\n"),
    weak,
    shownCount: shown.length,
  };
}

function addContextLines(match: FffGrepMatch, lineNumbers: Set<number>): void {
  const before = match.contextBefore ?? [];
  for (let index = 0; index < before.length; index++) {
    lineNumbers.add(match.lineNumber - before.length + index);
  }

  lineNumbers.add(match.lineNumber);

  const after = match.contextAfter ?? [];
  for (let index = 0; index < after.length; index++) {
    lineNumbers.add(match.lineNumber + 1 + index);
  }
}

function formatHashlineGrepOutput(
  result: FffGrepResult,
  cwd: string,
): { output: string; linesTruncated: boolean; staleWarnings: string[] } {
  if (result.items.length === 0) {
    return { output: "No matches found", linesTruncated: false, staleWarnings: [] };
  }

  const lines: string[] = [];
  const staleWarnings: string[] = [];
  let currentFile = "";
  let currentNumbers = new Set<number>();
  let currentMatches = new Map<number, string>();
  let currentAnnotation = "";
  let linesTruncated = false;

  const flush = () => {
    if (!currentFile) return;
    if (lines.length > 0) lines.push("");
    lines.push(`${currentFile}${currentAnnotation}`);

    let file;
    try {
      const text = normalizeToLF(stripBom(readFileSync(resolve(cwd, currentFile), "utf-8")).text);
      file = buildHashlineFile(text);
    } catch {
      lines.push(`Cannot read matched file: ${currentFile}`);
      currentNumbers = new Set<number>();
      currentMatches = new Map<number, string>();
      return;
    }

    const sorted = [...currentNumbers].sort((a, b) => a - b);
    const width = sorted.length > 0 ? String(sorted[sorted.length - 1]).length : 1;
    for (const lineNumber of sorted) {
      const originalLine = file.lines[lineNumber - 1];
      if (originalLine === undefined) continue;

      const expectedLine = currentMatches.get(lineNumber);
      if (expectedLine !== undefined && originalLine !== expectedLine) {
        staleWarnings.push(`${currentFile}:${lineNumber}`);
      }

      const hash = file.lineHashes[lineNumber - 1]!;
      const truncated = truncateLine(originalLine);
      if (truncated.truncated) linesTruncated = true;
      lines.push(`${formatAnchorPrefix({ line: lineNumber, hash, lineNumberWidth: width })}${truncated.text}`);
    }

    currentNumbers = new Set<number>();
    currentMatches = new Map<number, string>();
  };

  for (const match of result.items) {
    if (match.relativePath !== currentFile) {
      flush();
      currentFile = match.relativePath;
      currentAnnotation = fileAnnotation(match);
    }
    addContextLines(match, currentNumbers);
    currentMatches.set(match.lineNumber, match.lineContent);
  }
  flush();

  return { output: lines.join("\n"), linesTruncated, staleWarnings };
}

function renderTextResult(
  result: { content?: { type: string; text?: string }[] },
  options: { expanded?: boolean },
  theme: any,
  context: any,
  maxLines: number,
) {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const output = result.content?.find((content) => content.type === "text")?.text?.trim() ?? "";
  if (!output) {
    text.setText(theme.fg("muted", "No output"));
    return text;
  }

  const lines = output.split("\n");
  const displayLines = lines.slice(0, options.expanded ? lines.length : maxLines);
  let content = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
  if (lines.length > displayLines.length) {
    content += theme.fg("muted", `\n... (${lines.length - displayLines.length} more lines)`);
  }
  text.setText(content);
  return text;
}

export function registerFffTools(pi: ExtensionAPI): void {
  let finder: FffFinder | null = null;
  let finderCwd: string | null = null;
  let finderPromise: Promise<FffFinder> | null = null;
  let activeCwd = process.cwd();

  const frecencyDbPath =
    (pi.getFlag?.("fff-frecency-db") as string | undefined) ??
    process.env.FFF_FRECENCY_DB ??
    undefined;
  const historyDbPath =
    (pi.getFlag?.("fff-history-db") as string | undefined) ??
    process.env.FFF_HISTORY_DB ??
    undefined;

  function resolveBoolOpt(flagName: string, envName: string): boolean {
    const flag = pi.getFlag?.(flagName);
    if (typeof flag === "boolean") return flag;
    if (typeof flag === "string") return flag === "true" || flag === "1";
    const env = process.env[envName];
    return env === "1" || env === "true";
  }

  const enableFsRootScanning = resolveBoolOpt(
    "fff-enable-root-scan",
    "FFF_ENABLE_ROOT_SCAN",
  );

  async function ensureFinder(cwd: string): Promise<FffFinder> {
    if (finder && !finder.isDestroyed && finderCwd === cwd) return finder;
    if (finderPromise) return finderPromise;

    finderPromise = (async () => {
      if (finder && !finder.isDestroyed) {
        finder.destroy();
        finder = null;
        finderCwd = null;
      }

      const { FileFinder } = await loadFffNode();
      const created = FileFinder.create({
        basePath: cwd,
        frecencyDbPath,
        historyDbPath,
        aiMode: true,
        enableHomeDirScanning: true,
        enableFsRootScanning,
      });

      if (!created.ok) throw new Error(`Failed to create FFF file finder: ${created.error}`);

      finder = created.value;
      finderCwd = cwd;
      await finder.waitForScan(15000);
      return finder;
    })().finally(() => {
      finderPromise = null;
    });

    return finderPromise;
  }

  function destroyFinder(): void {
    if (finder && !finder.isDestroyed) {
      finder.destroy();
      finder = null;
      finderCwd = null;
    }
  }

  pi.registerFlag?.("fff-frecency-db", {
    description: "Path to the frecency database (overrides FFF_FRECENCY_DB env)",
    type: "string",
  });

  pi.registerFlag?.("fff-history-db", {
    description: "Path to the query history database (overrides FFF_HISTORY_DB env)",
    type: "string",
  });

  pi.registerFlag?.("fff-enable-root-scan", {
    description: "Allow indexing when launched from the filesystem root (also: FFF_ENABLE_ROOT_SCAN env)",
    type: "boolean",
  });

  pi.on?.("session_start", async (_event, ctx) => {
    activeCwd = ctx.cwd;
    try {
      await ensureFinder(activeCwd);
    } catch (error) {
      ctx.ui.notify(
        `FFF init failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  });

  pi.on?.("session_shutdown", async () => {
    destroyFinder();
  });

  const grepSchema = Type.Object({
    pattern: Type.String({ description: "Search pattern (literal text or regex)" }),
    path: Type.Optional(Type.String({ description: "Repo-relative path constraint. Directory prefix (src/ or src/foo/), bare filename with extension (main.rs), or glob (*.ts, src/**/*.cc, {src,lib}/**). Applied to the full repo-relative path." })),
    exclude: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], { description: "Exclude paths (comma/space-separated or array). Same syntax as path: directory prefix ('test/'), filename with extension ('config.json'), or glob ('*.min.js', '**/*.{rs,go}'). A leading '!' is optional and ignored." })),
    caseSensitive: Type.Optional(Type.Boolean({ description: "Force case-sensitive matching. Default uses smart-case (case-insensitive when pattern is all lowercase)." })),
    context: Type.Optional(Type.Number({ description: "Context lines before+after each match" })),
    limit: Type.Optional(Type.Number({ description: `Max matches (default ${DEFAULT_GREP_LIMIT})` })),
    cursor: Type.Optional(Type.String({ description: "Pagination cursor from previous result" })),
  });

  pi.registerTool({
    name: "ffgrep",
    label: "ffgrep",
    description: `Grep file contents with FFF. Results are frecency-ranked and each shown line is rendered as hashline output (LINE#HASH│content) for direct use with hashline edit. Default limit ${DEFAULT_GREP_LIMIT}.`,
    promptSnippet: "Grep contents with FFF and hashline anchors",
    promptGuidelines: [
      "Prefer bare identifiers as patterns. Literal queries are most efficient.",
      "Use path for include ('src/', '*.ts') and exclude for noise ('test/,*.min.js').",
      "Copy only the 3-character hash between # and │ into edit or insert; line numbers are display-only.",
      "After 1-2 greps, read the top match instead of more greps.",
    ],
    parameters: grepSchema,

    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) throw new Error("Operation aborted");
      await ensureHasherReady();

      const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_GREP_LIMIT);
      const query = buildFffQuery(params.path, params.pattern, params.exclude, activeCwd);
      const hasRegexSyntax =
        params.pattern !== params.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let mode = hasRegexSyntax ? "regex" : "plain";
      if (mode === "regex") {
        try {
          new RegExp(params.pattern);
        } catch {
          mode = "plain";
        }
      }

      const p = params.pattern.trim();
      const isWildcardOnly =
        hasRegexSyntax &&
        /^(?:[.^$]*(?:[.][*+?]|\*|\+)[.^$]*|[.^$\s]*|\.\*\??|\.\*[+?]?|\.\+\??|\.|\*|\?)$/.test(p);

      if (isWildcardOnly) {
        return {
          content: [{ type: "text", text: `Pattern '${params.pattern}' matches everything — grep needs a concrete substring or identifier.` }],
          details: { totalMatched: 0, totalFiles: 0 },
        };
      }

      const f = await ensureFinder(activeCwd);
      const smartCase = params.caseSensitive !== true;
      const grepResult = f.grep(query, {
        mode,
        smartCase,
        pageSize: effectiveLimit,
        maxMatchesPerFile: Math.min(effectiveLimit, 50),
        cursor: (params.cursor ? getGrepCursor(params.cursor) : null) ?? null,
        beforeContext: params.context ?? 0,
        afterContext: params.context ?? 0,
        classifyDefinitions: true,
      });

      if (!grepResult.ok) throw new Error(grepResult.error);

      let result = grepResult.value;
      let fuzzyNotice: string | null = null;
      if (result.items.length === 0 && !params.cursor && mode !== "regex") {
        const fuzzy = f.grep(query, {
          mode: "fuzzy",
          smartCase,
          pageSize: effectiveLimit,
          maxMatchesPerFile: Math.min(effectiveLimit, 50),
          cursor: null,
          beforeContext: 0,
          afterContext: 0,
          classifyDefinitions: true,
        });

        if (fuzzy.ok && fuzzy.value.items.length > 0) {
          fuzzyNotice = "0 exact matches. Maybe you meant this?";
          result = fuzzy.value;
        }
      }

      const formatted = formatHashlineGrepOutput(result, activeCwd);
      let output = formatted.output;
      const notices: string[] = [];
      if (result.regexFallbackError) notices.push(`Invalid regex: ${result.regexFallbackError}, used literal match`);
      if (result.nextCursor) notices.push(`Continue with cursor=\"${storeGrepCursor(result.nextCursor)}\"`);
      if (formatted.linesTruncated) notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`);
      if (formatted.staleWarnings.length > 0) {
        notices.push(`FFF result may be stale for ${formatted.staleWarnings.join(", ")}; use read before editing`);
      }
      if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
      if (fuzzyNotice) output = `[${fuzzyNotice}]\n${output}`;

      return {
        content: [{ type: "text", text: output }],
        details: { totalMatched: result.totalMatched, totalFiles: result.totalFiles },
      };
    },

    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const pattern = args?.pattern ?? "";
      const path = args?.path ?? ".";
      let content =
        theme.fg("toolTitle", theme.bold("ffgrep")) +
        " " +
        theme.fg("accent", `/${pattern}/`) +
        theme.fg("toolOutput", ` in ${path}`);
      if (args?.limit !== undefined) content += theme.fg("toolOutput", ` limit ${args.limit}`);
      if (args?.cursor) content += theme.fg("muted", " (page)");
      text.setText(content);
      return text;
    },

    renderResult(result, options, theme, context) {
      return renderTextResult(result, options, theme, context, 15);
    },
  });

  const findSchema = Type.Object({
    pattern: Type.String({ description: "Fuzzy filename search and glob search. Frecency-ranked, git-aware. Multi-word = narrower (AND) not bound to order." }),
    path: Type.Optional(Type.String({ description: "Repo-relative path constraint. Directory prefix, bare filename with extension, or glob." })),
    exclude: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], { description: "Exclude paths (comma/space-separated or array)." })),
    limit: Type.Optional(Type.Number({ description: `Max results per page (default ${DEFAULT_FIND_LIMIT})` })),
    cursor: Type.Optional(Type.String({ description: "Pagination cursor from previous result" })),
  });

  pi.registerTool({
    name: "fffind",
    label: "fffind",
    description: `Fuzzy path search and glob search. Matches against the whole repo-relative path, not just the filename. Frecency-ranked, git-aware. Default limit ${DEFAULT_FIND_LIMIT}.`,
    promptSnippet: "Find files by path or glob",
    promptGuidelines: [
      "Matches the WHOLE path, not just the filename — `profile` hits `chrome/browser/profiles/x.cc` too.",
      "Keep queries to 1-2 terms; extra words narrow.",
      "Use for paths, not content. Use grep for content.",
      "For exact path matches use a glob in `path` — e.g. path: '**/profile.h' for exact filename.",
      "Use exclude: 'test/,*.min.js' to cut noise in large repos.",
    ],
    parameters: findSchema,

    async execute(_toolCallId, params, signal) {
      if (signal?.aborted) throw new Error("Operation aborted");

      const f = await ensureFinder(activeCwd);
      const resumed = params.cursor ? getFindCursor(params.cursor) : undefined;
      const effectiveLimit = resumed
        ? resumed.pageSize
        : Math.max(1, params.limit ?? DEFAULT_FIND_LIMIT);
      const query = resumed
        ? resumed.query
        : buildFffQuery(params.path, params.pattern, params.exclude, activeCwd);
      const pattern = resumed ? resumed.pattern : params.pattern;
      const pageIndex = resumed?.nextPageIndex ?? 0;

      const searchResult = f.fileSearch(query, { pageIndex, pageSize: effectiveLimit });
      if (!searchResult.ok) throw new Error(searchResult.error);

      const result = searchResult.value;
      const formatted = formatFindOutput(result, effectiveLimit, pattern);
      let output = formatted.output;
      const shownSoFar = pageIndex * effectiveLimit + result.items.length;
      const hasMore = result.items.length >= effectiveLimit && result.totalMatched > shownSoFar;
      const notices: string[] = [];

      if (formatted.weak && formatted.shownCount > 0) {
        notices.push(`Query \"${pattern}\" produced only weak scattered fuzzy matches. Output capped at ${formatted.shownCount}/${result.totalMatched}.`);
      }

      if (!formatted.weak && hasMore) {
        const remaining = result.totalMatched - shownSoFar;
        const cursorId = storeFindCursor({
          query,
          pattern,
          pageSize: effectiveLimit,
          nextPageIndex: pageIndex + 1,
        });
        notices.push(`${remaining} more match${remaining === 1 ? "" : "es"} available. cursor=\"${cursorId}\" to continue`);
      }

      if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
      return {
        content: [{ type: "text", text: output }],
        details: { totalMatched: result.totalMatched, totalFiles: result.totalFiles, pageIndex, hasMore },
      };
    },

    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      const pattern = args?.pattern ?? "";
      const path = args?.path ?? ".";
      let content =
        theme.fg("toolTitle", theme.bold("fffind")) +
        " " +
        theme.fg("accent", pattern) +
        theme.fg("toolOutput", ` in ${path}`);
      if (args?.limit !== undefined) content += theme.fg("toolOutput", ` (limit ${args.limit})`);
      if (args?.cursor) content += theme.fg("muted", " (page)");
      text.setText(content);
      return text;
    },

    renderResult(result, options, theme, context) {
      return renderTextResult(result, options, theme, context, 20);
    },
  });
}
