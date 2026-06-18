import { describe, expect, it } from "vitest";
import registerCore from "../../extensions/core";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";

function extractRef(text: string, content: string): string {
  const line = text.split("\n").find((l: string) => l.includes(`│${content}`))!;
  return line.split("│")[0]!.replace(/^[+\- ]/, "").trim().replace(/^\d+#/, "");
}

describe("chained edit anchors", () => {
  it("returns updated anchors in edit result for a single-line replace", async () => {
    await withTempFile("sample.ts", "alpha\nbeta\ngamma\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "sample.ts" }, undefined, undefined, ctx);
      const betaRef = extractRef(firstRead.content[0].text, "beta");

      const editResult = await editTool.execute(
        "e1",
        { path: "sample.ts", edits: [{ start: betaRef, end: betaRef, lines: ["BETA"] }] },
        undefined,
        undefined,
        ctx,
      );

      // Details diff shows the change with new anchor.
      expect(editResult.content[0].text).not.toContain("+2#");
      expect(editResult.details?.diff).toContain("+2#");
      expect(editResult.details?.diff).toContain("│BETA");

      // Extract fresh anchor from details diff and chain another edit.
      const freshRef = extractRef(editResult.details?.diff ?? "", "BETA");

      const editResult2 = await editTool.execute(
        "e2",
        { path: "sample.ts", edits: [{ start: freshRef, end: freshRef, lines: ["BETA-CHAINED"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(editResult2.details?.diff).toContain("+2#");
      expect(editResult2.details?.diff).toContain("│BETA-CHAINED");
    });
  });

  it("shows full diff even for large changes", async () => {
    const fifteenLines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join("\n");
    await withTempFile("big.ts", fifteenLines, async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "big.ts" }, undefined, undefined, ctx);
      const line1Ref = extractRef(firstRead.content[0].text, "line 1");
      const line15Ref = extractRef(firstRead.content[0].text, "line 15");

      const newLines = Array.from({ length: 15 }, (_, i) => `NEW ${i + 1}`);
      const editResult = await editTool.execute(
        "e1",
        { path: "big.ts", edits: [{ start: line1Ref, end: line15Ref, lines: newLines }] },
        undefined,
        undefined,
        ctx,
      );

      expect(editResult.content[0].text).not.toMatch(/\+\s*1#/);
      expect(editResult.details?.diff).toMatch(/\+\s*1#/);
      expect(editResult.details?.diff).not.toContain("Anchors omitted");
    });
  });

  it("returns diff for append operation", async () => {
    await withTempFile("app.ts", "existing\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "app.ts" }, undefined, undefined, ctx);
      const existingRef = extractRef(firstRead.content[0].text, "existing");

      const editResult = await editTool.execute(
        "e1",
        { path: "app.ts", edits: [{ start: existingRef, end: existingRef, lines: ["existing", "appended"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(editResult.details?.diff).toContain("+2#");
      expect(editResult.details?.diff).toContain("│appended");
    });
  });

  it("returns diff for prepend at BOF", async () => {
    await withTempFile("pre.ts", "existing\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "pre.ts" }, undefined, undefined, ctx);
      const existingRef = extractRef(firstRead.content[0].text, "existing");

      const editResult = await editTool.execute(
        "e1",
        { path: "pre.ts", edits: [{ start: existingRef, end: existingRef, lines: ["prepended", "existing"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(editResult.details?.diff).toContain("+1#");
      expect(editResult.details?.diff).toContain("│prepended");
    });
  });

  it("does not leak terminal-newline sentinel in diff for append on newline-terminated file", async () => {
    await withTempFile("sentinel.ts", "existing\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "sentinel.ts" }, undefined, undefined, ctx);
      const existingRef = extractRef(firstRead.content[0].text, "existing");

      const editResult = await editTool.execute(
        "e1",
        { path: "sentinel.ts", edits: [{ start: existingRef, end: existingRef, lines: ["existing", "appended"] }] },
        undefined,
        undefined,
        ctx,
      );

      // No empty hashline anchors like "3#09:" should appear
      const anchorLines = (editResult.details?.diff ?? "")
        .split("\n")
        .filter((line: string) => line.match(/^[+\- ]\s*\d+#\w{3}│.*/));
      for (const line of anchorLines) {
        expect(line).not.toMatch(/^\s*\d+#\w{3}│$/);
      }
    });
  });

  it("shows diff when single-line replace expands", async () => {
    await withTempFile("expand.ts", "before\ntarget\nafter\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "expand.ts" }, undefined, undefined, ctx);
      const targetRef = extractRef(firstRead.content[0].text, "target");

      const newLines = Array.from({ length: 11 }, (_, i) => `EXPANDED ${i + 1}`);
      const editResult = await editTool.execute(
        "e1",
        { path: "expand.ts", edits: [{ start: targetRef, end: targetRef, lines: newLines }] },
        undefined,
        undefined,
        ctx,
      );

      expect(editResult.content[0].text).not.toMatch(/\+\s*2#/);
      expect(editResult.details?.diff).toMatch(/\+\s*2#/);
      expect(editResult.details?.diff).not.toContain("Anchors omitted");
    });
  });

  it("distant unchanged line anchors remain valid after chained edits", async () => {
    // Perfect per-file anchors keep distant unchanged lines addressable after edits.
    await withTempFile("stale.ts", "a\nb\nc\nd\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readTool = getTool("read");
      const editTool = getTool("edit");

      const firstRead = await readTool.execute("r1", { path: "stale.ts" }, undefined, undefined, ctx);
      const dRef = extractRef(firstRead.content[0].text, "d");
      const aRef = extractRef(firstRead.content[0].text, "a");

      await editTool.execute(
        "e1",
        { path: "stale.ts", edits: [{ start: dRef, end: dRef, lines: ["D"] }] },
        undefined,
        undefined,
        ctx,
      );

      // Old dRef is stale because line 4 content changed
      await expect(
        editTool.execute(
          "e2-stale",
          { path: "stale.ts", edits: [{ start: dRef, end: dRef, lines: ["D-AGAIN"] }] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow(/stale anchor/);

      // Distant line 1 anchor is still valid (neighbors unchanged)
      const aEdit = await editTool.execute(
        "e3",
        { path: "stale.ts", edits: [{ start: aRef, end: aRef, lines: ["A"] }] },
        undefined,
        undefined,
        ctx,
      );
      expect(aEdit.details?.diff).toContain("+1#");
      expect(aEdit.details?.diff).toContain("│A");
    });
  });
});
