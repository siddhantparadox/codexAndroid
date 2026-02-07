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

export const resolveBridgeEndpoints = (port: number): BridgeEndpoints => {
  const interfaces = os.networkInterfaces();

  let lan: string | undefined;
  let tailscale: string | undefined;

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

      if (!tailscale && isTailscaleIPv4(address.address)) {
        tailscale = toEndpoint(address.address, port);
      }
    }
  }

  return { lan, tailscale };
};

export const __test__ = {
  isPrivateLanIPv4,
  isTailscaleIPv4
};