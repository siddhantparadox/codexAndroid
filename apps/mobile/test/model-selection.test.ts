import { describe, expect, it } from "vitest";
import { resolveSelectedModelId } from "../src/codex/model-selection";

describe("resolveSelectedModelId", () => {
  const models = [
    { id: "gpt-5.2-codex", displayName: "GPT-5.2 Codex" },
    { id: "gpt-5.2", displayName: "GPT-5.2" }
  ];

  it("returns preferred model when it exists", () => {
    expect(resolveSelectedModelId(models, "gpt-5.2")).toBe("gpt-5.2");
  });

  it("falls back to first model when preferred model does not exist", () => {
    expect(resolveSelectedModelId(models, "gpt-4o")).toBe("gpt-5.2-codex");
  });

  it("falls back to first model when preferred model is null", () => {
    expect(resolveSelectedModelId(models, null)).toBe("gpt-5.2-codex");
  });

  it("returns null when model list is empty", () => {
    expect(resolveSelectedModelId([], "gpt-5.2-codex")).toBeNull();
  });
});

