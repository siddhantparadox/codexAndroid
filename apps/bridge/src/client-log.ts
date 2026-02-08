import type { BridgePayload } from "@codex-mobile/protocol";

type BridgeClientLogPayload = Extract<BridgePayload, { type: "clientLog" }>;

type ClientLogWriter = {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export const formatClientLogLine = (payload: BridgeClientLogPayload): string => {
  const stamp = Number.isFinite(payload.timestamp)
    ? new Date(payload.timestamp).toISOString()
    : new Date().toISOString();
  const contextSuffix =
    payload.context && Object.keys(payload.context).length > 0
      ? ` ${JSON.stringify(payload.context)}`
      : "";

  return `[mobile:${payload.level}] [${payload.source}] ${stamp} ${payload.message}${contextSuffix}`;
};

export const writeClientLog = (
  payload: BridgeClientLogPayload,
  writer: ClientLogWriter = console
): void => {
  const line = formatClientLogLine(payload);
  if (payload.level === "error") {
    writer.error(line);
    return;
  }

  if (payload.level === "warn") {
    writer.warn(line);
    return;
  }

  writer.log(line);
};

