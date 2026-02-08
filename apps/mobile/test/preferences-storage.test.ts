import { describe, expect, it } from "vitest";
import {
  clearPreferencesFromStore,
  DEFAULT_USER_PREFERENCES,
  loadPreferencesFromStore,
  persistPreferencesToStore,
  type PreferencesStore
} from "../src/preferences/storage";

class InMemoryStore implements PreferencesStore {
  data = new Map<string, string>();

  async getItemAsync(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe("preferences storage", () => {
  it("persists and loads runtime preferences", async () => {
    const store = new InMemoryStore();
    await persistPreferencesToStore(store, {
      activeScreen: "agent",
      themeName: "parchment",
      reducedMotionOverride: true,
      composerMode: "chat",
      networkAccess: "on",
      effortLevel: "high",
      reasoningMode: "raw",
      selectedModelId: "gpt-5.2-codex",
      showToolCalls: false,
      showArchivedThreads: true
    });

    const loaded = await loadPreferencesFromStore(store);
    expect(loaded).toEqual({
      activeScreen: "agent",
      themeName: "parchment",
      reducedMotionOverride: true,
      composerMode: "chat",
      networkAccess: "on",
      effortLevel: "high",
      reasoningMode: "raw",
      selectedModelId: "gpt-5.2-codex",
      showToolCalls: false,
      showArchivedThreads: true
    });
  });

  it("returns defaults when preferences are missing", async () => {
    const store = new InMemoryStore();
    const loaded = await loadPreferencesFromStore(store);
    expect(loaded).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("falls back invalid fields to defaults", async () => {
    const store = new InMemoryStore();
    await store.setItemAsync(
      "codex-mobile.preferences",
      JSON.stringify({
        activeScreen: "invalid",
        themeName: "invalid",
        reducedMotionOverride: "yes",
        composerMode: "agent",
        networkAccess: "on",
        effortLevel: "invalid",
        reasoningMode: "summary",
        selectedModelId: 123,
        showToolCalls: "true",
        showArchivedThreads: true
      })
    );

    const loaded = await loadPreferencesFromStore(store);
    expect(loaded).toEqual({
      activeScreen: "threads",
      themeName: "carbon",
      reducedMotionOverride: null,
      composerMode: "agent",
      networkAccess: "on",
      effortLevel: "medium",
      reasoningMode: "summary",
      selectedModelId: null,
      showToolCalls: true,
      showArchivedThreads: true
    });
  });

  it("clears invalid JSON payloads", async () => {
    const store = new InMemoryStore();
    await store.setItemAsync("codex-mobile.preferences", "{not-json");

    const loaded = await loadPreferencesFromStore(store);
    expect(loaded).toEqual(DEFAULT_USER_PREFERENCES);
    expect(await store.getItemAsync("codex-mobile.preferences")).toBeNull();
  });

  it("removes saved preferences", async () => {
    const store = new InMemoryStore();
    await store.setItemAsync("codex-mobile.preferences", JSON.stringify({}));
    await clearPreferencesFromStore(store);

    expect(await store.getItemAsync("codex-mobile.preferences")).toBeNull();
  });
});
