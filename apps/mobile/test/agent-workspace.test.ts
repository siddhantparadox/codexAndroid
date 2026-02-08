import { describe, expect, it } from "vitest";
import { addOpenedThread, removeOpenedThread } from "../src/ui/agent-workspace";

describe("agent-workspace", () => {
  it("adds selected thread to front and deduplicates", () => {
    expect(addOpenedThread(["thread-2", "thread-1"], "thread-1")).toEqual([
      "thread-1",
      "thread-2"
    ]);
  });

  it("caps opened threads by limit", () => {
    expect(addOpenedThread(["t2", "t1"], "t3", 2)).toEqual(["t3", "t2"]);
  });

  it("removes closed thread from opened list", () => {
    expect(removeOpenedThread(["thread-3", "thread-2", "thread-1"], "thread-2")).toEqual([
      "thread-3",
      "thread-1"
    ]);
  });
});
