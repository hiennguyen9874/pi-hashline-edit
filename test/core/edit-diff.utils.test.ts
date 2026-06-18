import { beforeAll, describe, expect, it } from "vitest";
import { detectLineEnding, generateDiffString, normalizeToLF, stripBom } from "../../src/edit-diff";
import { ensureHasherReady } from "../../src/hash-format";
import { buildHashlineFile } from "../../src/hashline";

beforeAll(async () => {
  await ensureHasherReady();
});

// ─── detectLineEnding ───────────────────────────────────────────────────

describe("detectLineEnding", () => {
  it("detects CRLF when \\r\\n appears first", () => {
    expect(detectLineEnding("hello\r\nworld")).toBe("\r\n");
  });

  it("defaults to LF when only \\n is present", () => {
    expect(detectLineEnding("hello\nworld")).toBe("\n");
  });

  it("detects CRLF when both exist but CRLF comes first", () => {
    expect(detectLineEnding("line1\r\nline2\nline3")).toBe("\r\n");
  });

  it("defaults to LF when no line endings exist", () => {
    expect(detectLineEnding("hello world")).toBe("\n");
  });

  it("defaults to LF for empty string", () => {
    expect(detectLineEnding("")).toBe("\n");
  });
});

// ─── normalizeToLF ──────────────────────────────────────────────────────

describe("normalizeToLF", () => {
  it("converts \\r\\n to \\n", () => {
    expect(normalizeToLF("hello\r\nworld")).toBe("hello\nworld");
  });

  it("converts bare \\r to \\n", () => {
    expect(normalizeToLF("hello\rworld")).toBe("hello\nworld");
  });

  it("leaves already-LF text unchanged", () => {
    expect(normalizeToLF("hello\nworld")).toBe("hello\nworld");
  });

  it("handles mixed line endings", () => {
    expect(normalizeToLF("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeToLF("")).toBe("");
  });
});

// ─── stripBom ───────────────────────────────────────────────────────────

// ─── generateDiffString ─────────────────────────────────────────────────

describe("generateDiffString", () => {
  it("uses collision-resolved per-file hashes for repeated added lines", () => {
    const newContent = "same\nsame\n";
    const { diff } = generateDiffString("same\n", newContent);
    const newFile = buildHashlineFile(newContent);

    expect(newFile.lineHashes[0]).not.toBe(newFile.lineHashes[1]);
    expect(diff).toContain(` 1#${newFile.lineHashes[0]}│same`);
    expect(diff).toContain(`+2#${newFile.lineHashes[1]}│same`);
  });
});

// ─── stripBom ───────────────────────────────────────────────────────────

describe("stripBom", () => {
  it("strips \\uFEFF prefix", () => {
    const result = stripBom("\uFEFFhello");
    expect(result).toEqual({ bom: "\uFEFF", text: "hello" });
  });

  it("returns empty bom when no BOM present", () => {
    const result = stripBom("hello");
    expect(result).toEqual({ bom: "", text: "hello" });
  });

  it("handles empty string with BOM only", () => {
    const result = stripBom("\uFEFF");
    expect(result).toEqual({ bom: "\uFEFF", text: "" });
  });

  it("handles plain empty string", () => {
    const result = stripBom("");
    expect(result).toEqual({ bom: "", text: "" });
  });
});
