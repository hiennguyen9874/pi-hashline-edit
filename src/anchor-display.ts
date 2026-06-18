export const ANCHOR_SEP = "#";
export const CONTENT_SEP = "│";
export type AnchorDisplayMode = "hash" | "line-hash";

export function getAnchorDisplayMode(): AnchorDisplayMode {
  return process.env.PI_HASHLINE_ANCHOR_DISPLAY === "hash" ? "hash" : "line-hash";
}

export function formatAnchorPrefix(input: { line: number; hash: string; lineNumberWidth?: number }): string {
  if (getAnchorDisplayMode() === "line-hash") {
    const line = input.lineNumberWidth ? String(input.line).padStart(input.lineNumberWidth, " ") : String(input.line);
    return `${line}${ANCHOR_SEP}${input.hash}${CONTENT_SEP}`;
  }
  return `${input.hash}${CONTENT_SEP}`;
}
