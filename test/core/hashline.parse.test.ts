import { beforeAll, describe, expect, it } from "vitest";
import { hashlineParseText, computeLineHash, resolveEditAnchors } from "../../src/hashline";
import { ensureHasherReady } from "../../src/hash-format";

beforeAll(async () => {
  await ensureHasherReady();
});

describe("hashlineParseText", () => {
  it("returns [] for null", () => {
    expect(hashlineParseText(null)).toEqual([]);
  });

  it("splits string on newline", () => {
    expect(hashlineParseText("a\nb")).toEqual(["a", "b"]);
  });

  it("removes trailing blank line from string input", () => {
    expect(hashlineParseText("a\nb\n")).toEqual(["a", "b"]);
  });

  it("preserves a trailing whitespace-only content line in string input", () => {
    expect(hashlineParseText("a\nb\n  ")).toEqual(["a", "b", "  "]);
  });

  it("passes through array input verbatim", () => {
    const input = ["a", "b"];
    expect(hashlineParseText(input)).toEqual(["a", "b"]);
  });

  it("preserves '# Note:' comment lines (no autocorrection)", () => {
    expect(hashlineParseText(["# Note: important"])).toEqual(["# Note: important"]);
  });

  it("preserves literal '+' prefixed content (no autocorrection)", () => {
    expect(hashlineParseText(["+added"])).toEqual(["+added"]);
  });

  it("returns empty string as a single empty line for blank content", () => {
    expect(hashlineParseText("")).toEqual([""]);
  });

  it("rejects array input that contains HASH display prefixes", () => {
    expect(() => hashlineParseText(["aB3│foo", "xY7│bar"])).toThrow(/^\[E_BARE_HASH_PREFIX\]/);
  });

  it("rejects diff-preview hunks with + and hash prefixes", () => {
    expect(() =>
      hashlineParseText(["aB3│keep", "+xY7│new", "qR2│after"]),
    ).toThrow(/^\[E_BARE_HASH_PREFIX\]/);
  });

  it("rejects diff-preview deletion rows", () => {
    expect(() =>
      hashlineParseText(["aB3│keep", "-10    old", "qR2│after"]),
    ).toThrow(/^\[E_BARE_HASH_PREFIX\]/);
  });

  it("rejects string-form rendered diff hunks", () => {
    const input = "aB3│keep\n-10    old\n+xY7│new\nqR2│after";
    expect(() => hashlineParseText(input)).toThrow(/^\[E_BARE_HASH_PREFIX\]/);
  });
});

describe("hash-only anchor parsing", () => {
  it("rejects line-qualified anchors in mutating requests", () => {
    expect(() => resolveEditAnchors([
      { op: "replace", pos: "1#abc", end: "1#abc", lines: ["x"] },
    ])).toThrow(/E_BAD_REF|hash alone|no line numbers|line numbers are display-only/);
  });

  it("rejects copied display lines", () => {
    expect(() => resolveEditAnchors([
      { op: "replace", pos: "aB3│content", lines: ["x"] },
    ])).toThrow(/Copy only the 3-character hash before/);
  });
});
