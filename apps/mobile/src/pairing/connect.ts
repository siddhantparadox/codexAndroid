import type { PairingPayload } from "@codex-mobile/protocol";

export type EndpointType = "lan" | "tailscale";

type SocketLike = {
  onopen: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  close: (code?: number) => void;
};

type WebSocketCtor = new (url: string) => SocketLike;

export type ConnectionAttemptFailure = {
  endpointType: EndpointType;
  url: string;
  reason: string;
  durationMs: number;
  timestampMs: number;
};

export type ConnectionAttempt = {
  endpointType: EndpointType;
  url: string;
  success: boolean;
  reason: string | null;
  durationMs: number;
  timestampMs: number;
};

export class ConnectionFallbackError extends Error {
  attempts: ConnectionAttemptFailure[];

  constructor(attempts: ConnectionAttemptFailure[]) {
    const reasons = attempts
      .map((attempt) => `${attempt.endpointType}: ${attempt.reason}`)
      .join(" | ");
    super(`Unable to connect to bridge (${reasons})`);
    this.name = "ConnectionFallbackError";
    this.attempts = attempts;
  }
}

export type ConnectionResult = {
  endpointType: EndpointType;
  url: string;
  socket: SocketLike;
  attempts: ConnectionAttempt[];
};

type ConnectOptions = {
  payload: PairingPayload;
  timeoutMs?: number;
  WebSocketImplementation?: WebSocketCtor;
};

const DEFAULT_TIMEOUT_MS = 2000;

const appendToken = (endpoint: string, token: string): string => {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}token=${encodeURIComponent(token)}`;
};

const connectOnce = (
  endpointType: EndpointType,
  endpoint: string,
  token: string,
  timeoutMs: number,
  WebSocketImplementation: WebSocketCtor
): Promise<ConnectionResult> => {
  const url = appendToken(endpoint, token);
  const startedAtMs = Date.now();
  const socket = new WebSocketImplementation(url);

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
    };

    const finalizeError = (reason: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject({
        endpointType,
        url,
        reason,
        durationMs: Math.max(0, Date.now() - startedAtMs),
        timestampMs: Date.now()
      } satisfies ConnectionAttemptFailure);
    };

    const timeout = setTimeout(() => {
      socket.close(4000);
      finalizeError("timeout");
    }, timeoutMs);

    socket.onopen = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve({
        endpointType,
        url,
        socket,
        attempts: [
          {
            endpointType,
            url,
            success: true,
            reason: null,
            durationMs: Math.max(0, Date.now() - startedAtMs),
            timestampMs: Date.now()
          }
        ]
      });
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      finalizeError("socket_error");
    };

    socket.onclose = (event) => {
      clearTimeout(timeout);
      finalizeError(`closed_${String(event.code ?? "unknown")}`);
    };
  });
};

export const connectWithEndpointFallback = async (
  options: ConnectOptions
): Promise<ConnectionResult> => {
  const { payload, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const WebSocketImplementation =
    options.WebSocketImplementation ??
    // RN and browser runtime provide WebSocket globally.
    (globalThis.WebSocket as unknown as WebSocketCtor);

  if (!WebSocketImplementation) {
    throw new Error("WebSocket is not available in this runtime");
  }

  const attempts: ConnectionAttemptFailure[] = [];
  const orderedEndpoints: Array<[EndpointType, string | undefined]> = [
    ["lan", payload.endpoints.lan],
    ["tailscale", payload.endpoints.tailscale]
  ];

  for (const [endpointType, endpoint] of orderedEndpoints) {
    if (!endpoint) {
      attempts.push({
        endpointType,
        url: "",
        reason: "endpoint_unavailable",
        durationMs: 0,
        timestampMs: Date.now()
      });
      continue;
    }

    try {
      const connection = await connectOnce(
        endpointType,
        endpoint,
        payload.token,
        timeoutMs,
        WebSocketImplementation
      );
      return {
        ...connection,
        attempts: [
          ...attempts.map((attempt) => ({
            endpointType: attempt.endpointType,
            url: attempt.url,
            success: false,
            reason: attempt.reason,
            durationMs: attempt.durationMs,
            timestampMs: attempt.timestampMs
          })),
          ...connection.attempts
        ]
      };
    } catch (caughtError) {
      attempts.push(caughtError as ConnectionAttemptFailure);
    }
  }

  throw new ConnectionFallbackError(attempts);
};
