import { describe, expect, it } from "vitest";
import {
  parsePairingQrPayload,
  serializePairingQrPayload
} from "../src/pairing/qr";

describe("pairing qr", () => {
  it("round-trips a valid payload", () => {
    const raw = serializePairingQrPayload({
      v: 1,
      name: "Home Computer",
      token: "12345678901234567890123456789012",
      endpoints: {
        lan: "ws://192.168.1.50:8787/ws"
      },
      cwdHint: "/repo"
    });

    const parsed = parsePairingQrPayload(raw);
    expect(parsed.name).toBe("Home Computer");
    expect(parsed.endpoints.lan).toBe("ws://192.168.1.50:8787/ws");
  });

  it("throws for non-json payloads", () => {
    expect(() => parsePairingQrPayload("not-json")).toThrowError(
      /valid JSON/i
    );
  });
});
