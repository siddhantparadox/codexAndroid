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
});
