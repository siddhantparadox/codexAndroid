import qrcodeTerminal from "qrcode-terminal";
import type { PairingPayload } from "@codex-mobile/protocol";

export const pairingPayloadToQrText = (payload: PairingPayload): string =>
  JSON.stringify(payload);

export const printPairingQr = (payload: PairingPayload): void => {
  qrcodeTerminal.generate(pairingPayloadToQrText(payload), {
    small: true
  });
};
