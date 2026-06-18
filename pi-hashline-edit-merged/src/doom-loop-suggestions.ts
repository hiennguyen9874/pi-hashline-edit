export const SUGGESTIONS: Record<string, readonly string[]> = {
  read: ["if file is large, try offset + limit", "if editing next, copy the 3-character hash before │"],
  edit: ["if hash mismatch keeps firing, re-read the file", "verify the anchor came from the latest read or grep", "use insert for pure additions"],
  insert: ["verify the anchor came from the latest read or grep", "use direction before or after", "do not include HASH│ prefixes in lines"],
  grep: ["try literal: true if the pattern has regex characters", "try a narrower path or glob"],
  undo: ["verify the target file has not diverged before undoing"],
};

export const GENERIC_SUGGESTION = "try a different approach; the repeating call is not making progress";
