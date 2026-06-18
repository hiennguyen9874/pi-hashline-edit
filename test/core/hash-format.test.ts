import { describe, expect, it, beforeAll } from "vitest";
import {
  HASH_ALPHABET,
  HASH_LENGTH,
  HASH_RE,
  computeLineHash,
  computeLineHashes,
  ensureHasherReady,
} from "../../src/hash-format";

describe("hash-format", () => {
  beforeAll(async () => {
    await ensureHasherReady();
  });

  it("uses 3-character URL-safe base64 anchors", () => {
    expect(HASH_LENGTH).toBe(3);
    expect(HASH_ALPHABET).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
    const hash = computeLineHash("hello");
    expect(hash).toHaveLength(3);
    expect(hash).toMatch(HASH_RE);
  });

  it("canonicalizes CR and trailing whitespace only", () => {
    expect(computeLineHash("value\r")).toBe(computeLineHash("value"));
    expect(computeLineHash("value   ")).toBe(computeLineHash("value"));
    expect(computeLineHash("a  b")).not.toBe(computeLineHash("a b"));
  });

  it("returns one perfect hash per visible file line", () => {
    const hashes = computeLineHashes("alpha\nbeta\ngamma");
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
    expect(hashes.every((hash) => HASH_RE.test(hash))).toBe(true);
  });

  it("assigns different anchors to identical content occurrences", () => {
    const hashes = computeLineHashes("}\n}\n}");
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
  });

  it("does not create a synthetic hash for terminal newline", () => {
    expect(computeLineHashes("alpha\nbeta\n")).toHaveLength(2);
    expect(computeLineHashes("")).toEqual([]);
  });

  it("hashes deterministically after readiness is awaited", async () => {
    await ensureHasherReady();
    const first = computeLineHashes("same\ncontent\n}");
    const second = computeLineHashes("same\ncontent\n}");
    expect(second).toEqual(first);
  });
});
