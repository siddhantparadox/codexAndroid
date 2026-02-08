import { describe, expect, it } from "vitest";
import { __test__, extractChatgptAuthUrl, openExternalUrl } from "../src/auth-url.js";

describe("auth-url helpers", () => {
  it("extracts authUrl from chatgpt login response", () => {
    const authUrl = extractChatgptAuthUrl({
      id: 12,
      result: {
        type: "chatgpt",
        loginId: "login_1",
        authUrl: "https://chatgpt.com/auth"
      }
    });

    expect(authUrl).toBe("https://chatgpt.com/auth");
  });

  it("ignores non-chatgpt responses", () => {
    expect(
      extractChatgptAuthUrl({
        result: {
          type: "apiKey"
        }
      })
    ).toBeNull();
  });

  it("builds platform open commands", () => {
    expect(__test__.getOpenCommand("https://chatgpt.com/auth", "darwin")).toEqual({
      command: "open",
      args: ["https://chatgpt.com/auth"]
    });
    expect(__test__.getOpenCommand("https://chatgpt.com/auth", "linux")).toEqual({
      command: "xdg-open",
      args: ["https://chatgpt.com/auth"]
    });
    expect(__test__.getOpenCommand("https://chatgpt.com/auth", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://chatgpt.com/auth"]
    });
  });

  it("opens URL via injected spawn implementation", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const ok = openExternalUrl("https://chatgpt.com/auth", {
      platform: "linux",
      spawnImpl: ((command: string, args: string[]) => {
        calls.push({ command, args });
        return { unref: () => undefined } as never;
      }) as never
    });

    expect(ok).toBe(true);
    expect(calls).toEqual([
      { command: "xdg-open", args: ["https://chatgpt.com/auth"] }
    ]);
  });
});
