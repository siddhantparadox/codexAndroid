import { describe, expect, it } from "vitest";
import {
  buildApprovalRiskSummary,
  type ApprovalRiskLevel
} from "../src/codex/approval-insights";
import {
  COMMAND_APPROVAL_METHOD,
  FILE_CHANGE_APPROVAL_METHOD,
  type PendingApproval
} from "../src/codex/approvals";

const baseApproval = (
  method: PendingApproval["method"]
): PendingApproval => ({
  requestId: 1,
  method,
  itemId: "item_1",
  threadId: "thread_1",
  turnId: "turn_1"
});

const expectRisk = (level: ApprovalRiskLevel, actual: ApprovalRiskLevel): void => {
  expect(actual).toBe(level);
};

describe("buildApprovalRiskSummary", () => {
  it("marks destructive command patterns as high risk", () => {
    const summary = buildApprovalRiskSummary({
      ...baseApproval(COMMAND_APPROVAL_METHOD),
      parsedCmdText: "rm -rf /tmp/build"
    });

    expectRisk("high", summary.level);
    expect(summary.reasons.map((reason) => reason.text).join(" ")).toMatch(
      /destructive|privileged/i
    );
    expect(summary.reasons[0]?.explainer).toBeTruthy();
  });

  it("marks multi-file sensitive file changes as medium risk", () => {
    const summary = buildApprovalRiskSummary({
      ...baseApproval(FILE_CHANGE_APPROVAL_METHOD),
      changeCount: 5,
      changedPaths: ["apps/mobile/App.tsx", "package.json", "pnpm-lock.yaml"]
    });

    expectRisk("medium", summary.level);
    expect(summary.reasons.map((reason) => reason.text).join(" ")).toMatch(
      /multi-file|sensitive/i
    );
  });

  it("uses low risk when signal is minimal", () => {
    const summary = buildApprovalRiskSummary({
      ...baseApproval(COMMAND_APPROVAL_METHOD),
      parsedCmdText: "git status --short"
    });

    expectRisk("low", summary.level);
  });
});
