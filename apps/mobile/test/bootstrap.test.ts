import { describe, expect, it } from "vitest";
import { initializeAndBootstrap } from "../src/codex/bootstrap";
import { CodexRpcClient, type RpcSocket } from "../src/codex/rpc-client";

class AutoResponseSocket implements RpcSocket {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  sentMethods: string[] = [];

  send(data: string): void {
    const parsed = JSON.parse(data) as {
      id?: number;
      method: string;
      params?: unknown;
    };

    this.sentMethods.push(parsed.method);

    if (typeof parsed.id !== "number") {
      return;
    }

    let result: unknown = {};
    if (parsed.method === "initialize") {
      result = { userAgent: "codex-mobile-test" };
    } else if (parsed.method === "account/read") {
      result = {
        account: { type: "apiKey" },
        requiresOpenaiAuth: true
      };
    } else if (parsed.method === "model/list") {
      result = {
        data: [{ id: "gpt-5.2-codex", displayName: "GPT-5.2 Codex" }]
      };
    } else if (parsed.method === "thread/list") {
      result = {
        data: [{ id: "thr_1", preview: "Fix tests" }]
      };
    }

    this.onmessage?.({
      data: JSON.stringify({
        id: parsed.id,
        result
      })
    });
  }

  close(): void {}
}

describe("initializeAndBootstrap", () => {
  it("loads account, model, and thread summaries", async () => {
    const socket = new AutoResponseSocket();
    const client = new CodexRpcClient(socket, { requestTimeoutMs: 100 });

    const snapshot = await initializeAndBootstrap(client);

    expect(snapshot.authMode).toBe("apiKey");
    expect(snapshot.requiresOpenaiAuth).toBe(true);
    expect(snapshot.modelCount).toBe(1);
    expect(snapshot.threadCount).toBe(1);
    expect(socket.sentMethods).toEqual([
      "initialize",
      "initialized",
      "account/read",
      "model/list",
      "thread/list"
    ]);
  });
});
