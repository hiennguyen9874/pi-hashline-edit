import { beforeAll, describe, expect, it } from "vitest";
import { resolveEditAnchors, type Anchor } from "../../src/hashline";
import { ensureHasherReady } from "../../src/hash-format";

beforeAll(async () => {
  await ensureHasherReady();
});

describe("resolveEditAnchors", () => {
  it("resolves replace with pos + end hashes", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", end: "def", lines: ["a", "b"] },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].op).toBe("replace");
    expect(resolved[0]).toHaveProperty("pos");
    expect(resolved[0]).toHaveProperty("end");
  });

  it("resolves replace with pos only (single-line)", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", lines: ["new"] },
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
    expect(r.pos.hash).toBe("abc");
    expect(r.pos.line).toBeUndefined();
    expect(r.end).toBeUndefined();
  });

  it("throws on malformed pos for replace", () => {
    const edits = [
      { op: "replace" as const, pos: "not-valid", lines: ["x"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/Invalid anchor/);
  });

  it("throws on malformed end for replace with valid pos", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", end: "garbage", lines: ["x"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/Invalid anchor/);
  });

  it("rejects line-qualified anchors", () => {
    const edits = [
      { op: "replace" as const, pos: "1#abc", lines: ["x"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/line numbers are display-only/);
  });

  it("parses string lines input", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", lines: "hello\nworld\n" },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved[0].lines).toEqual(["hello", "world"]);
  });

  it("parses null lines as empty array", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", lines: null },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved[0].lines).toEqual([]);
  });

  it("preserves optional current text", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", current: "before", lines: ["after"] },
    ];
    const resolved = resolveEditAnchors(edits);
    expect(resolved[0].current).toBe("before");
  });

  it("rejects display prefixes in lines through hashlineParseText", () => {
    const edits = [
      { op: "replace" as const, pos: "abc", lines: ["abc│content"] },
    ];
    expect(() => resolveEditAnchors(edits)).toThrow(/^\[E_BARE_HASH_PREFIX\]/);
  });
});
