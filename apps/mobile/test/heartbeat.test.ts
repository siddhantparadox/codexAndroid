import type { BridgeControlMessage } from "@codex-mobile/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBridgeHeartbeat } from "../src/pairing/heartbeat";

describe("createBridgeHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends ping immediately and waits for matching pong before sending next ping", () => {
    const sent: BridgeControlMessage[] = [];

    const heartbeat = createBridgeHeartbeat((message) => {
      sent.push(message);
    }, {
      intervalMs: 1_000,
      timeoutMs: 5_000
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.__bridge.type).toBe("ping");
    const firstToken =
      sent[0]?.__bridge.type === "ping" ? sent[0].__bridge.t : null;
    expect(firstToken).not.toBeNull();

    vi.advanceTimersByTime(1_000);
    expect(sent).toHaveLength(1);

    heartbeat.handleBridgeMessage({
      __bridge: {
        type: "pong",
        t: firstToken as number
      }
    });
    vi.advanceTimersByTime(1_000);

    expect(sent).toHaveLength(2);
    expect(sent[1]?.__bridge.type).toBe("ping");
    heartbeat.stop();
  });

  it("captures latency sample from matching pong", () => {
    const latencies: number[] = [];
    const sent: BridgeControlMessage[] = [];

    const heartbeat = createBridgeHeartbeat((message) => {
      sent.push(message);
    }, {
      intervalMs: 1_000,
      timeoutMs: 800,
      onLatencySample: (latencyMs) => {
        latencies.push(latencyMs);
      }
    });

    const token =
      sent[0]?.__bridge.type === "ping" ? sent[0].__bridge.t : null;
    expect(token).not.toBeNull();

    vi.advanceTimersByTime(125);
    heartbeat.handleBridgeMessage({
      __bridge: {
        type: "pong",
        t: token as number
      }
    });

    expect(latencies).toEqual([125]);
    heartbeat.stop();
  });

  it("ignores pong values that do not match the current ping token", () => {
    const latencies: number[] = [];
    const sent: BridgeControlMessage[] = [];

    const heartbeat = createBridgeHeartbeat((message) => {
      sent.push(message);
    }, {
      intervalMs: 1_000,
      timeoutMs: 800,
      onLatencySample: (latencyMs) => {
        latencies.push(latencyMs);
      }
    });

    const token =
      sent[0]?.__bridge.type === "ping" ? sent[0].__bridge.t : null;
    expect(token).not.toBeNull();

    heartbeat.handleBridgeMessage({
      __bridge: {
        type: "pong",
        t: (token as number) + 1
      }
    });

    expect(latencies).toHaveLength(0);
    heartbeat.stop();
  });

  it("tracks timeouts and stops after maxConsecutiveTimeouts", () => {
    const timeoutCounts: number[] = [];
    const maxTimeoutCounts: number[] = [];
    const recoveries: number[] = [];
    const sent: BridgeControlMessage[] = [];

    createBridgeHeartbeat((message) => {
      sent.push(message);
    }, {
      intervalMs: 300,
      timeoutMs: 100,
      maxConsecutiveTimeouts: 2,
      onTimeout: (count) => timeoutCounts.push(count),
      onRecovered: () => recoveries.push(1),
      onMaxTimeouts: (count) => maxTimeoutCounts.push(count)
    });

    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(100);
    expect(timeoutCounts).toEqual([1]);

    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(2);

    vi.advanceTimersByTime(100);
    expect(timeoutCounts).toEqual([1, 2]);
    expect(maxTimeoutCounts).toEqual([2]);
    expect(recoveries).toHaveLength(0);

    vi.advanceTimersByTime(2_000);
    expect(sent).toHaveLength(2);
  });

  it("handles send failures as heartbeat timeouts", () => {
    const onTimeout = vi.fn();
    const onMaxTimeouts = vi.fn();

    createBridgeHeartbeat(() => {
      throw new Error("socket closed");
    }, {
      intervalMs: 300,
      timeoutMs: 100,
      maxConsecutiveTimeouts: 1,
      onTimeout,
      onMaxTimeouts
    });

    expect(onTimeout).toHaveBeenCalledWith(1);
    expect(onMaxTimeouts).toHaveBeenCalledWith(1);
  });
});
