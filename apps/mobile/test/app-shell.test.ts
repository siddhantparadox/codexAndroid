import { describe, expect, it } from "vitest";
import { APP_SCREENS, getScreenBadgeCount } from "../src/ui/app-shell";

describe("app-shell", () => {
  it("exposes stable screen order", () => {
    expect(APP_SCREENS.map((item) => item.key)).toEqual(["threads", "approvals", "settings"]);
  });

  it("returns badge counts by screen", () => {
    const counts = {
      pendingApprovals: 3,
      transcriptItems: 12,
      threadItems: 5
    };

    expect(getScreenBadgeCount("threads", counts)).toBe(5);
    expect(getScreenBadgeCount("approvals", counts)).toBe(3);
    expect(getScreenBadgeCount("settings", counts)).toBe(0);
  });
});
