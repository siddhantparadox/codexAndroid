import { describe, expect, it } from "vitest";
import {
  parseThreadListPageResponse,
  parseThreadListResponse
} from "../src/codex/thread-list";

describe("parseThreadListResponse", () => {
  it("parses thread ids and previews", () => {
    const threads = parseThreadListResponse({
      data: [
        { id: "thr_1", preview: "Fix tests" },
        { id: "thr_2", preview: "Add auth flow" }
      ]
    });

    expect(threads).toEqual([
      {
        id: "thr_1",
        preview: "Fix tests",
        modelProvider: null,
        sourceKind: null,
        createdAt: null,
        updatedAt: null,
        archived: false
      },
      {
        id: "thr_2",
        preview: "Add auth flow",
        modelProvider: null,
        sourceKind: null,
        createdAt: null,
        updatedAt: null,
        archived: false
      }
    ]);
  });

  it("normalizes missing fields", () => {
    const threads = parseThreadListResponse({
      data: [{}, { id: "thr_3", preview: "" }]
    });

    expect(threads).toEqual([
      {
        id: "unknown-thread",
        preview: "(empty thread)",
        modelProvider: null,
        sourceKind: null,
        createdAt: null,
        updatedAt: null,
        archived: false
      },
      {
        id: "thr_3",
        preview: "(empty thread)",
        modelProvider: null,
        sourceKind: null,
        createdAt: null,
        updatedAt: null,
        archived: false
      }
    ]);
  });

  it("parses cursor and metadata fields", () => {
    const page = parseThreadListPageResponse({
      data: [
        {
          id: "thr_11",
          preview: "Refactor bridge",
          modelProvider: "openai",
          sourceKind: "appServer",
          createdAt: 1730000010,
          updatedAt: 1730001010,
          archived: true
        }
      ],
      nextCursor: "cursor_2"
    });

    expect(page.nextCursor).toBe("cursor_2");
    expect(page.data[0]).toEqual({
      id: "thr_11",
      preview: "Refactor bridge",
      modelProvider: "openai",
      sourceKind: "appServer",
      createdAt: 1730000010,
      updatedAt: 1730001010,
      archived: true
    });
  });
});
