import { describe, expect, it } from "vitest";
import {
  buildConnectionHint,
  describeAttemptReason,
  formatAttemptSummary
} from "../src/pairing/diagnostics";
import type { ConnectionAttemptFailure } from "../src/pairing/connect";

describe("pairing diagnostics", () => {
  it("maps closed_409 to active-connection guidance", () => {
    const attempts: ConnectionAttemptFailure[] = [
      {
        endpointType: "lan",
        url: "ws://192.168.1.2:8787/ws?token=x",
        reason: "closed_409",
        durationMs: 5,
        timestampMs: 1
      }
    ];

    expect(buildConnectionHint(attempts)).toContain("Another phone is connected");
  });

  it("returns LAN/Tailnet combined hint when both fail", () => {
    const attempts: ConnectionAttemptFailure[] = [
      {
        endpointType: "lan",
        url: "ws://192.168.1.2:8787/ws?token=x",
        reason: "timeout",
        durationMs: 2000,
        timestampMs: 1
      },
      {
        endpointType: "tailscale",
        url: "ws://100.100.100.1:8787/ws?token=x",
        reason: "socket_error",
        durationMs: 800,
        timestampMs: 2
      }
    ];

    expect(buildConnectionHint(attempts)).toContain("LAN and Tailnet both failed");
  });

  it("formats friendly reason and success summary", () => {
    expect(describeAttemptReason("lan", "timeout")).toContain("timed out");
    expect(
      formatAttemptSummary({
        endpointType: "tailscale",
        url: "ws://100.100.100.1:8787/ws?token=x",
        success: true,
        reason: null,
        durationMs: 120,
        timestampMs: 3
      })
    ).toContain("Tailnet connected in 120ms");
  });
});
