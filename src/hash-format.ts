import xxhash from "xxhash-wasm";

export const HASH_LENGTH = 3;
export const HASH_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const HASH_ALPHABET_REGEX_SAFE = HASH_ALPHABET.replace(/-/g, "\\-");
export const HASH_RE = new RegExp(`^[${HASH_ALPHABET_REGEX_SAFE}]{${HASH_LENGTH}}$`);
export const HASH_CHARS_CLASS = `[${HASH_ALPHABET_REGEX_SAFE}]{${HASH_LENGTH}}`;

const HASH_ALPHABET_BITS = 6;
const HASH_ALPHABET_MASK = (1 << HASH_ALPHABET_BITS) - 1;

type Hasher = { h32(input: string, seed?: number): number };
let hasherSync: Hasher | null = null;
const hasherPromise = xxhash().then((hasher) => {
  hasherSync = hasher;
  return hasher;
});

export function ensureHasherReady(): Promise<Hasher> {
  return hasherPromise;
}

function getHasher(): Hasher {
  if (!hasherSync) {
    throw new Error("xxhash-wasm not initialized yet. Call ensureHasherReady() before hashing.");
  }
  return hasherSync;
}

function hashToString(value: number): string {
  const totalBits = HASH_LENGTH * HASH_ALPHABET_BITS;
  const shift = 32 - totalBits;
  const n = value >>> shift;
  let out = "";
  for (let index = 0; index < HASH_LENGTH; index++) {
    out += HASH_ALPHABET[(n >>> ((HASH_LENGTH - 1 - index) * HASH_ALPHABET_BITS)) & HASH_ALPHABET_MASK]!;
  }
  return out;
}

export function canonicalizeLine(line: string): string {
  return line.replace(/\r/g, "").trimEnd();
}

function splitVisibleLines(content: string): string[] {
  if (content.length === 0) return [];
  const parts = content.split("\n");
  return content.endsWith("\n") ? parts.slice(0, -1) : parts;
}

export function computeLineHash(line: string, retry = 0): string {
  const canonical = canonicalizeLine(line);
  const input = retry === 0 ? canonical : `${canonical}:R${retry}`;
  return hashToString(getHasher().h32(input, 0) >>> 0);
}

function contextInput(prev: string, curr: string, next: string, retry: number): string {
  const base = `${prev}\0${curr}\0${next}`;
  return retry === 0 ? base : `${base}\0R${retry}`;
}

export function computeLineHashFromContext(
  prev: string,
  curr: string,
  next: string,
  retry = 0,
): string {
  return hashToString(getHasher().h32(
    contextInput(
      canonicalizeLine(prev),
      canonicalizeLine(curr),
      canonicalizeLine(next),
      retry,
    ),
    0,
  ) >>> 0);
}

export function computeLineHashes(content: string): string[] {
  const lines = splitVisibleLines(content);
  const assigned = new Set<string>();
  return lines.map((line, index) => {
    const prev = lines[index - 1] ?? "";
    const next = lines[index + 1] ?? "";
    let retry = 0;
    let hash = computeLineHashFromContext(prev, line, next, retry);
    while (assigned.has(hash)) {
      retry += 1;
      hash = computeLineHashFromContext(prev, line, next, retry);
    }
    assigned.add(hash);
    return hash;
  });
}
