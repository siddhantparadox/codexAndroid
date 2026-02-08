import { describe, expect, it } from "vitest";
import {
  isBridgeControlMessage,
  parseBridgeControlMessage
} from "../src/bridge";

describe("bridge control messages", () => {
  it("recognizes ping messages", () => {
    const message = { __bridge: { type: "ping", t: 7 } };
    expect(isBridgeControlMessage(message)).toBe(true);

    const parsed = parseBridgeControlMessage(message);
    expect(parsed.__bridge.type).toBe("ping");
  });

  it("rejects unknown bridge message types", () => {
    const message = { __bridge: { type: "unknown" } };
    expect(isBridgeControlMessage(message)).toBe(false);
  });

  it("parses auth browser launch status messages", () => {
    const message = {
      __bridge: {
        type: "authBrowserLaunch",
        url: "https://chatgpt.com/auth",
        success: true,
        message: "Opened login URL in local browser"
      }
    };

    expect(isBridgeControlMessage(message)).toBe(true);
    const parsed = parseBridgeControlMessage(message);
    expect(parsed.__bridge.type).toBe("authBrowserLaunch");
    if (parsed.__bridge.type === "authBrowserLaunch") {
      expect(parsed.__bridge.success).toBe(true);
    }
  });

  it("parses app-server status messages", () => {
    const message = {
      __bridge: {
        type: "appServerStatus",
        state: "running",
        timestamp: Date.now(),
        pid: 12345
      }
    };

    expect(isBridgeControlMessage(message)).toBe(true);
    const parsed = parseBridgeControlMessage(message);
    expect(parsed.__bridge.type).toBe("appServerStatus");
    if (parsed.__bridge.type === "appServerStatus") {
      expect(parsed.__bridge.state).toBe("running");
      expect(parsed.__bridge.pid).toBe(12345);
    }
  });

  it("parses client log messages", () => {
    const message = {
      __bridge: {
        type: "clientLog",
        level: "error",
        source: "mobile.app",
        message: "Request timed out: thread/start",
        timestamp: Date.now(),
        context: {
          endpoint: "lan",
          screen: "threads"
        }
      }
    };

    expect(isBridgeControlMessage(message)).toBe(true);
    const parsed = parseBridgeControlMessage(message);
    expect(parsed.__bridge.type).toBe("clientLog");
    if (parsed.__bridge.type === "clientLog") {
      expect(parsed.__bridge.level).toBe("error");
      expect(parsed.__bridge.source).toBe("mobile.app");
    }
  });
});
