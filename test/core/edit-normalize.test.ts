import { describe, expect, it } from "vitest";
import { normalizeEditRequest } from "../../src/edit-normalize";

describe("normalizeEditRequest", () => {
  it("returns native edits unchanged after shallow record validation", () => {
    const input = {
      path: "sample.txt",
      edits: [{ start: "abc", lines: ["next"] }],
    };

    expect(normalizeEditRequest(input)).toEqual({
      path: "sample.txt",
      edits: input.edits,
      warnings: [],
    });
  });

  it("rejects native edit entries that are not records", () => {
    expect(() => normalizeEditRequest({
      path: "sample.txt",
      edits: ["not-an-edit"],
    })).toThrow(/entries must be objects/);
  });
});
