import { spawnSync } from "node:child_process";
import os from "node:os";

export type BridgeEndpoints = {
  lan?: string;
  tailscale?: string;
};

const isPrivateLanIPv4 = (ip: string): boolean => {
  if (ip.startsWith("10.")) {
    return true;
  }

  if (ip.startsWith("192.168.")) {
    return true;
  }

  if (ip.startsWith("172.")) {
    const secondPart = Number(ip.split(".")[1]);
    return secondPart >= 16 && secondPart <= 31;
  }

  return false;
};

const isTailscaleIPv4 = (ip: string): boolean => {
  if (!ip.startsWith("100.")) {
    return false;
  }

  const secondPart = Number(ip.split(".")[1]);
  return secondPart >= 64 && secondPart <= 127;
};

const toEndpoint = (ip: string, port: number): string => `ws://${ip}:${port}/ws`;

const normalizeDnsName = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\.$/, "");
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
};

const parseMagicDnsNameFromStatusJson = (raw: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const self =
    record.Self && typeof record.Self === "object" && !Array.isArray(record.Self)
      ? (record.Self as Record<string, unknown>)
      : null;

  return normalizeDnsName(self?.DNSName);
};

const readTailscaleMagicDnsName = (): string | undefined => {
  try {
    const result = spawnSync("tailscale", ["status", "--json"], {
      encoding: "utf8",
      timeout: 1500,
      windowsHide: true
    });

    if (result.error || result.status !== 0 || !result.stdout) {
      return undefined;
    }

    return parseMagicDnsNameFromStatusJson(result.stdout);
  } catch {
    return undefined;
  }
};

export const resolveBridgeEndpoints = (port: number): BridgeEndpoints => {
  const interfaces = os.networkInterfaces();

  let lan: string | undefined;
  let tailscaleIp: string | undefined;

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      if (!lan && isPrivateLanIPv4(address.address)) {
        lan = toEndpoint(address.address, port);
      }

      if (!tailscaleIp && isTailscaleIPv4(address.address)) {
        tailscaleIp = address.address;
      }
    }
  }

  const tailscaleMagicDns = readTailscaleMagicDnsName();
  const tailscaleHost = tailscaleMagicDns ?? tailscaleIp;
  const tailscale = tailscaleHost ? toEndpoint(tailscaleHost, port) : undefined;

  return { lan, tailscale };
};

export const __test__ = {
  isPrivateLanIPv4,
  isTailscaleIPv4,
  parseMagicDnsNameFromStatusJson,
  normalizeDnsName
};
