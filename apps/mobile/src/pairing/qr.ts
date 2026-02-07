import { parsePairingPayload, type PairingPayload } from "@codex-mobile/protocol";

export const parsePairingQrPayload = (raw: string): PairingPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Pairing payload is not valid JSON");
  }

  return parsePairingPayload(parsed);
};

export const serializePairingQrPayload = (payload: PairingPayload): string =>
  JSON.stringify(payload);
