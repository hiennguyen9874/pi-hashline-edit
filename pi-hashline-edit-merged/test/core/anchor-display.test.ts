import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_SEP, formatAnchorPrefix, getAnchorDisplayMode } from "../../src/anchor-display";

describe("anchor-display", () => {
  const original = process.env.PI_HASHLINE_ANCHOR_DISPLAY;

  afterEach(() => {
    if (original === undefined) delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    else process.env.PI_HASHLINE_ANCHOR_DISPLAY = original;
  });

  it("defaults to hash-only display", () => {
    delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    expect(getAnchorDisplayMode()).toBe("hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`aB3${CONTENT_SEP}`);
  });

  it("supports line-hash display through env", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "line-hash";
    expect(getAnchorDisplayMode()).toBe("line-hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`42#aB3${CONTENT_SEP}`);
  });

  it("treats unknown env values as hash-only", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "verbose";
    expect(getAnchorDisplayMode()).toBe("hash");
  });
});
