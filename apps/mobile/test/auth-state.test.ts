import { describe, expect, it } from "vitest";
import { isAuthRequiredForTurns } from "../src/codex/auth-state";

describe("auth-state", () => {
  it("requires auth for none/unknown states", () => {
    expect(isAuthRequiredForTurns("none")).toBe(true);
    expect(isAuthRequiredForTurns("unknown")).toBe(true);
    expect(isAuthRequiredForTurns(null)).toBe(true);
  });

  it("allows turns when auth mode is resolved", () => {
    expect(isAuthRequiredForTurns("chatgpt")).toBe(false);
    expect(isAuthRequiredForTurns("apiKey")).toBe(false);
  });
});
