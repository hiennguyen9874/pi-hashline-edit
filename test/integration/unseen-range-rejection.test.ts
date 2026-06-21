import { describe, expect, it, beforeEach } from "vitest";
import { readFile } from "fs/promises";
import registerCore from "../../extensions/core";
import registerInsert from "../../extensions/insert";
import { computeLineHash } from "../../src/hashline";
import { _setReadSnapshotState } from "../../src/read-snapshot";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";

beforeEach(() => {
  _setReadSnapshotState(undefined);
});

describe("unseen-range rejection", () => {
  it("rejects an edit anchored outside the latest read window", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\ngamma\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await readTool.execute("r1", { path: "sample.txt", offset: 1, limit: 1 }, undefined, undefined, ctx);
      const betaAnchor = computeLineHash(["alpha", "beta", "gamma"], 1);

      await expect(
        editTool.execute(
          "e1",
          { path: "sample.txt", edits: [{ start: betaAnchor, end: betaAnchor, lines: ["BETA"] }] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow(/E_UNSEEN_LINES.*2/);

      expect(await readFile(path, "utf-8")).toBe("alpha\nbeta\ngamma\n");
    });
  });

  it("allows an edit anchored inside the latest read window", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await readTool.execute("r1", { path: "sample.txt", offset: 1, limit: 1 }, undefined, undefined, ctx);
      const alphaAnchor = computeLineHash(["alpha", "beta"], 0);

      await editTool.execute(
        "e1",
        { path: "sample.txt", edits: [{ start: alphaAnchor, end: alphaAnchor, lines: ["ALPHA"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("ALPHA\nbeta\n");
    });
  });

  it("does not apply unseen-line rejection after a raw read", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await readTool.execute("r1", { path: "sample.txt", raw: true, offset: 1, limit: 1 }, undefined, undefined, ctx);
      const betaAnchor = computeLineHash(["alpha", "beta"], 1);

      await editTool.execute(
        "e1",
        { path: "sample.txt", edits: [{ start: betaAnchor, end: betaAnchor, lines: ["BETA"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("alpha\nBETA\n");
    });
  });

  it("rejects an insert anchored outside the latest read window", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await readTool.execute("r1", { path: "sample.txt", offset: 1, limit: 1 }, undefined, undefined, ctx);
      const betaAnchor = computeLineHash(["alpha", "beta"], 1);

      await expect(
        insertTool.execute(
          "i1",
          { path: "sample.txt", edits: [{ anchor: betaAnchor, direction: "after", lines: ["gamma"] }] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow(/E_UNSEEN_LINES.*2/);

      expect(await readFile(path, "utf-8")).toBe("alpha\nbeta\n");
    });
  });
});
