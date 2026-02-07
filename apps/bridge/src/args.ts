import crypto from "node:crypto";

export type BridgeArgs = {
  host: string;
  port: number;
  token: string;
  name: string;
  cwd: string;
  codexBin: string;
};

const parseFlag = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  return argv[index + 1];
};

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return 8787;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }

  return port;
};

const parseToken = (value: string | undefined): string => {
  if (value) {
    return value;
  }

  return crypto.randomBytes(24).toString("base64url");
};

export const parseBridgeArgs = (argv: string[], cwd: string): BridgeArgs => {
  const host = parseFlag(argv, "--host") ?? "0.0.0.0";
  const port = parsePort(parseFlag(argv, "--port"));
  const token = parseToken(parseFlag(argv, "--token"));
  const name = parseFlag(argv, "--name") ?? "Codex Mobile Bridge";
  const codexBin = parseFlag(argv, "--codex-bin") ?? "codex";

  return {
    host,
    port,
    token,
    name,
    cwd,
    codexBin
  };
};