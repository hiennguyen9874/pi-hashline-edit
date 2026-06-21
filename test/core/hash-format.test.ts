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

  it("uses neighboring lines in the per-file hash", () => {
    const first = computeLineHashes("alpha\ntarget\ngamma")[1]!;
    const second = computeLineHashes("alpha\ntarget\ndelta")[1]!;
    expect(second).not.toBe(first);
  });

  it("assigns different anchors to identical content occurrences", () => {
    const hashes = computeLineHashes("x\n}\ny\nx\n}\ny");
    expect(hashes).toHaveLength(6);
    expect(new Set(hashes).size).toBe(6);
  });

  it("does not create a synthetic hash for terminal newline", () => {
    expect(computeLineHashes("alpha\nbeta\n")).toHaveLength(2);
    expect(computeLineHashes("")).toEqual([]);
  });

  it("keeps far-away hashes stable when a neighbor changes", async () => {
    await ensureHasherReady();
    const first = computeLineHashes("one\ntwo\nthree\nfour\nfive");
    const second = computeLineHashes("one\nTWO\nthree\nfour\nfive");
    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[2]).not.toBe(first[2]);
    expect(second[3]).toBe(first[3]);
    expect(second[4]).toBe(first[4]);
  });
});
