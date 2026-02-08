import { describe, expect, it } from "vitest";
import { shouldUseShellForCodex } from "../src/spawn.js";

describe("shouldUseShellForCodex", () => {
  it("enables shell on windows for cmd/bat launchers", () => {
    expect(shouldUseShellForCodex("codex.cmd", "win32")).toBe(true);
    expect(shouldUseShellForCodex("runner.BAT", "win32")).toBe(true);
  });

  it("does not enable shell for non-windows platforms", () => {
    expect(shouldUseShellForCodex("codex.cmd", "linux")).toBe(false);
    expect(shouldUseShellForCodex("codex", "darwin")).toBe(false);
  });
});

