import type { PendingApproval } from "./approvals";

export type ApprovalRiskLevel = "low" | "medium" | "high";

export type ApprovalRiskSummary = {
  level: ApprovalRiskLevel;
  label: string;
  reasons: string[];
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

const uniqueReasons = (reasons: string[]): string[] =>
  reasons.filter((reason, index) => reasons.indexOf(reason) === index);

export const buildApprovalRiskSummary = (
  approval: PendingApproval,
  context?: { itemText?: string; diffText?: string }
): ApprovalRiskSummary => {
  const reasons: string[] = [];
  let level: ApprovalRiskLevel = "low";

  const commandText =
    approval.command ?? approval.parsedCmdText ?? context?.itemText ?? "";
  const reasonText = [approval.reason ?? "", approval.risk ?? ""].join(" ").trim();
  const diffText = context?.diffText ?? approval.diffText ?? "";

  if (HIGH_RISK_TEXT_PATTERN.test(reasonText)) {
    level = chooseHigherRisk(level, "high");
    reasons.push("Server flagged this request as high risk.");
  } else if (MEDIUM_RISK_TEXT_PATTERN.test(reasonText)) {
    level = chooseHigherRisk(level, "medium");
    reasons.push("Server flagged this request with a cautionary reason.");
  }

  if (approval.method === "item/commandExecution/requestApproval") {
    if (HIGH_RISK_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText))) {
      level = chooseHigherRisk(level, "high");
      reasons.push("Command includes destructive or privileged operations.");
    } else if (MEDIUM_RISK_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText))) {
      level = chooseHigherRisk(level, "medium");
      reasons.push("Command performs network or package-install actions.");
    } else {
      reasons.push("Command appears read-oriented or low impact.");
    }
  }

  if (approval.method === "item/fileChange/requestApproval") {
    const changeCount = approval.changeCount ?? 0;
    if (changeCount >= 10) {
      level = chooseHigherRisk(level, "high");
      reasons.push(`Large change set detected (${changeCount} files).`);
    } else if (changeCount >= 4) {
      level = chooseHigherRisk(level, "medium");
      reasons.push(`Multi-file edit detected (${changeCount} files).`);
    }

    const sensitiveFiles = (approval.changedPaths ?? []).filter((path) =>
      SENSITIVE_PATH_PATTERN.test(path)
    );
    if (sensitiveFiles.length > 0) {
      level = chooseHigherRisk(level, "medium");
      reasons.push("Touches config or sensitive project files.");
    }

    if (/\bdrop table\b/i.test(diffText) || /\bdelete from\b/i.test(diffText)) {
      level = chooseHigherRisk(level, "high");
      reasons.push("Diff includes potentially destructive data operations.");
    }

    if (changeCount === 0 && !diffText.trim()) {
      reasons.push("Diff details are not fully available yet.");
    }
  }

  return {
    level,
    label: levelLabel(level),
    reasons: uniqueReasons(reasons)
  };
};

