const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
};

export type ThreadSummary = {
  id: string;
  preview: string;
};

export const parseThreadListResponse = (response: unknown): ThreadSummary[] => {
  const result = asRecord(response);
  return asArray(result?.data)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((thread) => {
      const id = typeof thread.id === "string" ? thread.id : "unknown-thread";
      const preview =
        typeof thread.preview === "string" && thread.preview.trim().length > 0
          ? thread.preview
          : "(empty thread)";
      return { id, preview };
    });
};
