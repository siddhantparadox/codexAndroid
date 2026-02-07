import { describe, expect, it } from "vitest";
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  computeReconnectDelayMs
} from "../src/codex/reconnect";

describe("computeReconnectDelayMs", () => {
  it("starts with base delay for first attempt", () => {
    expect(computeReconnectDelayMs(1)).toBe(RECONNECT_BASE_DELAY_MS);
  });

  it("uses exponential backoff", () => {
    expect(computeReconnectDelayMs(2)).toBe(RECONNECT_BASE_DELAY_MS * 2);
    expect(computeReconnectDelayMs(3)).toBe(RECONNECT_BASE_DELAY_MS * 4);
  });

  it("caps at max delay", () => {
    expect(computeReconnectDelayMs(100)).toBe(RECONNECT_MAX_DELAY_MS);
  });

  it("normalizes non-positive attempts", () => {
    expect(computeReconnectDelayMs(0)).toBe(RECONNECT_BASE_DELAY_MS);
    expect(computeReconnectDelayMs(-4)).toBe(RECONNECT_BASE_DELAY_MS);
  });
});
