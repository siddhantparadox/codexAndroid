import { describe, expect, it } from "vitest";
import { getAppTitle } from "../src/config";

describe("mobile config", () => {
  it("returns the app title", () => {
    expect(getAppTitle()).toBe("Codex Mobile");
  });
});