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
});