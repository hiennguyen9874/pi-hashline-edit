import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import registerCore from "../../extensions/core";
import { computeLineHash } from "../../src/hashline";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";

function getText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("edit tool text shape (token budget)", () => {
  it("returns compact LLM-visible text with diff and line counts in details", async () => {
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
      expect(text).toContain("Applied changes to sample.ts");
      expect(text).toContain("Classification: applied");
      expect(text).not.toContain(" 1#");
      expect(text).not.toContain("+2#");
      expect(text).toContain("Fresh anchors for follow-up edits:");
      expect(text).toContain("│BBB");
      expect(result.details?.diff).toContain("+2");
      expect(result.details?.diff).toContain("│BBB");
      expect(result.details?.metrics).toMatchObject({
        added_lines: 1,
        removed_lines: 1,
      });
    });
  });

  it("details diff format uses aligned separators", async () => {
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

      const diff = result.details?.diff ?? "";
      expect(diff).toMatch(/^ 1#\w{3}│aaa$/m);
      expect(diff).toMatch(/^\+2#\w{3}│BBB$/m);
      expect(diff).toMatch(/^-2   │bbb$/m);
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

  it("allows full-file deletion for small files (≤50 lines) and stores diff in details", async () => {
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

      expect(getText(result)).not.toContain("-1   │only");
      expect(result.details?.diff).toContain("-1   │only");
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

  it("normalizes legacy oldText/newText only when oldText is exact and unique", async () => {
    const previous = process.env.PI_HASHLINE_EDIT_COMPAT;
    process.env.PI_HASHLINE_EDIT_COMPAT = "1";
    try {
      await withTempFile("sample.ts", "alpha\nbeta\n", async ({ cwd, path }) => {
        const { pi, getTool } = makeFakePiRegistry();
        registerCore(pi);
        const editTool = getTool("edit");

        const result = await editTool.execute(
          "e1",
          { path: "sample.ts", oldText: "beta", newText: "BETA" } as any,
          undefined,
          undefined,
          { cwd } as any,
        );

        expect(result.isError).not.toBe(true);
        expect(result.content[0].text).toContain("[W_LEGACY_NORMALIZED]");
        expect(await readFile(path, "utf-8")).toBe("alpha\nBETA\n");
      });
    } finally {
      if (previous === undefined) {
        delete process.env.PI_HASHLINE_EDIT_COMPAT;
      } else {
        process.env.PI_HASHLINE_EDIT_COMPAT = previous;
      }
    }
  });

  it("rejects non-unique legacy oldText when compatibility is enabled", async () => {
    const previous = process.env.PI_HASHLINE_EDIT_COMPAT;
    process.env.PI_HASHLINE_EDIT_COMPAT = "1";
    try {
      await withTempFile("sample.ts", "beta\nbeta\n", async ({ cwd }) => {
        const { pi, getTool } = makeFakePiRegistry();
        registerCore(pi);
        const editTool = getTool("edit");

        await expect(
          editTool.execute(
            "e1",
            { path: "sample.ts", oldText: "beta", newText: "BETA" } as any,
            undefined,
            undefined,
            { cwd } as any,
          ),
        ).rejects.toThrow(/E_LEGACY_NON_UNIQUE/);
      });
    } finally {
      if (previous === undefined) {
        delete process.env.PI_HASHLINE_EDIT_COMPAT;
      } else {
        process.env.PI_HASHLINE_EDIT_COMPAT = previous;
      }
    }
  });

  it("caps model-visible fresh anchors for large replacements", async () => {
    const originalLines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
    const replacementLines = Array.from({ length: 20 }, (_, index) => `LINE ${index + 1}`);
    await withTempFile("large.txt", `${originalLines.join("\n")}\n`, async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const editTool = getTool("edit");
      const firstRef = computeLineHash(originalLines, 0);
      const lastRef = computeLineHash(originalLines, originalLines.length - 1);

      const result = await editTool.execute(
        "e1",
        {
          path: "large.txt",
          edits: [
            {
              start: firstRef, end: lastRef,
              lines: replacementLines,
            },
          ],
        },
        undefined,
        undefined,
        { cwd } as any,
      );

      const text = getText(result);
      const freshAnchorLines = text
        .split("\n")
        .filter((line) => /^[A-Za-z0-9_-]{3}│/.test(line));
      expect(freshAnchorLines).toHaveLength(12);
      expect(text).toContain("│LINE 1");
      expect(text).toContain("│LINE 12");
      expect(text).not.toContain("│LINE 13");
      expect(result.details?.diff).toContain("│LINE 20");
    });
  });

  it("stores diff in details even for very long lines", async () => {
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
      const diff = result.details?.diff ?? "";
      expect(text).not.toContain("-2   │");
      expect(diff).toContain("-2   │");
      expect(diff).toContain("+2#");
      expect(diff).not.toContain("Anchors omitted");
    });
  });
});
