import {
  isBridgeControlMessage,
  type BridgeControlMessage
} from "@codex-mobile/protocol";

type JsonRpcError = {
  code?: number;
  message: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type RpcSocket = {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send: (data: string) => void;
  close: (code?: number) => void;
};

type ClientInfo = {
  name: string;
  title: string;
  version: string;
};

type CodexRpcClientOptions = {
  requestTimeoutMs?: number;
  onBridgeMessage?: (message: BridgeControlMessage) => void;
  onNotification?: (method: string, params: unknown) => void;
  onServerRequest?: (request: {
    id: number;
    method: string;
    params: unknown;
  }) => Promise<unknown> | unknown;
  onClose?: () => void;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const isResponseMessage = (
  message: Record<string, unknown>
): message is { id: number; result?: unknown; error?: JsonRpcError } => {
  const id = message.id;
  return (
    typeof id === "number" &&
    (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))
  );
};

const isServerRequestMessage = (
  message: Record<string, unknown>
): message is { id: number; method: string; params?: unknown } => {
  return (
    typeof message.id === "number" &&
    typeof message.method === "string" &&
    !Object.hasOwn(message, "result") &&
    !Object.hasOwn(message, "error")
  );
};

export class CodexRpcClient {
  private socket: RpcSocket;
  private options: CodexRpcClientOptions;
  private requestTimeoutMs: number;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  constructor(socket: RpcSocket, options: CodexRpcClientOptions = {}) {
    this.socket = socket;
    this.options = options;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    this.socket.onmessage = (event) => {
      this.handleIncoming(event.data);
    };
    this.socket.onerror = () => {
      this.rejectAllPending(new Error("Socket error"));
    };
    this.socket.onclose = () => {
      this.rejectAllPending(new Error("Socket closed"));
      this.options.onClose?.();
    };
  }

  async initialize(clientInfo: ClientInfo): Promise<void> {
    await this.request("initialize", { clientInfo });
    this.notify("initialized", {});
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const message: Record<string, unknown> = { method, id };
    if (params !== undefined) {
      message.params = params;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        resolve,
        reject,
        timeout
      });

      try {
        this.socket.send(JSON.stringify(message));
      } catch (caughtError) {
        clearTimeout(timeout);
        this.pending.delete(id);
        const message =
          caughtError instanceof Error ? caughtError.message : "Socket send failed";
        reject(new Error(message));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    const message: Record<string, unknown> = { method };
    if (params !== undefined) {
      message.params = params;
    }

    this.socket.send(JSON.stringify(message));
  }

  dispose(): void {
    this.socket.onmessage = null;
    this.socket.onerror = null;
    this.socket.onclose = null;
    this.rejectAllPending(new Error("Client disposed"));
  }

  private handleIncoming(rawData: unknown): void {
    const text =
      typeof rawData === "string"
        ? rawData
        : rawData instanceof ArrayBuffer
          ? new TextDecoder().decode(rawData)
          : typeof rawData === "object" &&
              rawData !== null &&
              "toString" in rawData
            ? String(rawData)
            : "";

    if (!text) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (isBridgeControlMessage(parsed)) {
      this.options.onBridgeMessage?.(parsed);
      return;
    }

    const message = asRecord(parsed);
    if (!message) {
      return;
    }

    if (isResponseMessage(message)) {
      this.resolveResponse(message);
      return;
    }

    if (isServerRequestMessage(message)) {
      void this.handleServerRequest(message);
      return;
    }

    const method = message.method;
    if (typeof method === "string") {
      this.options.onNotification?.(method, message.params);
    }
  }

  private async handleServerRequest(message: {
    id: number;
    method: string;
    params?: unknown;
  }): Promise<void> {
    if (!this.options.onServerRequest) {
      this.trySendServerReply({
        id: message.id,
        error: {
          code: -32601,
          message: `Client cannot handle method: ${message.method}`
        }
      });
      return;
    }

    try {
      const result = await this.options.onServerRequest({
        id: message.id,
        method: message.method,
        params: message.params
      });

      this.trySendServerReply({
        id: message.id,
        result
      });
    } catch (caughtError) {
      const messageText =
        caughtError instanceof Error
          ? caughtError.message
          : `Request handling failed for method: ${message.method}`;
      this.trySendServerReply({
        id: message.id,
        error: {
          code: -32000,
          message: messageText
        }
      });
    }
  }

  private resolveResponse(message: {
    id: number;
    result?: unknown;
    error?: JsonRpcError;
  }): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(`Request failed: ${message.error.message ?? "Unknown error"}`)
      );
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private trySendServerReply(message: {
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
  }): void {
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // If the socket is already closed, the request can no longer be answered.
    }
  }
}
