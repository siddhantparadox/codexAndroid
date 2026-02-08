export const OPEN_THREAD_LIMIT = 10;

export const addOpenedThread = (
  threadIds: string[],
  threadId: string,
  limit = OPEN_THREAD_LIMIT
): string[] => {
  if (!threadId) {
    return threadIds;
  }

  const next = [threadId, ...threadIds.filter((entry) => entry !== threadId)];
  return next.slice(0, Math.max(1, limit));
};

export const removeOpenedThread = (
  threadIds: string[],
  threadId: string
): string[] => threadIds.filter((entry) => entry !== threadId);
