import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import registerCore from "../../extensions/core";
import { computeLineHash } from "../../src/hashline";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";

function getText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("edit tool text shape (token budget)", () => {
  it("returns unified diff in LLM-visible text with line counts in details", async () => {
    await withTempFile("sample.ts", "aaa\nbbb\nccc\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const bRef = computeLineHash(["aaa", "bbb", "ccc"], 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.ts",
          edits: [
            {
              start: bRef, end: bRef,
              lines: ["BBB"],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      expect(text).toContain(" 1#");
      expect(text).toContain("+2#");
      expect(text).toContain("│BBB");
      expect(text).not.toContain("Updated sample.ts");
      expect(text).not.toContain("Changes: +1 -1");
      expect(text).not.toContain("Diff preview");
      expect(text).not.toContain("Updated anchors");
      expect(result.details?.diff).toContain("+2");
      expect(result.details?.diff).toContain("│BBB");
      expect(result.details?.metrics).toMatchObject({
        added_lines: 1,
        removed_lines: 1,
      });
    });
  });

  it("diff format uses aligned separators", async () => {
    await withTempFile("sample.ts", "aaa\nbbb\nccc\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const bRef = computeLineHash(["aaa", "bbb", "ccc"], 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.ts",
          edits: [
            {
              start: bRef, end: bRef,
              lines: ["BBB"],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      expect(text).toMatch(/^ 1#\w{3}│aaa$/m);
      expect(text).toMatch(/^\+2#\w{3}│BBB$/m);
      expect(text).toMatch(/^-2   │bbb$/m);
    });
  });

  it("full content details are omitted", async () => {
    await withTempFile("sample.txt", "aaa\nbbb\nccc\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const bRef = computeLineHash(["aaa", "bbb", "ccc"], 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.txt",
          edits: [
            {
              start: bRef, end: bRef,
              lines: ["BBB"],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      expect(text).not.toContain("Structure outline:");
      expect(result.details?.fullContent).toBeUndefined();
      expect(result.details?.structureOutline).toBeUndefined();
    });
  });

  it("noop returns classification noop", async () => {
    await withTempFile("sample.txt", "aaa\nbbb\nccc\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const bRef = computeLineHash(["aaa", "bbb", "ccc"], 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.txt",
          edits: [
            {
              start: bRef, end: bRef,
              lines: ["bbb"],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      expect(text).toContain("Classification: noop");
      expect(text).not.toContain("Structure outline:");
    });
  });

  it("allows full-file deletion for small files (≤50 lines) and shows diff", async () => {
    await withTempFile("sample.txt", "only\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const oRef = computeLineHash(["only"], 0);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.txt",
          edits: [
            {
              start: oRef, end: oRef,
              lines: [],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      expect(text).toContain("-1   │only");
      expect(await readFile(`${cwd}/sample.txt`, "utf-8")).toBe("");
    });
  });

  it("rejects full-file deletion for large files (>50 lines)", async () => {
    const lines = Array.from({ length: 55 }, (_, i) => `line ${i + 1}`).join("\n");
    await withTempFile("big.txt", `${lines}\n`, async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const fileLines = Array.from({ length: 55 }, (_, i) => `line ${i + 1}`);
      const firstRef = computeLineHash(fileLines, 0);
      const lastRef = computeLineHash(fileLines, 54);

      await expect(
        editTool.execute(
          "e1",
          {
            path: "big.txt",
            edits: [
              {
                start: firstRef, end: lastRef,
                lines: [],
              },
            ],
          },
          undefined,
          undefined,
          { cwd } as any,
        ),
      ).rejects.toThrow(/\[E_WOULD_EMPTY\].*edit tool does not allow full-file deletion for files with more than 50 lines/);
    });
  });

  it("shows diff even for very long lines", async () => {
    const longLine = "a".repeat(60_000);
    await withTempFile("sample.txt", `before\n${longLine}\nafter\n`, async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const lRef = computeLineHash(["before", longLine, "after"], 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "sample.txt",
          edits: [
            {
              start: lRef, end: lRef,
              lines: [`b${longLine.slice(1)}`],
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      // Diff always shown; no byte-budget omission
      expect(text).toContain("-2   │");
      expect(text).toContain("+2#");
      expect(text).not.toContain("Anchors omitted");
    });
  });
});
