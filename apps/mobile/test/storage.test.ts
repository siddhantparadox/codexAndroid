import { describe, expect, it } from "vitest";
import {
  clearPairingFromStore,
  loadPairingFromStore,
  persistPairingToStore,
  type PairingStore
} from "../src/pairing/storage";

class InMemoryStore implements PairingStore {
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

describe("pairing storage", () => {
  it("persists and loads pairing", async () => {
    const store = new InMemoryStore();
    await persistPairingToStore(store, {
      v: 1,
      name: "Home Computer",
      token: "12345678901234567890123456789012",
      endpoints: {
        lan: "ws://192.168.1.50:8787/ws"
      },
      cwdHint: "/repo"
    });

    const loaded = await loadPairingFromStore(store);
    expect(loaded?.name).toBe("Home Computer");
  });

  it("clears invalid payloads", async () => {
    const store = new InMemoryStore();
    await store.setItemAsync("codex-mobile/pairing", "{\"v\":2}");

    const loaded = await loadPairingFromStore(store);
    expect(loaded).toBeNull();
    expect(await store.getItemAsync("codex-mobile/pairing")).toBeNull();
  });

  it("removes saved pairing", async () => {
    const store = new InMemoryStore();
    await store.setItemAsync("codex-mobile/pairing", "{}");
    await clearPairingFromStore(store);

    expect(await store.getItemAsync("codex-mobile/pairing")).toBeNull();
  });
});
