import { describe, expect, it } from "vitest";
import { parseThreadListResponse } from "../src/codex/thread-list";

describe("parseThreadListResponse", () => {
  it("parses thread ids and previews", () => {
    const threads = parseThreadListResponse({
      data: [
        { id: "thr_1", preview: "Fix tests" },
        { id: "thr_2", preview: "Add auth flow" }
      ]
    });

    expect(threads).toEqual([
      { id: "thr_1", preview: "Fix tests" },
      { id: "thr_2", preview: "Add auth flow" }
    ]);
  });

  it("normalizes missing fields", () => {
    const threads = parseThreadListResponse({
      data: [{}, { id: "thr_3", preview: "" }]
    });

    expect(threads).toEqual([
      { id: "unknown-thread", preview: "(empty thread)" },
      { id: "thr_3", preview: "(empty thread)" }
    ]);
  });
});
