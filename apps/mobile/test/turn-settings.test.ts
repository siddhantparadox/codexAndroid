import { describe, expect, it } from "vitest";
import { buildThreadStartParams, buildTurnStartParams } from "../src/codex/turn-settings";

describe("turn-settings", () => {
  it("builds read-only defaults for chat mode", () => {
    const params = buildThreadStartParams({
      mode: "chat",
      networkAccess: "on",
      selectedModelId: "gpt-5.2-codex",
      effortLevel: "low",
      reasoningMode: "summary",
      cwd: "/repo"
    });

    expect(params.model).toBe("gpt-5.2-codex");
    expect(params.effort).toBe("low");
    expect(params.summary).toBe("concise");
    expect(params.sandboxPolicy).toEqual({
      type: "readOnly",
      networkAccess: false
    });
  });

  it("builds workspace-write params for agent mode turn start", () => {
    const params = buildTurnStartParams({
      threadId: "thr_123",
      promptText: "Run tests",
      mode: "agent",
      networkAccess: "on",
      selectedModelId: null,
      effortLevel: "high",
      reasoningMode: "raw",
      cwd: "/repo"
    });

    expect(params.threadId).toBe("thr_123");
    expect(params.model).toBe("gpt-5.2-codex");
    expect(params.effort).toBe("high");
    expect(params.summary).toBeUndefined();
    expect(params.sandboxPolicy).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/repo"],
      networkAccess: true
    });
    expect(params.input).toEqual([{ type: "text", text: "Run tests" }]);
  });
});
