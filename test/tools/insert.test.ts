import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import Ajv from "ajv";
import {
  assertInsertRequest,
  insertToolSchema,
} from "../../src/insert";
import registerCore from "../../extensions/core";
import registerInsert from "../../extensions/insert";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";
import { ensureHasherReady } from "../../src/hash-format";

beforeAll(async () => {
  await ensureHasherReady();
});

function bareAnchor(renderedPrefix: string): string {
  return renderedPrefix.includes("#") ? renderedPrefix.split("#").at(-1)! : renderedPrefix;
}

describe("assertInsertRequest", () => {
  it("accepts valid insert", () => {
    expect(() =>
      assertInsertRequest({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "after", lines: ["x"] }],
      }),
    ).not.toThrow();
  });

  it("accepts optional current guard", () => {
    expect(() =>
      assertInsertRequest({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "after", current: "anchor line", lines: ["x"] }],
      }),
    ).not.toThrow();
  });

  it("accepts head and tail without anchors", () => {
    expect(() =>
      assertInsertRequest({
        path: "a.ts",
        edits: [
          { direction: "head", lines: ["x"] },
          { direction: "tail", lines: ["y"] },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects missing path", () => {
    expect(() =>
      assertInsertRequest({ edits: [{ anchor: "abc", direction: "after", lines: ["x"] }] }),
    ).toThrow();
  });

  it("rejects empty edits", () => {
    expect(() =>
      assertInsertRequest({ path: "a.ts", edits: [] }),
    ).toThrow();
  });

  it("rejects empty insert lines", () => {
    expect(() =>
      assertInsertRequest({ path: "a.ts", edits: [{ anchor: "abc", direction: "after", lines: [] }] }),
    ).toThrow('Insert 1 requires non-empty "lines" array of strings.');
  });

  it("rejects non-string current guard", () => {
    expect(() =>
      assertInsertRequest({ path: "a.ts", edits: [{ anchor: "abc", direction: "after", current: 123, lines: ["x"] }] }),
    ).toThrow('Insert 1 optional "current" must be a string.');
  });

  it("rejects anchor with head or tail", () => {
    expect(() =>
      assertInsertRequest({ path: "a.ts", edits: [{ anchor: "abc", direction: "head", lines: ["x"] }] }),
    ).toThrow('Insert 1 must omit "anchor" when direction is "head".');
  });
});

describe("insertToolSchema", () => {
  it("validates insert entry", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "after", lines: ["x"] }],
      }),
    ).toBe(true);
  });

  it("allows schema-level missing anchor so head/tail can omit it", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [{ direction: "head", lines: ["x"] }],
      }),
    ).toBe(true);
  });

  it("rejects invalid direction", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "above", lines: ["x"] }],
      }),
    ).toBe(false);
  });

  it("rejects empty lines", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "after", lines: [] }],
      }),
    ).toBe(false);
  });

  it("accepts optional current", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [{ anchor: "abc", direction: "after", current: "anchor line", lines: ["x"] }],
      }),
    ).toBe(true);
  });

  it("accepts head and tail directions", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(insertToolSchema as any);
    expect(
      validate({
        path: "a.ts",
        edits: [
          { direction: "head", lines: ["x"] },
          { direction: "tail", lines: ["y"] },
        ],
      }),
    ).toBe(true);
  });
});

