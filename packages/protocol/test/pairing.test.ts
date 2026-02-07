import { describe, expect, it } from "vitest";
import { parsePairingPayload } from "../src/pairing";

describe("pairing payload", () => {
  it("parses a valid LAN payload", () => {
    const payload = parsePairingPayload({
      v: 1,
      name: "Home Computer",
      token: "12345678901234567890123456789012",
      endpoints: {
        lan: "ws://192.168.1.23:8787/ws"
      },
      cwdHint: "/repo"
    });

    expect(payload.name).toBe("Home Computer");
    expect(payload.endpoints.lan).toBe("ws://192.168.1.23:8787/ws");
  });

  it("rejects payloads without endpoints", () => {
    expect(() =>
      parsePairingPayload({
        v: 1,
        name: "Home Computer",
        token: "12345678901234567890123456789012",
        endpoints: {}
      })
    ).toThrowError();
  });

  it("rejects short tokens", () => {
    expect(() =>
      parsePairingPayload({
        v: 1,
        name: "Home Computer",
        token: "short-token",
        endpoints: {
          lan: "ws://192.168.1.23:8787/ws"
        }
      })
    ).toThrowError();
  });
});