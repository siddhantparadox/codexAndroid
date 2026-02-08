import type { BridgeControlMessage } from "@codex-mobile/protocol";

type IntervalHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

type HeartbeatOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  maxConsecutiveTimeouts?: number;
  now?: () => number;
  scheduleInterval?: (callback: () => void, delayMs: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  scheduleTimeout?: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout?: (handle: TimeoutHandle) => void;
  onLatencySample?: (latencyMs: number) => void;
  onTimeout?: (consecutiveTimeouts: number) => void;
  onRecovered?: () => void;
  onMaxTimeouts?: (consecutiveTimeouts: number) => void;
};

export type BridgeHeartbeatController = {
  handleBridgeMessage: (message: BridgeControlMessage) => void;
  stop: () => void;
};

const DEFAULT_INTERVAL_MS = 12_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_TIMEOUTS = 2;

export const createBridgeHeartbeat = (
  sendBridgeControl: (message: BridgeControlMessage) => void,
  options: HeartbeatOptions = {}
): BridgeHeartbeatController => {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxConsecutiveTimeouts =
    options.maxConsecutiveTimeouts ?? DEFAULT_MAX_TIMEOUTS;

  if (intervalMs <= 0) {
    throw new Error("Heartbeat interval must be greater than zero.");
  }
  if (timeoutMs <= 0) {
    throw new Error("Heartbeat timeout must be greater than zero.");
  }
  if (maxConsecutiveTimeouts <= 0) {
    throw new Error("Heartbeat maxConsecutiveTimeouts must be greater than zero.");
  }

  const now = options.now ?? Date.now;
  const scheduleInterval = options.scheduleInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? clearTimeout;

  let stopped = false;
  let pendingToken: number | null = null;
  let pendingSentAtMs: number | null = null;
  let pendingTimeout: TimeoutHandle | null = null;
  let consecutiveTimeouts = 0;

  const clearPendingTimeout = (): void => {
    if (!pendingTimeout) {
      return;
    }
    clearTimeoutFn(pendingTimeout);
    pendingTimeout = null;
  };

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearPendingTimeout();
    clearIntervalFn(intervalHandle);
    pendingToken = null;
    pendingSentAtMs = null;
  };

  const registerTimeout = (): void => {
    if (pendingToken === null) {
      return;
    }

    const token = pendingToken;
    pendingTimeout = scheduleTimeout(() => {
      if (stopped || pendingToken !== token) {
        return;
      }
      pendingToken = null;
      pendingSentAtMs = null;
      pendingTimeout = null;
      consecutiveTimeouts += 1;
      options.onTimeout?.(consecutiveTimeouts);
      if (consecutiveTimeouts >= maxConsecutiveTimeouts) {
        options.onMaxTimeouts?.(consecutiveTimeouts);
        stop();
      }
    }, timeoutMs);
  };

  const sendPing = (): void => {
    if (stopped || pendingToken !== null) {
      return;
    }

    const token = now();
    pendingToken = token;
    pendingSentAtMs = token;

    try {
      sendBridgeControl({
        __bridge: {
          type: "ping",
          t: token
        }
      });
    } catch {
      pendingToken = null;
      pendingSentAtMs = null;
      consecutiveTimeouts += 1;
      options.onTimeout?.(consecutiveTimeouts);
      if (consecutiveTimeouts >= maxConsecutiveTimeouts) {
        options.onMaxTimeouts?.(consecutiveTimeouts);
        stop();
      }
      return;
    }
    registerTimeout();
  };

  const intervalHandle = scheduleInterval(() => {
    sendPing();
  }, intervalMs);

  sendPing();

  return {
    handleBridgeMessage: (message): void => {
      if (stopped || message.__bridge.type !== "pong") {
        return;
      }
      if (pendingToken === null || pendingSentAtMs === null) {
        return;
      }
      if (message.__bridge.t !== pendingToken) {
        return;
      }

      clearPendingTimeout();
      pendingToken = null;
      const latencyMs = Math.max(1, now() - pendingSentAtMs);
      pendingSentAtMs = null;

      const recovered = consecutiveTimeouts > 0;
      consecutiveTimeouts = 0;
      options.onLatencySample?.(latencyMs);
      if (recovered) {
        options.onRecovered?.();
      }
    },
    stop
  };
};
