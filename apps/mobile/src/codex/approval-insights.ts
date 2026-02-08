import type { PendingApproval } from "./approvals";

export type ApprovalRiskLevel = "low" | "medium" | "high";

export type ApprovalRiskReasonCode =
  | "server_high_risk"
  | "server_caution"
  | "command_destructive"
  | "command_network_or_install"
  | "command_low_impact"
  | "file_large_change_set"
  | "file_multi_change_set"
  | "file_sensitive_paths"
  | "file_destructive_data_ops"
  | "file_missing_diff";

export type ApprovalRiskReason = {
  code: ApprovalRiskReasonCode;
  text: string;
  explainer: string;
};

export type ApprovalRiskSummary = {
  level: ApprovalRiskLevel;
  label: string;
  reasons: ApprovalRiskReason[];
};

const HIGH_RISK_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bdd\b/i,
  /\bmkfs\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsudo\b/i,
  /curl[^|\n\r]*\|\s*(bash|sh)\b/i,
  /invoke-webrequest[^|\n\r]*\|\s*iex\b/i
];

const MEDIUM_RISK_COMMAND_PATTERNS = [
  /\b(curl|wget)\b/i,
  /\b(npm|pnpm|yarn)\s+(install|add)\b/i,
  /\bpip\s+install\b/i,
  /\bapt(-get)?\s+install\b/i
];

const SENSITIVE_PATH_PATTERN =
  /(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.env|androidmanifest|build\.gradle|gradle\.properties|auth|security|permission|dockerfile|docker-compose|\.github)/i;

const HIGH_RISK_TEXT_PATTERN =
  /\b(high|critical|destructive|danger|unsafe|outside cwd|outside workspace|privileged)\b/i;

const MEDIUM_RISK_TEXT_PATTERN =
  /\b(moderate|network|install|write|modify|multiple files)\b/i;

const chooseHigherRisk = (
  current: ApprovalRiskLevel,
  next: ApprovalRiskLevel
): ApprovalRiskLevel => {
  const rank: Record<ApprovalRiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2
  };
  return rank[next] > rank[current] ? next : current;
};

const levelLabel = (level: ApprovalRiskLevel): string => {
  if (level === "high") {
    return "HIGH RISK";
  }
  if (level === "medium") {
    return "MEDIUM RISK";
  }
  return "LOW RISK";
};

const uniqueReasons = (reasons: ApprovalRiskReason[]): ApprovalRiskReason[] =>
  reasons.filter(
    (reason, index) =>
      reasons.findIndex((entry) => entry.code === reason.code) === index
  );

export const buildApprovalRiskSummary = (
  approval: PendingApproval,
  context?: { itemText?: string; diffText?: string }
): ApprovalRiskSummary => {
  const reasons: ApprovalRiskReason[] = [];
  let level: ApprovalRiskLevel = "low";
  const pushReason = (
    code: ApprovalRiskReasonCode,
    text: string,
    explainer: string
  ): void => {
    reasons.push({ code, text, explainer });
  };

  const commandText =
    approval.command ?? approval.parsedCmdText ?? context?.itemText ?? "";
  const reasonText = [approval.reason ?? "", approval.risk ?? ""].join(" ").trim();
  const diffText = context?.diffText ?? approval.diffText ?? "";

  if (HIGH_RISK_TEXT_PATTERN.test(reasonText)) {
    level = chooseHigherRisk(level, "high");
    pushReason(
      "server_high_risk",
      "Server flagged this request as high risk.",
      "Codex reported elevated risk metadata for this action. Treat it as a high-impact operation."
    );
  } else if (MEDIUM_RISK_TEXT_PATTERN.test(reasonText)) {
    level = chooseHigherRisk(level, "medium");
    pushReason(
      "server_caution",
      "Server flagged this request with a cautionary reason.",
      "Codex supplied cautionary metadata. Review command/diff details before approving."
    );
  }

  if (approval.method === "item/commandExecution/requestApproval") {
    if (HIGH_RISK_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText))) {
      level = chooseHigherRisk(level, "high");
      pushReason(
        "command_destructive",
        "Command includes destructive or privileged operations.",
        "Patterns such as force deletes, privilege escalation, or shell piping can irreversibly change the system."
      );
    } else if (MEDIUM_RISK_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText))) {
      level = chooseHigherRisk(level, "medium");
      pushReason(
        "command_network_or_install",
        "Command performs network or package-install actions.",
        "Network fetches and package installs can introduce external changes and dependency drift."
      );
    } else {
      pushReason(
        "command_low_impact",
        "Command appears read-oriented or low impact.",
        "No high-risk command patterns were detected. Still verify cwd and intent before approving."
      );
    }
  }

  if (approval.method === "item/fileChange/requestApproval") {
    const changeCount = approval.changeCount ?? 0;
    if (changeCount >= 10) {
      level = chooseHigherRisk(level, "high");
      pushReason(
        "file_large_change_set",
        `Large change set detected (${changeCount} files).`,
        "Large batches are harder to audit quickly and carry higher regression risk."
      );
    } else if (changeCount >= 4) {
      level = chooseHigherRisk(level, "medium");
      pushReason(
        "file_multi_change_set",
        `Multi-file edit detected (${changeCount} files).`,
        "Multi-file edits increase integration risk and should be reviewed with extra attention."
      );
    }

    const sensitiveFiles = (approval.changedPaths ?? []).filter((path) =>
      SENSITIVE_PATH_PATTERN.test(path)
    );
    if (sensitiveFiles.length > 0) {
      level = chooseHigherRisk(level, "medium");
      pushReason(
        "file_sensitive_paths",
        "Touches config or sensitive project files.",
        "Config, auth, build, and environment files can affect runtime behavior beyond the immediate feature."
      );
    }

    if (/\bdrop table\b/i.test(diffText) || /\bdelete from\b/i.test(diffText)) {
      level = chooseHigherRisk(level, "high");
      pushReason(
        "file_destructive_data_ops",
        "Diff includes potentially destructive data operations.",
        "Detected SQL-like destructive patterns that may remove or mutate persisted data."
      );
    }

    if (changeCount === 0 && !diffText.trim()) {
      pushReason(
        "file_missing_diff",
        "Diff details are not fully available yet.",
        "Approval arrived before complete diff context was available. Consider waiting for more context."
      );
    }
  }

  return {
    level,
    label: levelLabel(level),
    reasons: uniqueReasons(reasons)
  };
};
