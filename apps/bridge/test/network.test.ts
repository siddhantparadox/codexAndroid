import { describe, expect, it } from "vitest";
import { __test__ } from "../src/network.js";

describe("network classifiers", () => {
  it("classifies private LAN ranges", () => {
    expect(__test__.isPrivateLanIPv4("10.1.2.3")).toBe(true);
    expect(__test__.isPrivateLanIPv4("172.16.0.1")).toBe(true);
    expect(__test__.isPrivateLanIPv4("192.168.1.2")).toBe(true);
    expect(__test__.isPrivateLanIPv4("8.8.8.8")).toBe(false);
  });

  it("classifies tailscale range", () => {
    expect(__test__.isTailscaleIPv4("100.64.0.1")).toBe(true);
    expect(__test__.isTailscaleIPv4("100.127.255.255")).toBe(true);
    expect(__test__.isTailscaleIPv4("100.63.0.1")).toBe(false);
    expect(__test__.isTailscaleIPv4("101.64.0.1")).toBe(false);
  });

  it("parses magicdns hostname from tailscale status json", () => {
    const raw = JSON.stringify({
      Self: {
        DNSName: "workstation.tail123.ts.net."
      }
    });
    expect(__test__.parseMagicDnsNameFromStatusJson(raw)).toBe(
      "workstation.tail123.ts.net"
    );
  });

  it("normalizes dns names", () => {
    expect(__test__.normalizeDnsName("host.tail.ts.net.")).toBe("host.tail.ts.net");
    expect(__test__.normalizeDnsName("")).toBeUndefined();
    expect(__test__.normalizeDnsName(42)).toBeUndefined();
  });
});
