export const COMMAND_APPROVAL_METHOD = "item/commandExecution/requestApproval";
export const FILE_CHANGE_APPROVAL_METHOD = "item/fileChange/requestApproval";

export type ApprovalRequestMethod =
  | typeof COMMAND_APPROVAL_METHOD
  | typeof FILE_CHANGE_APPROVAL_METHOD;

export type PendingApproval = {
  requestId: number;
  method: ApprovalRequestMethod;
  itemId: string;
  threadId: string;
  turnId: string;
  reason?: string;
  risk?: string;
  command?: string;
  cwd?: string;
  parsedCmdText?: string;
  changeCount?: number;
  changedPaths?: string[];
  diffText?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
};

const isApprovalRequestMethod = (value: string): value is ApprovalRequestMethod =>
  value === COMMAND_APPROVAL_METHOD || value === FILE_CHANGE_APPROVAL_METHOD;

const parsedCommandToText = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((token) => (typeof token === "string" ? token : ""))
      .filter((token) => token.length > 0)
      .join(" ");
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const executable = asNonEmptyString(record.executable);
  const args = Array.isArray(record.args)
    ? record.args.filter((arg): arg is string => typeof arg === "string")
    : [];

  if (!executable && args.length === 0) {
    return undefined;
  }

  return [executable, ...args].filter(Boolean).join(" ");
};

const diffValueToText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const keys = ["unified", "unifiedDiff", "patch", "text"];
  for (const key of keys) {
    const candidate = asNonEmptyString(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const parseFileChangeContext = (
  params: Record<string, unknown> | null
): Pick<PendingApproval, "changeCount" | "changedPaths" | "diffText"> => {
  const changes = Array.isArray(params?.changes)
    ? params.changes
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];

  const changedPaths = changes
    .map((change) => asNonEmptyString(change.path))
    .filter((path): path is string => Boolean(path));

  const inlineDiffs = changes
    .map((change) => diffValueToText(change.diff))
    .filter((diff): diff is string => Boolean(diff));

  const diffText =
    diffValueToText(params?.diff) ??
    (inlineDiffs.length > 0 ? inlineDiffs.join("\n\n") : undefined);

  return {
    changeCount: changes.length > 0 ? changes.length : undefined,
    changedPaths: changedPaths.length > 0 ? changedPaths : undefined,
    diffText
  };
};

export const parseApprovalRequest = (request: {
  id: number;
  method: string;
  params: unknown;
}): PendingApproval => {
  if (!isApprovalRequestMethod(request.method)) {
    throw new Error(`Unsupported approval method: ${request.method}`);
  }

  const params = asRecord(request.params);
  const itemId = asNonEmptyString(params?.itemId);
  const threadId = asNonEmptyString(params?.threadId);
  const turnId = asNonEmptyString(params?.turnId);

  if (!itemId || !threadId || !turnId) {
    throw new Error(`Invalid approval payload for method: ${request.method}`);
  }

  return {
    requestId: request.id,
    method: request.method,
    itemId,
    threadId,
    turnId,
    reason: asNonEmptyString(params?.reason),
    risk: asNonEmptyString(params?.risk),
    command: asNonEmptyString(params?.command),
    cwd: asNonEmptyString(params?.cwd),
    parsedCmdText: parsedCommandToText(params?.parsedCmd),
    ...parseFileChangeContext(params)
  };
};
