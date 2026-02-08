import { CodexRpcClient } from "./rpc-client";
import { parseAccountSnapshot } from "./account";
import {
  parseThreadListPageResponse,
  type ThreadSummary
} from "./thread-list";

export type ModelSummary = {
  id: string;
  displayName: string;
};

export type BootstrapSnapshot = {
  requiresOpenaiAuth: boolean;
  authMode: string;
  modelCount: number;
  models: ModelSummary[];
  threadCount: number;
  threads: ThreadSummary[];
  threadNextCursor: string | null;
};

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

export const initializeAndBootstrap = async (
  client: CodexRpcClient
): Promise<BootstrapSnapshot> => {
  await client.initialize({
    name: "codex_mobile",
    title: "Codex Mobile",
    version: "0.1.0"
  });

  const accountSnapshot = parseAccountSnapshot(
    await client.request("account/read", { refreshToken: false })
  );

  const modelsResult = asRecord(await client.request("model/list", { limit: 20 }));
  const modelData = asArray(modelsResult?.data)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((model) => {
      const id =
        typeof model.id === "string"
          ? model.id
          : typeof model.model === "string"
            ? model.model
            : "unknown-model";
      const displayName =
        typeof model.displayName === "string" ? model.displayName : id;
      return { id, displayName };
    });

  const threadResult = asRecord(
    await client.request("thread/list", {
      limit: 20,
      sortKey: "updated_at"
    })
  );
  const threadPage = parseThreadListPageResponse(threadResult);

  return {
    requiresOpenaiAuth: accountSnapshot.requiresOpenaiAuth,
    authMode: accountSnapshot.authMode,
    modelCount: modelData.length,
    models: modelData,
    threadCount: threadPage.data.length,
    threads: threadPage.data,
    threadNextCursor: threadPage.nextCursor
  };
};
