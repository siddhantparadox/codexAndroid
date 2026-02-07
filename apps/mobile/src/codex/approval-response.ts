import { COMMAND_APPROVAL_METHOD, type ApprovalRequestMethod } from "./approvals";

export type ApprovalDecision = "accept" | "decline";

export type ApprovalResponsePayload = {
  decision: ApprovalDecision;
  acceptSettings?: Record<string, unknown>;
};

const asObjectRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export const buildApprovalResponse = (input: {
  method: ApprovalRequestMethod;
  decision: ApprovalDecision;
  commandAcceptSettingsJson?: string;
}): ApprovalResponsePayload => {
  if (input.decision === "decline" || input.method !== COMMAND_APPROVAL_METHOD) {
    return { decision: input.decision };
  }

  const rawSettings = input.commandAcceptSettingsJson?.trim() ?? "";
  if (!rawSettings) {
    return { decision: input.decision };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSettings);
  } catch {
    throw new Error("acceptSettings must be valid JSON.");
  }

  const acceptSettings = asObjectRecord(parsed);
  if (!acceptSettings) {
    throw new Error("acceptSettings JSON must be an object.");
  }

  return {
    decision: input.decision,
    acceptSettings
  };
};
