import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import registerCore from "../../extensions/core";
import registerInsert from "../../extensions/insert";
import registerUndo from "../../extensions/undo";
import registerGrep from "../../extensions/grep";
import registerFff from "../../extensions/fff";

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
  it("package defaults enable only core and insert extensions", () => {
    expect(packageJson.pi.extensions).toEqual([
      "./extensions/core.ts",
      "./extensions/insert.ts",
      "./extensions/fff.ts",
    ]);
  });

  it("core registers 'edit' and 'read'", () => {
    expect(collectTools(registerCore).sort()).toEqual(["edit", "read"]);
  });

  it("read prompt guidelines encourage raw context reads, fresh-anchor reuse, and minimal writes", () => {
    const readTool = collectToolDefinitions(registerCore).find((tool) => tool.name === "read");

    expect(readTool?.promptGuidelines).toContain(
      "Use `raw: true` for planning, design, review, answering questions, documentation, or source-context reads when you do not plan to edit the file.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "Use read without `raw` before edit or insert when you do not have current 3-character hash anchors for the file.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "Use insert when only adding lines; use edit when replacing or deleting existing lines.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "If an edit or insert result shows fresh anchors as `HASH│content`, copy only HASH before `│` for follow-up edits instead of calling read again.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "For simple file creation requests, write only the requested content unless the user asks for structure.",
    );
    expect(readTool?.promptGuidelines).toContain(
      "Preserve user-provided spelling and wording unless correction is explicitly requested.",
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

  it("insert contributes a prompt snippet", () => {
    const insertTool = collectToolDefinitions(registerInsert).find((tool) => tool.name === "insert");

    expect(insertTool?.promptSnippet).toContain("Insert new lines before or after an existing HASH anchor");
    expect(insertTool?.promptSnippet).toContain("In LINE#HASH│content, copy only HASH.");
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

  it("fff registers fffind and ffgrep without overriding grep", () => {
    expect(collectTools(registerFff).sort()).toEqual(["fffind", "ffgrep"]);
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
