import type { PairingPayload } from "@codex-mobile/protocol";
import { parsePairingPayload } from "@codex-mobile/protocol";

const PAIRING_KEY = "codex-mobile.pairing";
const LEGACY_PAIRING_KEYS = ["codex-mobile/pairing"];

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
  const keysToCheck = [PAIRING_KEY, ...LEGACY_PAIRING_KEYS];

  for (const key of keysToCheck) {
    const raw = await store.getItemAsync(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = parsePairingPayload(JSON.parse(raw));

      if (key !== PAIRING_KEY) {
        await store.setItemAsync(PAIRING_KEY, JSON.stringify(parsed));
        await store.deleteItemAsync(key);
      }

      return parsed;
    } catch {
      await store.deleteItemAsync(key);
    }
  }

  return null;
};

export const clearPairingFromStore = async (store: PairingStore): Promise<void> => {
  await store.deleteItemAsync(PAIRING_KEY);
};
