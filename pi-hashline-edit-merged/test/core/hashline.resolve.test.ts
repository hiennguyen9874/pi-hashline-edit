import { describe, expect, it } from "vitest";
import { resolveEditAnchors, type Anchor } from "../../src/hashline";

describe("resolveEditAnchors", () => {
  it("resolves replace with pos + end", () => {
    const edits = [
      { op: "replace" as const, pos: "1#AB", end: "3#EF", lines: ["a", "b"] },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].op).toBe("replace");
    expect(resolved[0]).toHaveProperty("pos");
    expect(resolved[0]).toHaveProperty("end");
  });

  it("resolves replace with pos only (single-line)", () => {
    const edits = [
      { op: "replace" as const, pos: "5#CD", lines: ["new"] },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].op).toBe("replace");
    const r = resolved[0] as {
      op: "replace";
      pos: Anchor;
      end?: Anchor;
      lines: string[];
    };
    expect(r.pos.line).toBe(5);
    expect(r.end).toBeUndefined();
  });

  it("throws on malformed pos for replace", () => {
    const edits = [
      { op: "replace" as const, pos: "not-valid", lines: ["x"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/Invalid line reference/);
  });

  it("throws on malformed end for replace with valid pos", () => {
    const edits = [
      { op: "replace" as const, pos: "5#CD", end: "garbage", lines: ["x"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/Invalid line reference/);
  });

  it("parses string lines input", () => {
    const edits = [
      { op: "replace" as const, pos: "1#AB", lines: "hello\nworld\n" },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved[0].lines).toEqual(["hello", "world"]);
  });

  it("parses null lines as empty array", () => {
    const edits = [
      { op: "replace" as const, pos: "1#AB", lines: null },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved[0].lines).toEqual([]);
  });

  it("rejects display prefixes in lines through hashlineParseText", () => {
    const edits = [
      { op: "replace" as const, pos: "1#AB", lines: ["1#AB│content"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/^\[E_INVALID_PATCH\]/);
  });
});
