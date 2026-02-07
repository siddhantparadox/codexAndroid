export type TranscriptItem = {
  id: string;
  type: "userMessage" | "agentMessage" | "commandExecution" | "fileChange" | "system";
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
    return {
      id,
      type: "commandExecution",
      title: `Command: ${command}`,
      text: typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "",
      status: typeof item.status === "string" ? item.status : undefined
    };
  }

  if (type === "fileChange") {
    return {
      id,
      type: "fileChange",
      title: "File change",
      text: "",
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

  return state;
};
