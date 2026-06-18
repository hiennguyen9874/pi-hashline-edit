import { describe, expect, it } from "vitest";
import { threeWayMerge } from "../../src/merge";

describe("threeWayMerge", () => {
  it("returns baseEdited when base equals current", () => {
    const result = threeWayMerge("a\nb\nc\n", "a\nB\nc\n", "a\nb\nc\n");
    expect(result).toBe("a\nB\nc\n");
  });

  it("applies patch to current when current diverged", () => {
    const base = "alpha\nbeta\ngamma\n";
    const baseEdited = "alpha\nBETA\ngamma\n";
    const current = "alpha\nbeta\ngamma\ndelta\n";
    const result = threeWayMerge(base, baseEdited, current);
    expect(result).toBe("alpha\nBETA\ngamma\ndelta\n");
  });

  it("returns null when patch does not apply cleanly", () => {
    const base = "a\nb\nc\n";
    const baseEdited = "a\nB\nc\n";
    const current = "x\ny\nz\n";
    const result = threeWayMerge(base, baseEdited, current);
    expect(result).toBeNull();
  });

  it("returns baseEdited even when it equals base (no net change)", () => {
    const base = "a\nb\nc\n";
    const baseEdited = "a\nb\nc\n";
    const current = "a\nb\nc\n";
    const result = threeWayMerge(base, baseEdited, current);
    expect(result).toBe("a\nb\nc\n");
  });

  it("handles independent hunks with enough context", () => {
    // Change on line 2; external change on line 6 is outside the 3-line context
    const base = "line1\nline2\nline3\nline4\nline5\nline6\n";
    const baseEdited = "line1\nLINE2\nline3\nline4\nline5\nline6\n";
    const current = "line1\nline2\nline3\nline4\nline5\nLINE6\n";
    const result = threeWayMerge(base, baseEdited, current);
    expect(result).toBe("line1\nLINE2\nline3\nline4\nline5\nLINE6\n");
  });
});
