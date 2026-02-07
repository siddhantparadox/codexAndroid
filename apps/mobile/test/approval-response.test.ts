import { describe, expect, it } from "vitest";
import { buildApprovalResponse } from "../src/codex/approval-response";
import {
  COMMAND_APPROVAL_METHOD,
  FILE_CHANGE_APPROVAL_METHOD
} from "../src/codex/approvals";

describe("buildApprovalResponse", () => {
  it("returns simple decline payload", () => {
    const result = buildApprovalResponse({
      method: COMMAND_APPROVAL_METHOD,
      decision: "decline",
      commandAcceptSettingsJson: '{"policy":"alwaysAllow"}'
    });

    expect(result).toEqual({ decision: "decline" });
  });

  it("ignores acceptSettings for file change approvals", () => {
    const result = buildApprovalResponse({
      method: FILE_CHANGE_APPROVAL_METHOD,
      decision: "accept",
      commandAcceptSettingsJson: '{"policy":"alwaysAllow"}'
    });

    expect(result).toEqual({ decision: "accept" });
  });

  it("attaches parsed acceptSettings for command approvals", () => {
    const result = buildApprovalResponse({
      method: COMMAND_APPROVAL_METHOD,
      decision: "accept",
      commandAcceptSettingsJson: '{"policy":"alwaysAllow","scope":"command"}'
    });

    expect(result).toEqual({
      decision: "accept",
      acceptSettings: {
        policy: "alwaysAllow",
        scope: "command"
      }
    });
  });

  it("throws when acceptSettings is invalid JSON", () => {
    expect(() =>
      buildApprovalResponse({
        method: COMMAND_APPROVAL_METHOD,
        decision: "accept",
        commandAcceptSettingsJson: "{bad}"
      })
    ).toThrow(/valid json/i);
  });

  it("throws when acceptSettings JSON is not an object", () => {
    expect(() =>
      buildApprovalResponse({
        method: COMMAND_APPROVAL_METHOD,
        decision: "accept",
        commandAcceptSettingsJson: "[]"
      })
    ).toThrow(/must be an object/i);
  });
});
