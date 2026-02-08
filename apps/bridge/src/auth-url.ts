import { spawn, type SpawnOptions } from "node:child_process";

type OpenCommand = {
  command: string;
  args: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const isAllowedBrowserUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

export const extractChatgptAuthUrl = (message: unknown): string | null => {
  const record = asRecord(message);
  const result = asRecord(record?.result);
  if (!result || result.type !== "chatgpt") {
    return null;
  }

  const authUrl = typeof result.authUrl === "string" ? result.authUrl : null;
  if (!authUrl || !isAllowedBrowserUrl(authUrl)) {
    return null;
  }

  return authUrl;
};

const getOpenCommand = (
  url: string,
  platform: NodeJS.Platform = process.platform
): OpenCommand | null => {
  if (!isAllowedBrowserUrl(url)) {
    return null;
  }

  if (platform === "darwin") {
    return {
      command: "open",
      args: [url]
    };
  }

  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", url]
    };
  }

  if (platform === "linux") {
    return {
      command: "xdg-open",
      args: [url]
    };
  }

  return null;
};

export const openExternalUrl = (
  url: string,
  options?: {
    platform?: NodeJS.Platform;
    spawnImpl?: typeof spawn;
  }
): boolean => {
  const openCommand = getOpenCommand(url, options?.platform);
  if (!openCommand) {
    return false;
  }

  const spawnImpl = options?.spawnImpl ?? spawn;
  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: "ignore"
  };

  try {
    const child = spawnImpl(openCommand.command, openCommand.args, spawnOptions);
    child.unref();
    return true;
  } catch {
    return false;
  }
};

export const __test__ = {
  getOpenCommand
};
