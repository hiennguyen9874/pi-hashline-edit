import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import registerCore from "../../extensions/core";
import registerInsert from "../../extensions/insert";
import registerUndo from "../../extensions/undo";
import registerGrep from "../../extensions/grep";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
);

function collectToolDefinitions(register: (pi: any) => void): any[] {
  const tools: any[] = [];
  const pi = {
    registerTool(tool: any) {
      tools.push(tool);
    },
    on() {},
    events: { emit() {}, on() {} },
  };
  register(pi);
  return tools;
}

function collectTools(register: (pi: any) => void): string[] {
  return collectToolDefinitions(register).map((tool) => tool.name);
}

describe("extension registration", () => {
  it("package defaults enable core, insert, and grep extensions", () => {
    expect(packageJson.pi.extensions).toEqual([
      "./extensions/core.ts",
      "./extensions/insert.ts",
      "./extensions/grep.ts",
    ]);
  });

  it("core registers 'edit' and 'read'", () => {
    expect(collectTools(registerCore).sort()).toEqual(["edit", "read"]);
  });

  it("read prompt guidelines provide policy-level tool guidance", () => {
    const readTool = collectToolDefinitions(registerCore).find((tool) => tool.name === "read");

    expect(readTool?.promptGuidelines).toContain(
      "Use the tool schemas as the source of truth for exact parameters and call shapes.",
    );
    expect(readTool?.promptGuidelines).toContain("Use `read` for file inspection.");
    expect(readTool?.promptGuidelines).toContain(
      "Use `edit` for replacing or deleting existing text.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "Before editing or inserting, use fresh anchors from the latest relevant tool output; do not guess anchors or act on stale context.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "Preserve user-provided spelling and wording unless correction is explicitly requested.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "For exact patch mechanics, follow the tool descriptions.",
    );
  });

  it("edit schema requires edits by default", () => {
    const editTool = collectToolDefinitions(registerCore).find((tool) => tool.name === "edit");

    expect(editTool?.parameters.required).toEqual(["path", "edits"]);
    expect(editTool?.parameters.properties.path.description).toBe(
      "Path to the UTF-8 text file to patch, relative or absolute.",
    );
  });

  it("insert registers 'insert'", () => {
    expect(collectTools(registerInsert).sort()).toEqual(["insert"]);
  });

  it("insert contributes a behavior-level prompt snippet", () => {
    const insertTool = collectToolDefinitions(registerInsert).find((tool) => tool.name === "insert");

    expect(insertTool?.promptSnippet).toContain(
      "insert: Add new lines without changing existing text.",
    );
    expect(insertTool?.promptSnippet).toContain("follow the schema and tool description");
  });

  it("insert description encourages one call per file", () => {
    const insertTool = collectToolDefinitions(registerInsert).find((tool) => tool.name === "insert");

    expect(insertTool?.description).toContain(
      "Submit one `insert` call per file. Put all insertions for that file in `edits`.",
    );
    expect(insertTool?.parameters.properties.path.description).toBe(
      "Path to the UTF-8 text file to patch, relative or absolute.",
    );
  });

  it("undo remains available as an optional extension", () => {
    expect(collectTools(registerUndo).sort()).toEqual(["undo"]);
  });

  it("undo is not enabled by default in package metadata", () => {
    expect(packageJson.pi.extensions).not.toContain("./extensions/undo.ts");
  });

  it("grep registers 'grep' if rg available", () => {
    let rgOk = false;
    try {
      const r = spawnSync("rg", ["--version"], { stdio: "pipe" });
      rgOk = r.status === 0;
    } catch {
      // rg not on PATH
    }
    if (rgOk) {
      expect(collectTools(registerGrep).sort()).toEqual(["grep"]);
    }
  });
});
