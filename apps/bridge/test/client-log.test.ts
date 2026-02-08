import { describe, expect, it, vi } from "vitest";
import { formatClientLogLine, writeClientLog } from "../src/client-log.js";

describe("client log writer", () => {
  it("formats payloads with level, source, and context", () => {
    const line = formatClientLogLine({
      type: "clientLog",
      level: "error",
      source: "mobile.app",
      message: "Request timed out",
      timestamp: Date.UTC(2026, 1, 8, 12, 30, 0),
      context: {
        endpoint: "tailscale",
        screen: "threads"
      }
    });

    expect(line).toContain("[mobile:error] [mobile.app]");
    expect(line).toContain("2026-02-08T12:30:00.000Z");
    expect(line).toContain("Request timed out");
    expect(line).toContain('"endpoint":"tailscale"');
  });

  it("routes warn level to warn writer", () => {
    const writer = {
      log: vi.fn<(message: string) => void>(),
      warn: vi.fn<(message: string) => void>(),
      error: vi.fn<(message: string) => void>()
    };

    writeClientLog(
      {
        type: "clientLog",
        level: "warn",
        source: "mobile.app",
        message: "Heartbeat delayed",
        timestamp: Date.now()
      },
      writer
    );

    expect(writer.warn).toHaveBeenCalledTimes(1);
    expect(writer.log).not.toHaveBeenCalled();
    expect(writer.error).not.toHaveBeenCalled();
  });
});
