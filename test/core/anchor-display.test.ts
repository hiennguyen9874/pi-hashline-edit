import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_SEP, formatAnchorPrefix, getAnchorDisplayMode } from "../../src/anchor-display";

describe("anchor-display", () => {
  const original = process.env.PI_HASHLINE_ANCHOR_DISPLAY;

  afterEach(() => {
    if (original === undefined) delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    else process.env.PI_HASHLINE_ANCHOR_DISPLAY = original;
  });

  it("defaults to line-hash display", () => {
    delete process.env.PI_HASHLINE_ANCHOR_DISPLAY;
    expect(getAnchorDisplayMode()).toBe("line-hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`42#aB3${CONTENT_SEP}`);
  });

  it("supports hash-only display through env", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "hash";
    expect(getAnchorDisplayMode()).toBe("hash");
    expect(formatAnchorPrefix({ line: 42, hash: "aB3" })).toBe(`aB3${CONTENT_SEP}`);
  });

  it("treats unknown env values as line-hash", () => {
    process.env.PI_HASHLINE_ANCHOR_DISPLAY = "verbose";
    expect(getAnchorDisplayMode()).toBe("line-hash");
  });
});
