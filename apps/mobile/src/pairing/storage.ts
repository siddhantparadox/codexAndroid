import type { PairingPayload } from "@codex-mobile/protocol";
import { parsePairingPayload } from "@codex-mobile/protocol";

const PAIRING_KEY = "codex-mobile/pairing";

export type PairingStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export const persistPairingToStore = async (
  store: PairingStore,
  payload: PairingPayload
): Promise<void> => {
  await store.setItemAsync(PAIRING_KEY, JSON.stringify(payload));
};

export const loadPairingFromStore = async (
  store: PairingStore
): Promise<PairingPayload | null> => {
  const raw = await store.getItemAsync(PAIRING_KEY);
  if (!raw) {
    return null;
  }

  try {
    return parsePairingPayload(JSON.parse(raw));
  } catch {
    await store.deleteItemAsync(PAIRING_KEY);
    return null;
  }
};

export const clearPairingFromStore = async (store: PairingStore): Promise<void> => {
  await store.deleteItemAsync(PAIRING_KEY);
};
