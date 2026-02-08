import { describe, expect, it } from "vitest";
import { APP_SCREENS, getScreenBadgeCount } from "../src/ui/app-shell";

describe("app-shell", () => {
  it("exposes stable screen order", () => {
    expect(APP_SCREENS.map((item) => item.key)).toEqual([
      "connect",
      "turn",
      "approvals",
      "transcript"
    ]);
  });

  it("returns badge counts by screen", () => {
    const counts = {
      pendingApprovals: 3,
      transcriptItems: 12,
      threadItems: 5
    };

    expect(getScreenBadgeCount("connect", counts)).toBe(0);
    expect(getScreenBadgeCount("turn", counts)).toBe(5);
    expect(getScreenBadgeCount("approvals", counts)).toBe(3);
    expect(getScreenBadgeCount("transcript", counts)).toBe(12);
  });
});
