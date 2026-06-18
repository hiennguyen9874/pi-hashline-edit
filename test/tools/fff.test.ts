import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import registerFff from "../../extensions/fff";
import { buildHashlineFile } from "../../src/hashline";

const state = vi.hoisted(() => ({
  grepItems: [] as any[],
  grepCalls: [] as { query: string; options: any }[],
  grepResponses: [] as any[],
  fileItems: [] as any[],
}));

vi.mock("@ff-labs/fff-node", () => ({
  FileFinder: {
    create: vi.fn(() => ({
      ok: true,
      value: {
        isDestroyed: false,
        destroy: vi.fn(),
        waitForScan: vi.fn(async () => undefined),
        grep: vi.fn((query: string, options: any) => {
          state.grepCalls.push({ query, options });
          return state.grepResponses.shift() ?? {
            ok: true,
            value: {
              items: state.grepItems,
              totalMatched: state.grepItems.length,
              totalFiles: 1,
            },
          };
        }),
        fileSearch: vi.fn(() => ({
          ok: true,
          value: {
            items: state.fileItems,
            scores: [{ total: 100 }],
            totalMatched: state.fileItems.length,
            totalFiles: state.fileItems.length,
          },
        })),
      },
    })),
  },
}));

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "pi-hashline-fff-"));
  return {
    dir,
    add(filename: string, content: string) {
      const path = join(dir, filename);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf-8");
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function collectFffTools(cwd: string) {
  const tools = new Map<string, any>();
  const events = new Map<string, any>();
  const pi = {
    getFlag: vi.fn(() => undefined),
    registerFlag: vi.fn(),
    registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
    on: vi.fn((event: string, handler: any) => events.set(event, handler)),
  };

  registerFff(pi as any);
  return {
    tools,
    async start() {
      await events.get("session_start")?.({}, { cwd, ui: { notify() {} } });
    },
  };
}

describe("fff hashline tools", () => {
  afterEach(() => {
    state.grepItems = [];
    state.grepCalls = [];
    state.grepResponses = [];
    state.fileItems = [];
  });

  it("registers fffind and ffgrep without overriding grep", () => {
    const { tools } = collectFffTools(process.cwd());

    expect([...tools.keys()].sort()).toEqual(["fffind", "ffgrep"]);
  });

  it("formats ffgrep matches as LINE#HASH content anchors", async () => {
    const tmp = tempDir();
    try {
      tmp.add("src/sample.ts", "alpha\nbeta\ngamma\n");
      state.grepItems = [{ relativePath: "src/sample.ts", lineNumber: 2, lineContent: "beta" }];

      const { tools, start } = collectFffTools(tmp.dir);
      await start();
      const result = await tools.get("ffgrep").execute(
        "g1",
        { pattern: "beta", path: "src/" },
        undefined,
      );

      const hash = buildHashlineFile("alpha\nbeta\ngamma\n").lineHashes[1];
      expect(result.content[0].text).toContain("src/sample.ts");
      expect(result.content[0].text).toContain(`2#${hash}│beta`);
    } finally {
      tmp.cleanup();
    }
  });

  it("passes limit as FFF grep pageSize", async () => {
    const tmp = tempDir();
    try {
      tmp.add("src/sample.ts", "alpha\n");

      const { tools, start } = collectFffTools(tmp.dir);
      await start();
      await tools.get("ffgrep").execute(
        "g1",
        { pattern: "alpha", limit: 7 },
        undefined,
      );

      expect(state.grepCalls[0].options).toMatchObject({
        pageSize: 7,
        maxMatchesPerFile: 7,
      });
    } finally {
      tmp.cleanup();
    }
  });

  it("keeps path and exclude constraints for fuzzy fallback", async () => {
    const tmp = tempDir();
    try {
      tmp.add("src/sample.ts", "target\n");
      state.grepResponses = [
        { ok: true, value: { items: [], totalMatched: 0, totalFiles: 1 } },
        {
          ok: true,
          value: {
            items: [{ relativePath: "src/sample.ts", lineNumber: 1, lineContent: "target" }],
            totalMatched: 1,
            totalFiles: 1,
          },
        },
      ];

      const { tools, start } = collectFffTools(tmp.dir);
      await start();
      await tools.get("ffgrep").execute(
        "g1",
        { pattern: "targt", path: "src/", exclude: "dist/", limit: 3 },
        undefined,
      );

      expect(state.grepCalls).toHaveLength(2);
      expect(state.grepCalls[1].query).toBe("src/ !dist/ targt");
      expect(state.grepCalls[1].options).toMatchObject({
        mode: "fuzzy",
        pageSize: 3,
        maxMatchesPerFile: 3,
      });
    } finally {
      tmp.cleanup();
    }
  });

  it("warns when FFF match content is stale", async () => {
    const tmp = tempDir();
    try {
      tmp.add("src/sample.ts", "alpha\ncurrent\ngamma\n");
      state.grepItems = [{ relativePath: "src/sample.ts", lineNumber: 2, lineContent: "indexed" }];

      const { tools, start } = collectFffTools(tmp.dir);
      await start();
      const result = await tools.get("ffgrep").execute(
        "g1",
        { pattern: "indexed", path: "src/" },
        undefined,
      );

      expect(result.content[0].text).toContain("2#");
      expect(result.content[0].text).toContain("│current");
      expect(result.content[0].text).toContain(
        "FFF result may be stale for src/sample.ts:2; use read before editing",
      );
    } finally {
      tmp.cleanup();
    }
  });
});
