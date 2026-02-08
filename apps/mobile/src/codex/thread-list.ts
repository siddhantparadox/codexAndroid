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
  modelProvider: string | null;
  sourceKind: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  archived: boolean;
};

export type ThreadListPage = {
  data: ThreadSummary[];
  nextCursor: string | null;
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

export const parseThreadListPageResponse = (response: unknown): ThreadListPage => {
  const result = asRecord(response);
  const data = asArray(result?.data)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((thread) => {
      const id = typeof thread.id === "string" ? thread.id : "unknown-thread";
      const preview =
        typeof thread.preview === "string" && thread.preview.trim().length > 0
          ? thread.preview
          : "(empty thread)";
      const modelProvider =
        typeof thread.modelProvider === "string" ? thread.modelProvider : null;
      const sourceKind =
        typeof thread.sourceKind === "string" ? thread.sourceKind : null;
      const createdAt = parseTimestamp(thread.createdAt);
      const updatedAt = parseTimestamp(thread.updatedAt);
      const archived = thread.archived === true;

      return {
        id,
        preview,
        modelProvider,
        sourceKind,
        createdAt,
        updatedAt,
        archived
      };
    });

  const nextCursor = typeof result?.nextCursor === "string" ? result.nextCursor : null;
  return { data, nextCursor };
};

export const parseThreadListResponse = (response: unknown): ThreadSummary[] =>
  parseThreadListPageResponse(response).data;