describe("insert tool execution", () => {
  it("inserts after a line", async () => {
    await withTempFile("sample.txt", "aaa\nccc\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const aaaAnchor = bareAnchor(readResult.content[0].text
        .split("\n")
        .find((line: string) => line.includes("│aaa"))!
        .split("│")[0]!);

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ anchor: aaaAnchor, direction: "after", lines: ["bbb"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("aaa\nbbb\nccc\n");
    });
  });

  it("inserts with matching current guard", async () => {
    await withTempFile("sample.txt", "aaa\nccc\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const aaaAnchor = bareAnchor(readResult.content[0].text
        .split("\n")
        .find((line: string) => line.includes("│aaa"))!
        .split("│")[0]!);

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ anchor: aaaAnchor, direction: "after", current: "aaa", lines: ["bbb"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("aaa\nbbb\nccc\n");
    });
  });

  it("rejects mismatched current guard without mutating", async () => {
    await withTempFile("sample.txt", "aaa\nccc\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const aaaAnchor = bareAnchor(readResult.content[0].text
        .split("\n")
        .find((line: string) => line.includes("│aaa"))!
        .split("│")[0]!);

      await expect(
        insertTool.execute(
          "i1",
          { path: "sample.txt", edits: [{ anchor: aaaAnchor, direction: "after", current: "AAA", lines: ["bbb"] }] },
          undefined, undefined, ctx,
        ),
      ).rejects.toThrow(/E_CURRENT_MISMATCH/);

      expect(await readFile(path, "utf-8")).toBe("aaa\nccc\n");
    });
  });

  it("inserts before a line", async () => {
    await withTempFile("sample.txt", "bbb\nccc\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const bbbAnchor = bareAnchor(readResult.content[0].text
        .split("\n")
        .find((line: string) => line.includes("│bbb"))!
        .split("│")[0]!);

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ anchor: bbbAnchor, direction: "before", lines: ["aaa"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("aaa\nbbb\nccc\n");
    });
  });

  it("inserts at end of file", async () => {
    await withTempFile("sample.txt", "aaa\nbbb\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const readTool = getTool("read");
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const bbbAnchor = bareAnchor(readResult.content[0].text
        .split("\n")
        .find((line: string) => line.includes("│bbb"))!
        .split("│")[0]!);

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ anchor: bbbAnchor, direction: "after", lines: ["ccc"] }] },
        undefined, undefined, ctx,
      );

      const after = await readFile(path, "utf-8");
      expect(after).toContain("bbb");
      expect(after).toContain("ccc");
      expect(after.indexOf("bbb")).toBeLessThan(after.indexOf("ccc"));
    });
  });

  it("rejects empty insert lines without mutating", async () => {
    await withTempFile("sample.txt", "aaa\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await expect(
        insertTool.execute(
          "i1",
          { path: "sample.txt", edits: [{ anchor: "abc", direction: "after", lines: [] }] },
          undefined, undefined, ctx,
        ),
      ).rejects.toThrow('Insert 1 requires non-empty "lines" array of strings.');
      expect(await readFile(path, "utf-8")).toBe("aaa\n");
    });
  });

  it("inserts at head without an anchor", async () => {
    await withTempFile("sample.txt", "bbb\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ direction: "head", lines: ["aaa"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("aaa\nbbb\n");
    });
  });

  it("inserts at tail without an anchor", async () => {
    await withTempFile("sample.txt", "aaa\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await insertTool.execute(
        "i1",
        { path: "sample.txt", edits: [{ direction: "tail", lines: ["bbb"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("aaa\nbbb");
    });
  });

  it("inserts into empty file with tail", async () => {
    await withTempFile("empty.txt", "", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await insertTool.execute(
        "i1",
        { path: "empty.txt", edits: [{ direction: "tail", lines: ["hello"] }] },
        undefined, undefined, ctx,
      );

      expect(await readFile(path, "utf-8")).toBe("hello");
    });
  });

  it("rejects empty file with E_EMPTY_FILE for anchored insert", async () => {
    await withTempFile("empty.txt", "", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerInsert(pi);
      const insertTool = getTool("insert");
      const ctx = { cwd, ui: { notify() {} } } as any;

      await expect(
        insertTool.execute(
          "i1",
          { path: "empty.txt", edits: [{ anchor: "abc", direction: "after", lines: ["hello"] }] },
          undefined, undefined, ctx,
        ),
      ).rejects.toThrow(/E_EMPTY_FILE/);
    });
  });
});
