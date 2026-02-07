import { describe, expect, it } from "vitest";
import {
  applyCodexNotification,
  applyTurnStartResult,
  appendLocalUserPrompt,
  createInitialSessionState,
  setActiveThreadId
} from "../src/codex/session";

describe("session reducer", () => {
  it("appends local user prompts", () => {
    const state = createInitialSessionState();
    const next = appendLocalUserPrompt(state, "Add health endpoint");

    expect(next.transcript).toHaveLength(1);
    expect(next.transcript[0].type).toBe("userMessage");
    expect(next.transcript[0].text).toBe("Add health endpoint");
  });

  it("tracks thread and turn lifecycle", () => {
    let state = createInitialSessionState();
    state = setActiveThreadId(state, "thr_1");
    state = applyCodexNotification(state, "turn/started", {
      turn: { id: "turn_1", status: "inProgress" }
    });

    expect(state.activeThreadId).toBe("thr_1");
    expect(state.activeTurnId).toBe("turn_1");
    expect(state.turnStatus).toBe("inProgress");

    state = applyCodexNotification(state, "turn/completed", {
      turn: { id: "turn_1", status: "completed" }
    });
    expect(state.activeTurnId).toBeNull();
    expect(state.turnStatus).toBe("completed");
  });

  it("applies item started + delta stream for agent message", () => {
    let state = createInitialSessionState();
    state = applyCodexNotification(state, "item/started", {
      item: { id: "item_1", type: "agentMessage", text: "" }
    });
    state = applyCodexNotification(state, "item/agentMessage/delta", {
      itemId: "item_1",
      delta: "Hello"
    });
    state = applyCodexNotification(state, "item/agentMessage/delta", {
      itemId: "item_1",
      delta: " world"
    });

    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe("Hello world");
  });

  it("applies command output deltas", () => {
    let state = createInitialSessionState();
    state = applyCodexNotification(state, "item/started", {
      item: { id: "cmd_1", type: "commandExecution", command: "pnpm test" }
    });
    state = applyCodexNotification(state, "item/commandExecution/outputDelta", {
      itemId: "cmd_1",
      delta: "line1\n"
    });
    state = applyCodexNotification(state, "item/commandExecution/outputDelta", {
      itemId: "cmd_1",
      delta: "line2\n"
    });

    expect(state.transcript[0].title).toContain("Command");
    expect(state.transcript[0].text).toContain("line1");
    expect(state.transcript[0].text).toContain("line2");
  });

  it("accepts turn/start response payload", () => {
    const state = applyTurnStartResult(createInitialSessionState(), {
      turn: {
        id: "turn_abc",
        items: [{ id: "agent_1", type: "agentMessage", text: "Starting..." }]
      }
    });

    expect(state.activeTurnId).toBe("turn_abc");
    expect(state.turnStatus).toBe("inProgress");
    expect(state.transcript[0].text).toBe("Starting...");
  });
});
