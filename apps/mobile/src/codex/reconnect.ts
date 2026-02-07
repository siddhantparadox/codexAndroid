export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 15000;

export const computeReconnectDelayMs = (attempt: number): number => {
  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(1, attempt) : 1;
  const exponentialDelay = RECONNECT_BASE_DELAY_MS * 2 ** (normalizedAttempt - 1);
  return Math.min(exponentialDelay, RECONNECT_MAX_DELAY_MS);
};
