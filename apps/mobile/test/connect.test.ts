import { describe, expect, it } from "vitest";
import {
  ConnectionFallbackError,
  connectWithEndpointFallback
} from "../src/pairing/connect";

type FakeBehavior = {
  type: "open" | "error" | "close" | "none";
  delayMs?: number;
};

class FakeWebSocket {
  static behaviors: FakeBehavior[] = [];
  static urls: string[] = [];

  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  constructor(url: string) {
    FakeWebSocket.urls.push(url);
    const behavior = FakeWebSocket.behaviors.shift() ?? { type: "none" };

    const delayMs = behavior.delayMs ?? 0;
    if (behavior.type === "open") {
      setTimeout(() => this.onopen?.(), delayMs);
    } else if (behavior.type === "error") {
      setTimeout(() => this.onerror?.({}), delayMs);
    } else if (behavior.type === "close") {
      setTimeout(() => this.onclose?.({ code: 1006 }), delayMs);
    }
  }

  close(): void {}
}

describe("connectWithEndpointFallback", () => {
  it("connects on LAN first when available", async () => {
    FakeWebSocket.behaviors = [{ type: "open" }];
    FakeWebSocket.urls = [];

    const result = await connectWithEndpointFallback({
      payload: {
        v: 1,
        name: "Home Computer",
        token: "12345678901234567890123456789012",
        endpoints: {
          lan: "ws://192.168.1.50:8787/ws",
          tailscale: "ws://100.64.2.2:8787/ws"
        }
      },
      WebSocketImplementation: FakeWebSocket as never,
      timeoutMs: 25
    });

    expect(result.endpointType).toBe("lan");
    expect(FakeWebSocket.urls[0]).toContain("ws://192.168.1.50:8787/ws");
    expect(FakeWebSocket.urls[0]).toContain("token=");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.success).toBe(true);
  });

  it("falls back to tailscale when lan fails", async () => {
    FakeWebSocket.behaviors = [{ type: "error" }, { type: "open" }];
    FakeWebSocket.urls = [];

    const result = await connectWithEndpointFallback({
      payload: {
        v: 1,
        name: "Home Computer",
        token: "12345678901234567890123456789012",
        endpoints: {
          lan: "ws://192.168.1.50:8787/ws",
          tailscale: "ws://100.64.2.2:8787/ws"
        }
      },
      WebSocketImplementation: FakeWebSocket as never,
      timeoutMs: 25
    });

    expect(result.endpointType).toBe("tailscale");
    expect(FakeWebSocket.urls.length).toBe(2);
    expect(result.attempts[0]?.endpointType).toBe("lan");
    expect(result.attempts[0]?.success).toBe(false);
    expect(result.attempts[1]?.endpointType).toBe("tailscale");
    expect(result.attempts[1]?.success).toBe(true);
  });

  it("throws after all attempts fail", async () => {
    FakeWebSocket.behaviors = [{ type: "error" }, { type: "close" }];
    FakeWebSocket.urls = [];

    await expect(
      connectWithEndpointFallback({
        payload: {
          v: 1,
          name: "Home Computer",
          token: "12345678901234567890123456789012",
          endpoints: {
            lan: "ws://192.168.1.50:8787/ws",
            tailscale: "ws://100.64.2.2:8787/ws"
          }
        },
        WebSocketImplementation: FakeWebSocket as never,
        timeoutMs: 25
      })
    ).rejects.toBeInstanceOf(ConnectionFallbackError);
  });

  it("records endpoint_unavailable when LAN endpoint is missing", async () => {
    FakeWebSocket.behaviors = [{ type: "open" }];
    FakeWebSocket.urls = [];

    const result = await connectWithEndpointFallback({
      payload: {
        v: 1,
        name: "Home Computer",
        token: "12345678901234567890123456789012",
        endpoints: {
          tailscale: "ws://100.64.2.2:8787/ws"
        }
      },
      WebSocketImplementation: FakeWebSocket as never,
      timeoutMs: 25
    });

    expect(result.endpointType).toBe("tailscale");
    expect(result.attempts[0]?.reason).toBe("endpoint_unavailable");
    expect(result.attempts[1]?.success).toBe(true);
  });
});
