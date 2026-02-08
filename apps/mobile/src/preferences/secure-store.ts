import * as SecureStore from "expo-secure-store";
import {
  clearPreferencesFromStore,
  loadPreferencesFromStore,
  persistPreferencesToStore,
  type UserPreferences
} from "./storage";

const secureStore = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync
};

export const persistPreferences = async (
  preferences: UserPreferences
): Promise<void> => {
  await persistPreferencesToStore(secureStore, preferences);
};

export const loadPersistedPreferences = async (): Promise<UserPreferences> =>
  loadPreferencesFromStore(secureStore);

export const clearPersistedPreferences = async (): Promise<void> => {
  await clearPreferencesFromStore(secureStore);
};

