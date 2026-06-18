import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import Ajv from "ajv";
import {
  assertEditRequest,
  getHashlineEditToolSchema,
  hashlineEditToolSchema,
  legacyHashlineEditToolSchema,
  registerEditTool,
} from "../../src/edit";
import registerCore from "../../extensions/core";
import { ensureHasherReady } from "../../src/hash-format";
import { makeFakePiRegistry, withTempFile } from "../support/fixtures";

beforeAll(async () => {
  await ensureHasherReady();
});

function extractAnchor(text: string, line: string): string {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^([A-Za-z0-9_\\-]{3})│${escaped}$`, "m"));
  if (!match) throw new Error(`No anchor for ${line}`);
  return match[1]!;
}

describe("assertEditRequest", () => {
  it("accepts valid replace edit", () => {
    expect(() =>
      assertEditRequest({
        path: "a.ts",
        edits: [{ start: "abc", end: "abc", lines: ["x"] }],
      }),
    ).not.toThrow();
  });
});

describe("registerEditTool", () => {
  it("publishes a DeepSeek-compatible top-level object schema", () => {
    expect(hashlineEditToolSchema.type).toBe("object");
  });

  it("publishes a schema that validates hash-only payloads", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(hashlineEditToolSchema as any);

    expect(
      validate({
        path: "a.ts",
        edits: [{ start: "abc", end: "abc", lines: ["x"] }],
      }),
    ).toBe(true);
  });

  it("rejects legacy range schema", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(hashlineEditToolSchema as any);

    expect(
      validate({
        path: "a.ts",
        edits: [{ range: ["1#abc", "1#abc"], lines: ["x"] }],
      }),
    ).toBe(false);
  });

  it("rejects legacy oldText/newText payloads by default", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(hashlineEditToolSchema as any);

    expect(
      validate({
        path: "a.ts",
        oldText: "before",
        newText: "after",
      }),
    ).toBe(false);
  });

  it("publishes legacy oldText/newText schema only when enabled", () => {
    const previous = process.env.PI_HASHLINE_EDIT_COMPAT;
    process.env.PI_HASHLINE_EDIT_COMPAT = "1";
    try {
      expect(getHashlineEditToolSchema()).toEqual(legacyHashlineEditToolSchema);

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(getHashlineEditToolSchema() as any);

      expect(
        validate({
          path: "a.ts",
          oldText: "before",
          newText: "after",
        }),
      ).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.PI_HASHLINE_EDIT_COMPAT;
      } else {
        process.env.PI_HASHLINE_EDIT_COMPAT = previous;
      }
    }
  });

  it("registers the edit tool without a prepareArguments shim", () => {
    let registered:
      | {
          parameters?: any;
          prepareArguments?: (args: unknown) => unknown;
        }
      | undefined;
    const pi = {
      registerTool(tool: {
        parameters?: any;
        prepareArguments?: (args: unknown) => unknown;
      }) {
        registered = tool;
      },
    } as any;

    registerEditTool(pi);

    expect(registered?.parameters).toEqual(hashlineEditToolSchema);
    expect(registered?.prepareArguments).toBeUndefined();
  });

  it("rejects legacy oldText/newText through the registered tool path by default", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\ngamma\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerEditTool(pi);
      const editTool = getTool("edit");

      await expect(
        editTool.execute(
          "e1",
          { path: "sample.txt", oldText: "beta", newText: "BETA" },
          undefined,
          undefined,
          { cwd } as any,
        ),
      ).rejects.toThrow(/unknown field "oldText"/);
    });
  });

  it("normalizes legacy oldText/newText through the registered tool path when enabled", async () => {
    const previous = process.env.PI_HASHLINE_EDIT_COMPAT;
    process.env.PI_HASHLINE_EDIT_COMPAT = "1";
    try {
      await withTempFile("sample.txt", "alpha\nbeta\ngamma\n", async ({ cwd, path }) => {
        const { pi, getTool } = makeFakePiRegistry();
        registerEditTool(pi);
        const editTool = getTool("edit");

        const result = await editTool.execute(
          "e1",
          { path: "sample.txt", oldText: "beta", newText: "BETA" },
          undefined,
          undefined,
          { cwd } as any,
        );

        expect(result.isError).not.toBe(true);
        expect(result.content[0].text).toContain("[LEGACY_NORMALIZED]");
        expect(await readFile(path, "utf-8")).toBe("alpha\nBETA\ngamma\n");
      });
    } finally {
      if (previous === undefined) {
        delete process.env.PI_HASHLINE_EDIT_COMPAT;
      } else {
        process.env.PI_HASHLINE_EDIT_COMPAT = previous;
      }
    }
  });

  it("edits a single line using hash-only start/end anchors", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\ngamma\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerEditTool(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;

      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const beta = extractAnchor(readResult.content[0].text, "beta");

      const result = await editTool.execute(
        "e1",
        { path: "sample.txt", edits: [{ start: beta, end: beta, lines: ["BETA"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(result.isError).not.toBe(true);
      expect(await readFile(path, "utf-8")).toBe("alpha\nBETA\ngamma\n");
      expect(result.details?.diff).toContain("│BETA");
    });
  });

  it("rejects line-qualified edit anchors", async () => {
    await withTempFile("sample.txt", "alpha\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerEditTool(pi);
      const editTool = getTool("edit");

      await expect(
        editTool.execute(
          "e1",
          { path: "sample.txt", edits: [{ start: "1#aB3", end: "1#aB3", lines: ["ALPHA"] }] },
          undefined,
          undefined,
          { cwd } as any,
        ),
      ).rejects.toThrow(/E_BAD_REF|line numbers are display-only/);
    });
  });

  it("validates optional current text when supplied", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\n", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerEditTool(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;
      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const anchor = extractAnchor(readResult.content[0].text, "beta");

      await expect(
        editTool.execute(
          "e1",
          { path: "sample.txt", edits: [{ start: anchor, end: anchor, current: "not beta", lines: ["BETA"] }] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow(/E_CURRENT_MISMATCH/);
    });
  });

  it("does not require current for single-line edit", async () => {
    await withTempFile("sample.txt", "alpha\nbeta\n", async ({ cwd, path }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerCore(pi);
      registerEditTool(pi);
      const readTool = getTool("read");
      const editTool = getTool("edit");
      const ctx = { cwd, ui: { notify() {} } } as any;
      const readResult = await readTool.execute("r1", { path: "sample.txt" }, undefined, undefined, ctx);
      const anchor = extractAnchor(readResult.content[0].text, "beta");

      const result = await editTool.execute(
        "e1",
        { path: "sample.txt", edits: [{ start: anchor, end: anchor, lines: ["BETA"] }] },
        undefined,
        undefined,
        ctx,
      );

      expect(result.isError).not.toBe(true);
      expect(await readFile(path, "utf-8")).toBe("alpha\nBETA\n");
    });
  });

  it("rejects edits on empty files with E_EMPTY_FILE", async () => {
    await withTempFile("empty.txt", "", async ({ cwd }) => {
      const { pi, getTool } = makeFakePiRegistry();
      registerEditTool(pi);
      const editTool = getTool("edit");

      await expect(
        editTool.execute(
          "e1",
          { path: "empty.txt", edits: [{ start: "abc", end: "abc", lines: ["hello"] }] },
          undefined,
          undefined,
          { cwd } as any,
        ),
      ).rejects.toThrow(/\[E_EMPTY_FILE\]/);
    });
  });
});
