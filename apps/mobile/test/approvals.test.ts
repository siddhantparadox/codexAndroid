import { describe, expect, it } from "vitest";
import {
  COMMAND_APPROVAL_METHOD,
  FILE_CHANGE_APPROVAL_METHOD,
  parseApprovalRequest
} from "../src/codex/approvals";

describe("parseApprovalRequest", () => {
  it("parses command approval payload with parsed command object", () => {
    const parsed = parseApprovalRequest({
      id: 11,
      method: COMMAND_APPROVAL_METHOD,
      params: {
        itemId: "cmd_1",
        threadId: "thread_1",
        turnId: "turn_1",
        reason: "writes outside cwd",
        parsedCmd: {
          executable: "git",
          args: ["status", "--short"]
        }
      }
    });

    expect(parsed.requestId).toBe(11);
    expect(parsed.itemId).toBe("cmd_1");
    expect(parsed.reason).toBe("writes outside cwd");
    expect(parsed.parsedCmdText).toBe("git status --short");
  });

  it("parses file change approval payload", () => {
    const parsed = parseApprovalRequest({
      id: 21,
      method: FILE_CHANGE_APPROVAL_METHOD,
      params: {
        itemId: "change_1",
        threadId: "thread_2",
        turnId: "turn_2",
        reason: "edits multiple files",
        changes: [
          {
            path: "apps/mobile/App.tsx",
            kind: "edit",
            diff: "@@ -1 +1 @@\n-old\n+new\n"
          },
          {
            path: "package.json",
            kind: "edit"
          }
        ]
      }
    });

    expect(parsed.method).toBe(FILE_CHANGE_APPROVAL_METHOD);
    expect(parsed.itemId).toBe("change_1");
    expect(parsed.threadId).toBe("thread_2");
    expect(parsed.turnId).toBe("turn_2");
    expect(parsed.changeCount).toBe(2);
    expect(parsed.changedPaths).toContain("apps/mobile/App.tsx");
    expect(parsed.diffText).toContain("@@ -1 +1 @@");
  });

  it("throws on unknown approval method", () => {
    expect(() =>
      parseApprovalRequest({
        id: 99,
        method: "item/unknown/requestApproval",
        params: {
          itemId: "x",
          threadId: "y",
          turnId: "z"
        }
      })
    ).toThrow(/unsupported approval method/i);
  });

  it("throws when required ids are missing", () => {
    expect(() =>
      parseApprovalRequest({
        id: 100,
        method: COMMAND_APPROVAL_METHOD,
        params: {
          itemId: "",
          threadId: "thread_1",
          turnId: "turn_1"
        }
      })
    ).toThrow(/invalid approval payload/i);
  });
});
