import { describe, expect, it } from "vitest";
import {
  parseAccountSnapshot,
  parseChatgptLoginStartResult,
  parseLoginCompletedNotification
} from "../src/codex/account";

describe("account parsing", () => {
  it("parses account/read response", () => {
    const snapshot = parseAccountSnapshot({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: true
    });

    expect(snapshot).toEqual({
      authMode: "chatgpt",
      requiresOpenaiAuth: true
    });
  });

  it("parses chatgpt login start payload", () => {
    const result = parseChatgptLoginStartResult({
      type: "chatgpt",
      loginId: "login_123",
      authUrl: "https://chatgpt.com/auth"
    });

    expect(result).toEqual({
      loginId: "login_123",
      authUrl: "https://chatgpt.com/auth"
    });
  });

  it("parses login completion notification", () => {
    const notification = parseLoginCompletedNotification({
      loginId: "login_123",
      success: false,
      error: "cancelled"
    });

    expect(notification).toEqual({
      loginId: "login_123",
      success: false,
      error: "cancelled"
    });
  });
});
