import { describe, expect, it } from "vitest";
import { getMachinePanelPlacement } from "../src/ui/machine-panel";

describe("machine-panel", () => {
  it("keeps machines out of threads when connected", () => {
    expect(getMachinePanelPlacement(true)).toEqual({
      showInThreads: false,
      showInSettings: true
    });
  });

  it("keeps machines visible in threads when disconnected", () => {
    expect(getMachinePanelPlacement(false)).toEqual({
      showInThreads: true,
      showInSettings: true
    });
  });
});
