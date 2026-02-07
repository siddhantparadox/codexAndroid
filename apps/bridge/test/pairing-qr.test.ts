import { describe, expect, it } from "vitest";
import { pairingPayloadToQrText } from "../src/pairing-qr.js";

describe("pairingPayloadToQrText", () => {
  it("serializes pairing payload JSON", () => {
    const text = pairingPayloadToQrText({
      v: 1,
      name: "Home Computer",
      token: "12345678901234567890123456789012",
      endpoints: {
        lan: "ws://192.168.1.50:8787/ws"
      },
      cwdHint: "/repo"
    });

    expect(text).toContain("\"v\":1");
    expect(text).toContain("\"name\":\"Home Computer\"");
  });
});
