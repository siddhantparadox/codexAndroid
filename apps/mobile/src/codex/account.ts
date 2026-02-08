const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export type AccountSnapshot = {
  authMode: string;
  requiresOpenaiAuth: boolean;
};

export const parseAccountSnapshot = (result: unknown): AccountSnapshot => {
  const resultRecord = asRecord(result);
  const account = asRecord(resultRecord?.account);
  const requiresOpenaiAuth = Boolean(resultRecord?.requiresOpenaiAuth);
  const authMode =
    typeof account?.type === "string" ? account.type : account ? "unknown" : "none";

  return {
    authMode,
    requiresOpenaiAuth
  };
};

export type ChatgptLoginStartResult = {
  loginId: string;
  authUrl: string;
};

export const parseChatgptLoginStartResult = (
  result: unknown
): ChatgptLoginStartResult | null => {
  const record = asRecord(result);
  if (!record || record.type !== "chatgpt") {
    return null;
  }

  const loginId = typeof record.loginId === "string" ? record.loginId : null;
  const authUrl = typeof record.authUrl === "string" ? record.authUrl : null;
  if (!loginId || !authUrl) {
    return null;
  }

  return {
    loginId,
    authUrl
  };
};

export type LoginCompletedNotification = {
  loginId: string | null;
  success: boolean;
  error: string | null;
};

export const parseLoginCompletedNotification = (
  params: unknown
): LoginCompletedNotification | null => {
  const record = asRecord(params);
  if (!record || typeof record.success !== "boolean") {
    return null;
  }

  return {
    loginId: typeof record.loginId === "string" ? record.loginId : null,
    success: record.success,
    error: typeof record.error === "string" ? record.error : null
  };
};
