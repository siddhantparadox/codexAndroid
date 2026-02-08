export type TranscriptItem = {
  id: string;
  type:
    | "userMessage"
    | "agentMessage"
    | "commandExecution"
    | "fileChange"
    | "plan"
    | "diff"
    | "toolCall"
    | "reasoning"
    | "system";
  title: string;
  text: string;
  status?: string;
};

export type SessionTurnStatus =
  | "idle"
  | "inProgress"
  | "completed"
  | "failed"
  | "interrupted";

export type CodexSessionState = {
  activeThreadId: string | null;
  activeTurnId: string | null;
  turnStatus: SessionTurnStatus;
  transcript: TranscriptItem[];
  localMessageCounter: number;
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

const upsertTranscriptItem = (
  transcript: TranscriptItem[],
  nextItem: TranscriptItem
): TranscriptItem[] => {
  const index = transcript.findIndex((item) => item.id === nextItem.id);
  if (index < 0) {
    return [...transcript, nextItem];
  }

  const copy = [...transcript];
  copy[index] = {
    ...copy[index],
    ...nextItem
  };
  return copy;
};

const appendTranscriptText = (
  transcript: TranscriptItem[],
  itemId: string,
  fallbackType: TranscriptItem["type"],
  fallbackTitle: string,
  delta: string
): TranscriptItem[] => {
  const index = transcript.findIndex((item) => item.id === itemId);
  if (index < 0) {
    return [
      ...transcript,
      {
        id: itemId,
        type: fallbackType,
        title: fallbackTitle,
        text: delta
      }
    ];
  }

  const copy = [...transcript];
  copy[index] = {
    ...copy[index],
    text: `${copy[index].text}${delta}`
  };
  return copy;
};

const userContentToText = (item: Record<string, unknown>): string => {
  const parts = asArray(item.content)
    .map((part) => asRecord(part))
    .filter((part): part is Record<string, unknown> => Boolean(part))
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter((text) => text.length > 0);

  return parts.join("\n");
};

const fileChangeSummary = (item: Record<string, unknown>): string => {
  const changes = asArray(item.changes)
    .map((change) => asRecord(change))
    .filter((change): change is Record<string, unknown> => Boolean(change));

  if (changes.length === 0) {
    return "";
  }

  const lines = changes.slice(0, 3).map((change) => {
    const kind = typeof change.kind === "string" ? change.kind : "edit";
    const path = typeof change.path === "string" ? change.path : "(unknown file)";
    return `${kind}: ${path}`;
  });

  if (changes.length > 3) {
    lines.push(`+${changes.length - 3} more file changes`);
  }

  return lines.join("\n");
};

const codexItemToTranscriptItem = (item: Record<string, unknown>): TranscriptItem => {
  const id =
    typeof item.id === "string"
      ? item.id
      : `item-${Math.random().toString(16).slice(2)}`;
  const type = typeof item.type === "string" ? item.type : "unknown";

  if (type === "userMessage") {
    return {
      id,
      type: "userMessage",
      title: "User",
      text: userContentToText(item),
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "agentMessage") {
    return {
      id,
      type: "agentMessage",
      title: "Agent",
      text: typeof item.text === "string" ? item.text : "",
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "commandExecution") {
    const command = typeof item.command === "string" ? item.command : "command";
    const cwd = typeof item.cwd === "string" ? item.cwd : "";
    const output = typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "";
    const text = [cwd ? `cwd: ${cwd}` : "", output].filter((entry) => entry.length > 0).join("\n");

    return {
      id,
      type: "commandExecution",
      title: `Command: ${command}`,
      text,
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "fileChange") {
    return {
      id,
      type: "fileChange",
      title: "File change",
      text: fileChangeSummary(item),
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "plan") {
    return {
      id,
      type: "plan",
      title: "Plan",
      text: typeof item.text === "string" ? item.text : "",
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "reasoning") {
    const summary = asArray(item.summary)
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
      .filter((entry) => entry.length > 0)
      .join("\n");
    return {
      id,
      type: "reasoning",
      title: "Reasoning",
      text: summary,
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "mcpToolCall") {
    const server = typeof item.server === "string" ? item.server : "mcp";
    const tool = typeof item.tool === "string" ? item.tool : "tool";
    return {
      id,
      type: "toolCall",
      title: `Tool: ${server}.${tool}`,
      text: "",
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "webSearch") {
    const query = typeof item.query === "string" ? item.query : "";
    return {
      id,
      type: "toolCall",
      title: "Tool: web search",
      text: query,
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  return {
    id,
    type: "system",
    title: `Item: ${type}`,
    text: "",
    status: typeof item.status === "string" ? item.status : undefined
  };
};

const extractStringField = (
  record: Record<string, unknown> | null,
  keys: string[]
): string => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "";
};

const upsertTurnPlanUpdate = (
  state: CodexSessionState,
  paramsRecord: Record<string, unknown> | null
): CodexSessionState => {
  const turnId = extractStringField(paramsRecord, ["turnId"]);
  if (!turnId) {
    return state;
  }

  const explanation = extractStringField(paramsRecord, ["explanation"]);
  const planEntries = asArray(paramsRecord?.plan)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const statusLabel: Record<string, string> = {
    pending: "PENDING",
    inProgress: "IN PROGRESS",
    completed: "COMPLETED"
  };

  const planLines = planEntries
    .map((entry) => {
      const step = typeof entry.step === "string" ? entry.step : "";
      if (!step) {
        return "";
      }
      const status = typeof entry.status === "string" ? entry.status : "pending";
      return `[${statusLabel[status] ?? "PENDING"}] ${step}`;
    })
    .filter((line) => line.length > 0);

  const text = [explanation, ...planLines].filter((line) => line.length > 0).join("\n");
  if (!text) {
    return state;
  }

  return {
    ...state,
    transcript: upsertTranscriptItem(state.transcript, {
      id: `plan-${turnId}`,
      type: "plan",
      title: "Plan update",
      text
    })
  };
};

const extractUnifiedDiff = (paramsRecord: Record<string, unknown> | null): string => {
  const inline = extractStringField(paramsRecord, ["diff"]);
  if (inline) {
    return inline;
  }
  const diffRecord = asRecord(paramsRecord?.diff);
  return extractStringField(diffRecord, ["unified", "unifiedDiff", "patch", "text"]);
};

const upsertTurnDiffUpdate = (
  state: CodexSessionState,
  paramsRecord: Record<string, unknown> | null
): CodexSessionState => {
  const diff = extractUnifiedDiff(paramsRecord);
  if (!diff) {
    return state;
  }

  const turnId =
    extractStringField(paramsRecord, ["turnId"]) || state.activeTurnId || "unknown-turn";

  return {
    ...state,
    transcript: upsertTranscriptItem(state.transcript, {
      id: `diff-${turnId}`,
      type: "diff",
      title: "Pierre Diff",
      text: diff
    })
  };
};

export const createInitialSessionState = (): CodexSessionState => ({
  activeThreadId: null,
  activeTurnId: null,
  turnStatus: "idle",
  transcript: [],
  localMessageCounter: 0
});

export const appendLocalUserPrompt = (
  state: CodexSessionState,
  text: string
): CodexSessionState => ({
  ...state,
  transcript: [
    ...state.transcript,
    {
      id: `local-user-${state.localMessageCounter + 1}`,
      type: "userMessage",
      title: "User",
      text
    }
  ],
  localMessageCounter: state.localMessageCounter + 1
});

export const applyTurnStartResult = (
  state: CodexSessionState,
  result: unknown
): CodexSessionState => {
  const resultRecord = asRecord(result);
  const turn = asRecord(resultRecord?.turn);
  const turnId = typeof turn?.id === "string" ? turn.id : null;
  const items = asArray(turn?.items)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(codexItemToTranscriptItem);

  return {
    ...state,
    activeTurnId: turnId,
    turnStatus: "inProgress",
    transcript: [...state.transcript, ...items]
  };
};

export const setActiveThreadId = (
  state: CodexSessionState,
  threadId: string
): CodexSessionState => ({
  ...state,
  activeThreadId: threadId
});

export const applyCodexNotification = (
  state: CodexSessionState,
  method: string,
  params: unknown
): CodexSessionState => {
  const paramsRecord = asRecord(params);

  if (method === "thread/started") {
    const thread = asRecord(paramsRecord?.thread);
    const threadId = typeof thread?.id === "string" ? thread.id : null;
    if (!threadId) {
      return state;
    }
    return {
      ...state,
      activeThreadId: threadId
    };
  }

  if (method === "turn/started") {
    const turn = asRecord(paramsRecord?.turn);
    const turnId = typeof turn?.id === "string" ? turn.id : null;
    return {
      ...state,
      activeTurnId: turnId,
      turnStatus: "inProgress"
    };
  }

  if (method === "turn/completed") {
    const turn = asRecord(paramsRecord?.turn);
    const status =
      typeof turn?.status === "string" ? (turn.status as SessionTurnStatus) : "completed";
    return {
      ...state,
      turnStatus: status,
      activeTurnId: null
    };
  }

  if (method === "item/started" || method === "item/completed") {
    const item = asRecord(paramsRecord?.item);
    if (!item) {
      return state;
    }

    return {
      ...state,
      transcript: upsertTranscriptItem(state.transcript, codexItemToTranscriptItem(item))
    };
  }

  if (method === "item/agentMessage/delta") {
    const itemId = extractStringField(paramsRecord, ["itemId", "id"]);
    const delta = extractStringField(paramsRecord, ["delta", "textDelta", "text"]);
    if (!itemId || !delta) {
      return state;
    }
    return {
      ...state,
      transcript: appendTranscriptText(
        state.transcript,
        itemId,
        "agentMessage",
        "Agent",
        delta
      )
    };
  }

  if (method === "item/plan/delta") {
    const itemId = extractStringField(paramsRecord, ["itemId", "id"]);
    const delta = extractStringField(paramsRecord, ["delta", "textDelta", "text"]);
    if (!itemId || !delta) {
      return state;
    }
    return {
      ...state,
      transcript: appendTranscriptText(state.transcript, itemId, "plan", "Plan", delta)
    };
  }

  if (method === "item/reasoning/summaryTextDelta") {
    const itemId = extractStringField(paramsRecord, ["itemId", "id"]);
    const delta = extractStringField(paramsRecord, ["delta", "textDelta", "text"]);
    if (!itemId || !delta) {
      return state;
    }
    return {
      ...state,
      transcript: appendTranscriptText(
        state.transcript,
        itemId,
        "reasoning",
        "Reasoning",
        delta
      )
    };
  }

  if (method === "item/commandExecution/outputDelta") {
    const itemId = extractStringField(paramsRecord, ["itemId", "id"]);
    const delta = extractStringField(paramsRecord, ["delta", "outputDelta", "text"]);
    if (!itemId || !delta) {
      return state;
    }
    return {
      ...state,
      transcript: appendTranscriptText(
        state.transcript,
        itemId,
        "commandExecution",
        "Command",
        delta
      )
    };
  }

  if (method === "item/fileChange/outputDelta") {
    const itemId = extractStringField(paramsRecord, ["itemId", "id"]);
    const delta = extractStringField(paramsRecord, ["delta", "outputDelta", "text"]);
    if (!itemId || !delta) {
      return state;
    }
    return {
      ...state,
      transcript: appendTranscriptText(state.transcript, itemId, "fileChange", "File change", delta)
    };
  }

  if (method === "turn/plan/updated") {
    return upsertTurnPlanUpdate(state, paramsRecord);
  }

  if (method === "turn/diff/updated") {
    return upsertTurnDiffUpdate(state, paramsRecord);
  }

  return state;
};
