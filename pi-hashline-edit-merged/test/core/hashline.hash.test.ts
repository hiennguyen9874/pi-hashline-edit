import { beforeAll, describe, expect, it } from "vitest";
import {
  applySpans,
  buildHashlineFile,
  computeHashFromContext,
  computeLineHash,
  formatHashlineRegion,
  formatMismatchError,
  hashlineParseText,
  normalizeLine,
  resolveEditSpans,
  validateAnchors,
  type HashlineEdit,
} from "../../src/hashline";
import { partitionExact } from "../../src/fuzzy-match";
import { ensureHasherReady } from "../../src/hash-format";

beforeAll(async () => {
  await ensureHasherReady();
});

function applyHashlineEdits(content: string, edits: HashlineEdit[], signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("AbortError");
  const file = buildHashlineFile(content);
  const struct = validateAnchors(file, edits);
  if (!struct.ok) throw new Error(struct.message);
  const exact = partitionExact(edits, file);
  if (exact.unmatched.length > 0) {
    const mismatches = exact.unmatched.flatMap((edit) => {
      const refs = edit.end ? [edit.pos, edit.end] : [edit.pos];
      return refs.map((ref) => ({
        line: ref.line ?? 1,
        expected: ref.hash,
        actual: ref.line ? file.lineHashes[ref.line - 1] ?? "OOB" : "OOB",
      }));
    });
    const retryLines = new Set(mismatches.map((m) => m.line));
    throw new Error(formatMismatchError(mismatches, file.lines, retryLines));
  }
  const spanResult = resolveEditSpans(file, exact.matched);
  if (!spanResult.ok) throw new Error(spanResult.message);
  const applied = applySpans(file, spanResult.spans);
  return {
    content: applied.file.content,
    firstChangedLine: applied.firstChangedLine,
    lastChangedLine: applied.lastChangedLine,
    warnings: spanResult.warnings.length ? spanResult.warnings : undefined,
    noopEdits: spanResult.noopEdits.length ? spanResult.noopEdits : undefined,
  };
}

describe("computeLineHash", () => {
  it("returns a 3-character base64url string", () => {
    const hash = computeLineHash(["hello"], 0);
    expect(hash).toHaveLength(3);
    expect(hash).toMatch(/^[A-Za-z0-9_\-]{3}$/);
  });

  it("trims trailing whitespace without collapsing internal spaces", () => {
    expect(computeLineHash(["a\t"], 0)).toBe(computeLineHash(["a"], 0));
    expect(computeLineHash(["a  b"], 0)).not.toBe(computeLineHash(["a b"], 0));
  });

  it("strips trailing CR", () => {
    expect(computeLineHash(["hello\r"], 0)).toBe(computeLineHash(["hello"], 0));
  });

  it("produces same hash for same content", () => {
    const h1 = computeLineHash(["prev", "}", "next"], 1);
    const h2 = computeLineHash(["other", "}", "lines"], 1);
    expect(h1).toBe(h2);
  });
});

describe("hash-only hashline contract", () => {
  it("builds one unique 3-character hash per visible line", () => {
    const file = buildHashlineFile("}\n}\nconst x = 1;\n}");
    expect(file.lineHashes).toHaveLength(4);
    expect(new Set(file.lineHashes).size).toBe(4);
    expect(file.lineHashes.every((hash) => /^[A-Za-z0-9_\-]{3}$/.test(hash))).toBe(true);
  });

  it("formats hash-only anchors by default", () => {
    const text = formatHashlineRegion(["alpha", "beta"], 1, 2);
    expect(text).toMatch(/^[A-Za-z0-9_\-]{3}│alpha\n[A-Za-z0-9_\-]{3}│beta$/);
    expect(text).not.toMatch(/^\s*1#/);
  });

  it("formats duplicate lines with the stored collision-resolved hashes", () => {
    const file = buildHashlineFile("same\nsame\nother\nsame");
    const text = formatHashlineRegion(file.lines, 1, 4);
    const displayedHashes = text.split("\n").map((line) => line.slice(0, 3));

    expect(displayedHashes).toEqual(file.lineHashes);
  });

  it("preserves internal spaces when hashing", () => {
    expect(computeLineHash(["a b"], 0)).not.toBe(computeLineHash(["ab"], 0));
  });

  it("trims trailing spaces when hashing", () => {
    expect(computeLineHash(["value  "], 0)).toBe(computeLineHash(["value"], 0));
  });

  it("preserves explicit blank trailing line in array input", () => {
    expect(hashlineParseText(["alpha", ""])).toEqual(["alpha", ""]);
  });

  it("rejects absent hash anchors instead of guessing", () => {
    const fileLines = ["a", "INSERTED", "b", "target", "c"];
    const content = fileLines.join("\n");
    const stale: HashlineEdit = {
      op: "replace",
      pos: { hash: "abc" },
      lines: ["updated"],
    };

    expect(() => applyHashlineEdits(content, [stale])).toThrow(/stale anchor|E_STALE_ANCHOR/);
  });

  it("computeHashFromContext matches current-line computeLineHash", () => {
    const lines = ["  hello  ", "world", "  foo"];
    const fromFile = computeLineHash(lines, 1);
    const fromContext = computeHashFromContext(
      normalizeLine(lines[0]!),
      normalizeLine(lines[1]!),
      normalizeLine(lines[2]!),
    );
    expect(fromContext).toBe(fromFile);
  });
});
