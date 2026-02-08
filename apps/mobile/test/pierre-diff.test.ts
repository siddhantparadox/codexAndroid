import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/codex/pierre-diff";

describe("parseUnifiedDiff", () => {
  it("parses unified diff with line numbers and counts", () => {
    const diff = [
      "diff --git a/apps/mobile/App.tsx b/apps/mobile/App.tsx",
      "--- a/apps/mobile/App.tsx",
      "+++ b/apps/mobile/App.tsx",
      "@@ -10,3 +10,4 @@",
      " const before = true;",
      "-const oldValue = 1;",
      "+const oldValue = 2;",
      "+const added = 'yes';"
    ].join("\n");

    const parsed = parseUnifiedDiff(diff);

    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.displayPath).toBe("apps/mobile/App.tsx");
    expect(parsed.totalAdded).toBe(2);
    expect(parsed.totalDeleted).toBe(1);
    expect(parsed.totalContext).toBe(1);
    expect(parsed.files[0]?.hunks[0]?.lines[1]).toMatchObject({
      kind: "delete",
      oldLine: 11,
      newLine: null,
      text: "const oldValue = 1;"
    });
  });

  it("marks output truncated when file count exceeds configured cap", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/b.txt b/b.txt",
      "--- a/b.txt",
      "+++ b/b.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");

    const parsed = parseUnifiedDiff(diff, { maxFiles: 1 });
    expect(parsed.files).toHaveLength(1);
    expect(parsed.truncated).toBe(true);
  });
});
