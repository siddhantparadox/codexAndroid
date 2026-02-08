import type {
  ConnectionAttempt,
  ConnectionAttemptFailure,
  EndpointType
} from "./connect";

const endpointLabel = (endpointType: EndpointType): string =>
  endpointType === "tailscale" ? "Tailnet" : "LAN";

export const describeAttemptReason = (
  endpointType: EndpointType,
  reason: string
): string => {
  if (reason === "endpoint_unavailable") {
    return `${endpointLabel(endpointType)} endpoint is not configured in this pairing payload.`;
  }

  if (reason === "timeout") {
    return `${endpointLabel(endpointType)} timed out while connecting.`;
  }

  if (reason === "socket_error") {
    return `${endpointLabel(endpointType)} socket error during handshake.`;
  }

  if (reason.startsWith("closed_")) {
    const code = reason.replace("closed_", "");
    if (code === "4401" || code === "401") {
      return "Pairing token was rejected by bridge. Re-scan QR from the bridge.";
    }
    if (code === "409") {
      return "Bridge already has an active phone connection.";
    }
    return `${endpointLabel(endpointType)} connection closed (${code}).`;
  }

  return `${endpointLabel(endpointType)} failed (${reason}).`;
};

const hasReason = (
  attempts: ConnectionAttemptFailure[] | ConnectionAttempt[],
  endpointType: EndpointType,
  reason: string
): boolean => attempts.some((attempt) => attempt.endpointType === endpointType && attempt.reason === reason);

export const buildConnectionHint = (
  attempts: ConnectionAttemptFailure[] | ConnectionAttempt[]
): string => {
  if (attempts.length === 0) {
    return "No endpoints were attempted. Verify pairing payload endpoints.";
  }

  if (attempts.some((attempt) => attempt.reason === "closed_4401" || attempt.reason === "closed_401")) {
    return "Pairing token is invalid. Re-pair by scanning a fresh QR.";
  }

  if (attempts.some((attempt) => attempt.reason === "closed_409")) {
    return "Another phone is connected to this bridge. Disconnect it or restart bridge.";
  }

  const lanFailed = attempts.some(
    (attempt) => attempt.endpointType === "lan" && attempt.reason !== "endpoint_unavailable"
  );
  const tailFailed = attempts.some(
    (attempt) => attempt.endpointType === "tailscale" && attempt.reason !== "endpoint_unavailable"
  );

  if (
    hasReason(attempts, "lan", "endpoint_unavailable") &&
    hasReason(attempts, "tailscale", "endpoint_unavailable")
  ) {
    return "Pairing payload has no LAN/Tailnet endpoints. Re-scan bridge QR.";
  }

  if (lanFailed && tailFailed) {
    return "LAN and Tailnet both failed. Check computer power, bridge process, Wi-Fi, and Tailscale status.";
  }

  if (lanFailed) {
    return "LAN connection failed. Ensure phone and computer are on the same Wi-Fi and bridge is running.";
  }

  if (tailFailed) {
    return "Tailnet connection failed. Ensure Tailscale is connected on phone and computer.";
  }

  return "Connection failed. Verify bridge status and pairing details.";
};

export const formatAttemptSummary = (
  attempt: ConnectionAttemptFailure | ConnectionAttempt
): string => {
  if ("success" in attempt && attempt.success) {
    return `${endpointLabel(attempt.endpointType)} connected in ${attempt.durationMs}ms`;
  }

  return describeAttemptReason(attempt.endpointType, attempt.reason ?? "unknown");
};
