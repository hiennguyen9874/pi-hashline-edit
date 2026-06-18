import { describe, expect, it } from "vitest";
import {
  consumeDoomLoopWarning,
  createDoomLoopState,
  formatDoomLoopMessage,
  recordToolCall,
} from "../../src/doom-loop";

describe("doom-loop", () => {
  it("warns on the third identical call", () => {
    const state = createDoomLoopState();
    recordToolCall(state, "read", "1", { path: "a.ts" });
    recordToolCall(state, "read", "2", { path: "a.ts" });
    recordToolCall(state, "read", "3", { path: "a.ts" });
    const warning = consumeDoomLoopWarning(state, "3");
    expect(warning?.kind).toBe("identical-tail");
    expect(formatDoomLoopMessage(warning!)).toContain("REPEATED-CALL WARNING");
  });

  it("warns on a repeated two-step cycle", () => {
    const state = createDoomLoopState();
    for (const [id, toolName] of [["1", "read"], ["2", "edit"], ["3", "read"], ["4", "edit"], ["5", "read"], ["6", "edit"]] as const) {
      recordToolCall(state, toolName, id, { path: "a.ts" });
    }
    const warning = consumeDoomLoopWarning(state, "6");
    expect(warning?.kind).toBe("repeated-subsequence");
    expect(formatDoomLoopMessage(warning!)).toContain("ALTERNATING-CALL WARNING");
  });
});
