import type { EffortLevel, ReasoningMode } from "../codex/turn-settings";
import type { ThemeName } from "../theme/tokens";
import type { AppScreenKey } from "../ui/app-shell";

const PREFERENCES_KEY = "codex-mobile.preferences";

type ComposerMode = "chat" | "agent";
type NetworkAccessMode = "off" | "on";

export type UserPreferences = {
  activeScreen: AppScreenKey;
  themeName: ThemeName;
  reducedMotionOverride: boolean | null;
  composerMode: ComposerMode;
  networkAccess: NetworkAccessMode;
  effortLevel: EffortLevel;
  reasoningMode: ReasoningMode;
  selectedModelId: string | null;
  showToolCalls: boolean;
  showArchivedThreads: boolean;
};

export type PreferencesStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  activeScreen: "threads",
  themeName: "carbon",
  reducedMotionOverride: null,
  composerMode: "agent",
  networkAccess: "off",
  effortLevel: "medium",
  reasoningMode: "summary",
  selectedModelId: null,
  showToolCalls: true,
  showArchivedThreads: false
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const isThemeName = (value: unknown): value is ThemeName =>
  value === "carbon" || value === "parchment";

const isComposerMode = (value: unknown): value is ComposerMode =>
  value === "chat" || value === "agent";

const isNetworkAccessMode = (value: unknown): value is NetworkAccessMode =>
  value === "off" || value === "on";

const isEffortLevel = (value: unknown): value is EffortLevel =>
  value === "low" || value === "medium" || value === "high";

const isReasoningMode = (value: unknown): value is ReasoningMode =>
  value === "summary" || value === "raw";

const isAppScreenKey = (value: unknown): value is AppScreenKey =>
  value === "threads" || value === "agent" || value === "approvals" || value === "settings";

const parsePreferencesRecord = (value: unknown): UserPreferences | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const activeScreen = isAppScreenKey(record.activeScreen)
    ? record.activeScreen
    : DEFAULT_USER_PREFERENCES.activeScreen;
  const themeName = isThemeName(record.themeName)
    ? record.themeName
    : DEFAULT_USER_PREFERENCES.themeName;
  const reducedMotionOverride =
    record.reducedMotionOverride === null ||
    typeof record.reducedMotionOverride === "boolean"
      ? record.reducedMotionOverride
      : DEFAULT_USER_PREFERENCES.reducedMotionOverride;
  const composerMode = isComposerMode(record.composerMode)
    ? record.composerMode
    : DEFAULT_USER_PREFERENCES.composerMode;
  const networkAccess = isNetworkAccessMode(record.networkAccess)
    ? record.networkAccess
    : DEFAULT_USER_PREFERENCES.networkAccess;
  const effortLevel = isEffortLevel(record.effortLevel)
    ? record.effortLevel
    : DEFAULT_USER_PREFERENCES.effortLevel;
  const reasoningMode = isReasoningMode(record.reasoningMode)
    ? record.reasoningMode
    : DEFAULT_USER_PREFERENCES.reasoningMode;
  const selectedModelId =
    typeof record.selectedModelId === "string" || record.selectedModelId === null
      ? record.selectedModelId
      : DEFAULT_USER_PREFERENCES.selectedModelId;
  const showToolCalls =
    typeof record.showToolCalls === "boolean"
      ? record.showToolCalls
      : DEFAULT_USER_PREFERENCES.showToolCalls;
  const showArchivedThreads =
    typeof record.showArchivedThreads === "boolean"
      ? record.showArchivedThreads
      : DEFAULT_USER_PREFERENCES.showArchivedThreads;

  return {
    activeScreen,
    themeName,
    reducedMotionOverride,
    composerMode,
    networkAccess,
    effortLevel,
    reasoningMode,
    selectedModelId,
    showToolCalls,
    showArchivedThreads
  };
};

export const persistPreferencesToStore = async (
  store: PreferencesStore,
  preferences: UserPreferences
): Promise<void> => {
  await store.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences));
};

export const loadPreferencesFromStore = async (
  store: PreferencesStore
): Promise<UserPreferences> => {
  const raw = await store.getItemAsync(PREFERENCES_KEY);
  if (!raw) {
    return DEFAULT_USER_PREFERENCES;
  }

  try {
    const parsed = parsePreferencesRecord(JSON.parse(raw));
    if (!parsed) {
      throw new Error("invalid preferences payload");
    }
    return parsed;
  } catch {
    await store.deleteItemAsync(PREFERENCES_KEY);
    return DEFAULT_USER_PREFERENCES;
  }
};

export const clearPreferencesFromStore = async (
  store: PreferencesStore
): Promise<void> => {
  await store.deleteItemAsync(PREFERENCES_KEY);
};
