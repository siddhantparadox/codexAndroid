import * as SecureStore from "expo-secure-store";
import type { PairingPayload } from "@codex-mobile/protocol";
import {
  clearPairingFromStore,
  loadPairingFromStore,
  persistPairingToStore
} from "./storage";

const secureStore = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync
};

export const persistPairing = async (payload: PairingPayload): Promise<void> => {
  await persistPairingToStore(secureStore, payload);
};

export const loadPersistedPairing = async (): Promise<PairingPayload | null> =>
  loadPairingFromStore(secureStore);

export const clearPersistedPairing = async (): Promise<void> => {
  await clearPairingFromStore(secureStore);
};
