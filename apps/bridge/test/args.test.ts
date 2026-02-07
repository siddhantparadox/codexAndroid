import { describe, expect, it } from "vitest";
import { parseBridgeArgs } from "../src/args.js";

describe("parseBridgeArgs", () => {
  it("uses defaults when no flags are passed", () => {
    const parsed = parseBridgeArgs([], "/repo");

    expect(parsed.host).toBe("0.0.0.0");
    expect(parsed.port).toBe(8787);
    expect(parsed.name).toBe("Codex Mobile Bridge");
    expect(parsed.token.length).toBeGreaterThanOrEqual(24);
  });

  it("parses explicit values", () => {
    const parsed = parseBridgeArgs(
      ["--host", "127.0.0.1", "--port", "9001", "--token", "x".repeat(24), "--name", "Desk", "--codex-bin", "codex-bin"],
      "/repo"
    );

    expect(parsed.host).toBe("127.0.0.1");
    expect(parsed.port).toBe(9001);
    expect(parsed.token).toBe("x".repeat(24));
    expect(parsed.name).toBe("Desk");
    expect(parsed.codexBin).toBe("codex-bin");
  });

  it("rejects invalid port values", () => {
    expect(() => parseBridgeArgs(["--port", "-1"], "/repo")).toThrowError();
  });
});
