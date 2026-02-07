import { describe, expect, it } from "vitest";
import { CodexRpcClient, type RpcSocket } from "../src/codex/rpc-client";

class FakeRpcSocket implements RpcSocket {
  sent: string[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.({});
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({
      data: JSON.stringify(data)
    });
  }
}

describe("CodexRpcClient", () => {
  it("initializes with initialize + initialized sequence", async () => {
    const socket = new FakeRpcSocket();
    const client = new CodexRpcClient(socket, { requestTimeoutMs: 100 });

    const initPromise = client.initialize({
      name: "codex_mobile",
      title: "Codex Mobile",
      version: "0.1.0"
    });

    const request = JSON.parse(socket.sent[0]) as { id: number; method: string };
    expect(request.method).toBe("initialize");
    socket.emitMessage({ id: request.id, result: { ok: true } });

    await initPromise;

    const notification = JSON.parse(socket.sent[1]) as { method: string };
    expect(notification.method).toBe("initialized");
  });

  it("ignores bridge control messages while resolving requests", async () => {
    const socket = new FakeRpcSocket();
    const client = new CodexRpcClient(socket, { requestTimeoutMs: 100 });

    const requestPromise = client.request("account/read", { refreshToken: false });
    const request = JSON.parse(socket.sent[0]) as { id: number; method: string };

    socket.emitMessage({ __bridge: { type: "ping", t: 5 } });
    socket.emitMessage({
      id: request.id,
      result: { account: null, requiresOpenaiAuth: true }
    });

    await expect(requestPromise).resolves.toEqual({
      account: null,
      requiresOpenaiAuth: true
    });
  });

  it("rejects pending requests when socket closes", async () => {
    const socket = new FakeRpcSocket();
    const client = new CodexRpcClient(socket, { requestTimeoutMs: 100 });

    const requestPromise = client.request("model/list", { limit: 20 });
    socket.close();

    await expect(requestPromise).rejects.toThrow(/socket closed/i);
  });

  it("responds to server-initiated requests using onServerRequest", async () => {
    const socket = new FakeRpcSocket();
    new CodexRpcClient(socket, {
      requestTimeoutMs: 100,
      onServerRequest: ({ method }) => {
        if (method === "item/commandExecution/requestApproval") {
          return { decision: "accept" };
        }
        return { decision: "decline" };
      }
    });

    socket.emitMessage({
      id: 200,
      method: "item/commandExecution/requestApproval",
      params: { itemId: "cmd_1" }
    });

    await Promise.resolve();

    const response = JSON.parse(socket.sent[0]) as {
      id: number;
      result: { decision: string };
    };
    expect(response.id).toBe(200);
    expect(response.result.decision).toBe("accept");
  });

  it("returns error for unhandled server requests", async () => {
    const socket = new FakeRpcSocket();
    new CodexRpcClient(socket, { requestTimeoutMs: 100 });

    socket.emitMessage({
      id: 300,
      method: "item/fileChange/requestApproval",
      params: { itemId: "change_1" }
    });

    const response = JSON.parse(socket.sent[0]) as {
      id: number;
      error: { code: number; message: string };
    };
    expect(response.id).toBe(300);
    expect(response.error.code).toBe(-32601);
  });
});
