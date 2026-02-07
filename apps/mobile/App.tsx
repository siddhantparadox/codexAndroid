import type { PairingPayload } from "@codex-mobile/protocol";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TextInput,
  View
} from "react-native";
import { initializeAndBootstrap } from "./src/codex/bootstrap";
import {
  COMMAND_APPROVAL_METHOD,
  parseApprovalRequest,
  type ApprovalRequestMethod,
  type PendingApproval
} from "./src/codex/approvals";
import {
  buildApprovalResponse,
  type ApprovalDecision,
  type ApprovalResponsePayload
} from "./src/codex/approval-response";
import { computeReconnectDelayMs } from "./src/codex/reconnect";
import { CodexRpcClient, type RpcSocket } from "./src/codex/rpc-client";
import {
  applyCodexNotification,
  applyTurnStartResult,
  appendLocalUserPrompt,
  createInitialSessionState,
  setActiveThreadId
} from "./src/codex/session";
import { getAppTitle } from "./src/config";
import { connectWithEndpointFallback } from "./src/pairing/connect";
import { parsePairingQrPayload } from "./src/pairing/qr";
import {
  clearPersistedPairing,
  loadPersistedPairing,
  persistPairing
} from "./src/pairing/secure-store";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

type ApprovalResolverEntry = {
  resolve: (value: ApprovalResponsePayload) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const APPROVAL_TIMEOUT_MS = 120000;

export const App = (): React.ReactElement => {
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = React.useState<PairingPayload | null>(null);
  const [manualPayload, setManualPayload] = React.useState("");
  const [isScannerVisible, setIsScannerVisible] = React.useState(false);
  const [status, setStatus] = React.useState("Not connected");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [commandAcceptSettingsJson, setCommandAcceptSettingsJson] = React.useState("");
  const [pendingApprovals, setPendingApprovals] = React.useState<PendingApproval[]>(
    []
  );
  const [bootstrap, setBootstrap] = React.useState<{
    requiresOpenaiAuth: boolean;
    authMode: string;
    modelCount: number;
    models: Array<{ id: string; displayName: string }>;
    threadCount: number;
    threads: Array<{ id: string; preview: string }>;
  } | null>(null);
  const [session, setSession] = React.useState(createInitialSessionState);

  const socketRef = React.useRef<WebSocket | null>(null);
  const clientRef = React.useRef<CodexRpcClient | null>(null);
  const sessionRef = React.useRef(session);
  const pairingRef = React.useRef<PairingPayload | null>(pairing);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = React.useRef(0);
  const isConnectingRef = React.useRef(false);
  const manualDisconnectRef = React.useRef(false);
  const connectInvokerRef = React.useRef<(() => Promise<void>) | null>(null);
  const approvalResolversRef = React.useRef<Map<number, ApprovalResolverEntry>>(
    new Map()
  );

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    pairingRef.current = pairing;
  }, [pairing]);

  const transcriptById = React.useMemo(() => {
    const map = new Map<string, { title: string; text: string; status?: string }>();
    for (const entry of session.transcript) {
      map.set(entry.id, {
        title: entry.title,
        text: entry.text,
        status: entry.status
      });
    }
    return map;
  }, [session.transcript]);

  React.useEffect(() => {
    const load = async (): Promise<void> => {
      const stored = await loadPersistedPairing();
      if (stored) {
        setPairing(stored);
        setStatus("Pairing found. Ready to connect.");
      }
    };

    void load();

    return () => {
      manualDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      for (const entry of approvalResolversRef.current.values()) {
        clearTimeout(entry.timeout);
      }
      approvalResolversRef.current.clear();
      const previousSocket = socketRef.current;
      socketRef.current = null;
      clientRef.current?.dispose();
      clientRef.current = null;
      previousSocket?.close();
    };
  }, []);

  const applyPairing = React.useCallback(async (raw: string): Promise<void> => {
    const parsed = parsePairingQrPayload(raw);
    await persistPairing(parsed);
    setPairing(parsed);
    setBootstrap(null);
    setSession(createInitialSessionState());
    setPendingApprovals([]);
    setCommandAcceptSettingsJson("");
    setError(null);
    setStatus("Paired. Ready to connect.");
  }, []);

  const clearReconnectTimer = React.useCallback((): void => {
    if (!reconnectTimerRef.current) {
      return;
    }

    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const resolveOutstandingApprovals = React.useCallback(
    (decision: ApprovalDecision): void => {
      for (const [requestId, entry] of approvalResolversRef.current.entries()) {
        clearTimeout(entry.timeout);
        entry.resolve({ decision });
        approvalResolversRef.current.delete(requestId);
      }
      setPendingApprovals([]);
    },
    []
  );

  const respondToApproval = React.useCallback(
    (
      requestId: number,
      method: ApprovalRequestMethod,
      decision: ApprovalDecision
    ): void => {
      const entry = approvalResolversRef.current.get(requestId);
      if (!entry) {
        return;
      }

      let response: ApprovalResponsePayload;
      try {
        response = buildApprovalResponse({
          method,
          decision,
          commandAcceptSettingsJson
        });
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Invalid acceptSettings payload.";
        setError(message);
        return;
      }

      clearTimeout(entry.timeout);
      approvalResolversRef.current.delete(requestId);
      setPendingApprovals((previous) =>
        previous.filter((approval) => approval.requestId !== requestId)
      );
      entry.resolve(response);
      setStatus(
        decision === "accept"
          ? "Approval accepted. Waiting for item completion..."
          : "Approval declined."
      );
    },
    [commandAcceptSettingsJson]
  );

  const queueApprovalRequest = React.useCallback(
    (
      request: { id: number; method: string; params: unknown }
    ): Promise<ApprovalResponsePayload> => {
      let approval: PendingApproval;
      try {
        approval = parseApprovalRequest(request);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to parse approval request.";
        setError(message);
        return Promise.resolve({ decision: "decline" });
      }

      setPendingApprovals((previous) => {
        const withoutCurrent = previous.filter(
          (entry) => entry.requestId !== approval.requestId
        );
        return [...withoutCurrent, approval];
      });

      setStatus(
        approval.method === COMMAND_APPROVAL_METHOD
          ? "Command approval requested."
          : "File change approval requested."
      );

      return new Promise((resolve) => {
        const existing = approvalResolversRef.current.get(approval.requestId);
        if (existing) {
          clearTimeout(existing.timeout);
          existing.resolve({ decision: "decline" });
          approvalResolversRef.current.delete(approval.requestId);
        }

        const timeout = setTimeout(() => {
          approvalResolversRef.current.delete(approval.requestId);
          setPendingApprovals((previous) =>
            previous.filter((entry) => entry.requestId !== approval.requestId)
          );
          resolve({ decision: "decline" });
          setStatus("Approval timed out and was declined.");
        }, APPROVAL_TIMEOUT_MS);

        approvalResolversRef.current.set(approval.requestId, {
          resolve,
          timeout
        });
      });
    },
    []
  );

  const scheduleReconnect = React.useCallback((): void => {
    if (manualDisconnectRef.current || !pairingRef.current) {
      return;
    }

    if (reconnectTimerRef.current || isConnectingRef.current) {
      return;
    }

    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    const delayMs = computeReconnectDelayMs(attempt);
    const delaySeconds = Math.ceil(delayMs / 1000);

    setStatus(`Disconnected. Reconnecting in ${delaySeconds}s (attempt ${attempt})...`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      const invoke = connectInvokerRef.current;
      if (!invoke) {
        return;
      }

      void invoke();
    }, delayMs);
  }, []);

  const connectToBridge = React.useCallback(async (): Promise<void> => {
    const nextPairing = pairingRef.current;
    if (!nextPairing || isConnectingRef.current) {
      return;
    }

    clearReconnectTimer();
    isConnectingRef.current = true;
    manualDisconnectRef.current = false;

    setIsLoading(true);
    setError(null);
    setStatus(reconnectAttemptRef.current > 0 ? "Reconnecting..." : "Connecting...");

    resolveOutstandingApprovals("decline");

    const previousSocket = socketRef.current;
    socketRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    previousSocket?.close();
    setBootstrap(null);

    try {
      const connection = await connectWithEndpointFallback({
        payload: nextPairing
      });

      const socket = connection.socket as unknown as WebSocket;
      socketRef.current = socket;

      const client = new CodexRpcClient(socket as unknown as RpcSocket, {
        onBridgeMessage: (message) => {
          if (message.__bridge.type === "error") {
            setError(`[bridge] ${message.__bridge.message}`);
          }
        },
        onNotification: (method, params) => {
          setSession((previous) => applyCodexNotification(previous, method, params));
          if (method === "turn/started") {
            setStatus("Turn in progress...");
          }
          if (method === "turn/completed") {
            setStatus("Turn completed.");
          }
        },
        onServerRequest: ({ id, method, params }) =>
          queueApprovalRequest({ id, method, params }),
        onClose: () => {
          if (socketRef.current !== socket) {
            return;
          }

          socketRef.current = null;
          resolveOutstandingApprovals("decline");
          setPendingApprovals([]);
          setBootstrap(null);
          setSession(createInitialSessionState());

          if (manualDisconnectRef.current) {
            setStatus("Disconnected");
            return;
          }

          setStatus("Disconnected");
          scheduleReconnect();
        }
      });
      clientRef.current = client;

      reconnectAttemptRef.current = 0;
      setSession(createInitialSessionState());
      setPendingApprovals([]);
      setCommandAcceptSettingsJson("");
      setStatus(`Connected via ${connection.endpointType}. Initializing...`);
      const snapshot = await initializeAndBootstrap(client);
      setBootstrap(snapshot);
      setStatus(`Connected via ${connection.endpointType}. App server ready.`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Connection failed";
      setError(message);
      setStatus("Connection failed");
    } finally {
      isConnectingRef.current = false;
      setIsLoading(false);
    }
  }, [clearReconnectTimer, queueApprovalRequest, resolveOutstandingApprovals, scheduleReconnect]);

  React.useEffect(() => {
    connectInvokerRef.current = connectToBridge;
  }, [connectToBridge]);

  const forgetPairing = React.useCallback(async (): Promise<void> => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    resolveOutstandingApprovals("decline");

    const previousSocket = socketRef.current;
    socketRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    previousSocket?.close();

    await clearPersistedPairing();
    setPairing(null);
    setBootstrap(null);
    setSession(createInitialSessionState());
    setPendingApprovals([]);
    setCommandAcceptSettingsJson("");
    reconnectAttemptRef.current = 0;
    setManualPayload("");
    setError(null);
    setStatus("Pairing removed");
  }, [clearReconnectTimer, resolveOutstandingApprovals]);

  const runTurn = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const promptText = prompt.trim();
    if (!client || !promptText) {
      return;
    }

    const preferredModel = bootstrap?.models[0]?.id ?? "gpt-5.2-codex";
    const cwd = pairing?.cwdHint;

    setPrompt("");
    setError(null);
    setStatus("Starting turn...");
    setSession((previous) => appendLocalUserPrompt(previous, promptText));

    try {
      let threadId = sessionRef.current.activeThreadId;

      if (!threadId) {
        const threadStartResult = asRecord(
          await client.request("thread/start", {
            model: preferredModel,
            cwd,
            approvalPolicy: "unlessTrusted",
            sandbox: "workspaceWrite"
          })
        );
        const thread = asRecord(threadStartResult?.thread);
        threadId = typeof thread?.id === "string" ? thread.id : null;

        if (!threadId) {
          throw new Error("thread/start did not return a thread id");
        }

        setSession((previous) => setActiveThreadId(previous, threadId as string));
        setBootstrap((previous) => {
          if (!previous) {
            return previous;
          }

          const alreadyPresent = previous.threads.some(
            (threadEntry) => threadEntry.id === threadId
          );
          if (alreadyPresent) {
            return previous;
          }

          return {
            ...previous,
            threadCount: previous.threadCount + 1,
            threads: [{ id: threadId as string, preview: "(new thread)" }, ...previous.threads]
          };
        });
      }

      const turnStartResult = await client.request("turn/start", {
        threadId,
        input: [{ type: "text", text: promptText }],
        cwd
      });

      setSession((previous) => applyTurnStartResult(previous, turnStartResult));
      setStatus("Turn in progress...");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to start turn";
      setError(message);
      setStatus("Turn failed to start");
    }
  }, [bootstrap, pairing?.cwdHint, prompt]);

  const submitManualPayload = React.useCallback(async (): Promise<void> => {
    try {
      await applyPairing(manualPayload);
      setManualPayload("");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Invalid pairing payload";
      setError(message);
    }
  }, [applyPairing, manualPayload]);

  const handleQrCode = React.useCallback(
    async ({ data }: { data: string }): Promise<void> => {
      try {
        await applyPairing(data);
        setIsScannerVisible(false);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Invalid QR payload";
        setError(message);
      }
    },
    [applyPairing]
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}
    >
      <Text selectable style={styles.title}>
        {getAppTitle()}
      </Text>
      <Text selectable style={styles.subtitle}>
        Pair phone to bridge and connect (LAN first, Tailscale fallback).
      </Text>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          Pairing
        </Text>
        {pairing ? (
          <View style={styles.pairingInfo}>
            <Text selectable style={styles.label}>
              Name: {pairing.name}
            </Text>
            <Text selectable style={styles.label}>
              LAN: {pairing.endpoints.lan ?? "n/a"}
            </Text>
            <Text selectable style={styles.label}>
              Tailscale: {pairing.endpoints.tailscale ?? "n/a"}
            </Text>
          </View>
        ) : (
          <Text selectable style={styles.muted}>
            No paired computer yet.
          </Text>
        )}

        <View style={styles.buttonRow}>
          <Button
            title={isScannerVisible ? "Hide QR Scanner" : "Scan QR"}
            onPress={() => {
              setIsScannerVisible((value) => !value);
              setError(null);
            }}
          />
          <Button
            title="Forget Pairing"
            onPress={() => void forgetPairing()}
            disabled={!pairing}
          />
        </View>

        {isScannerVisible ? (
          <View style={styles.scannerBox}>
            {!permission ? (
              <ActivityIndicator />
            ) : permission.granted ? (
              <CameraView
                style={StyleSheet.absoluteFillObject}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(event) => {
                  void handleQrCode(event);
                }}
              />
            ) : (
              <Button
                title="Grant Camera Permission"
                onPress={() => {
                  void requestPermission();
                }}
              />
            )}
          </View>
        ) : null}

        <TextInput
          value={manualPayload}
          onChangeText={setManualPayload}
          placeholder="Paste pairing JSON here"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.input}
        />
        <Button
          title="Apply Pairing JSON"
          onPress={() => void submitManualPayload()}
          disabled={!manualPayload.trim()}
        />
      </View>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          Connection
        </Text>
        <Text selectable style={styles.label}>
          Status: {status}
        </Text>
        {error ? (
          <Text selectable style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button
          title={isLoading ? "Connecting..." : "Connect to Bridge"}
          onPress={() => void connectToBridge()}
          disabled={!pairing || isLoading}
        />
      </View>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          App Server Snapshot
        </Text>
        {!bootstrap ? (
          <Text selectable style={styles.muted}>
            No bootstrap data yet.
          </Text>
        ) : (
          <View style={styles.snapshotInfo}>
            <Text selectable style={styles.label}>
              Auth mode: {bootstrap.authMode}
            </Text>
            <Text selectable style={styles.label}>
              Requires OpenAI auth: {String(bootstrap.requiresOpenaiAuth)}
            </Text>
            <Text selectable style={styles.label}>
              Models loaded: {bootstrap.modelCount}
            </Text>
            <Text selectable style={styles.label}>
              Threads loaded: {bootstrap.threadCount}
            </Text>

            {bootstrap.models.slice(0, 5).map((model) => (
              <Text key={model.id} selectable style={styles.muted}>
                Model: {model.displayName}
              </Text>
            ))}
            {bootstrap.threads.slice(0, 5).map((thread) => (
              <Text key={thread.id} selectable style={styles.muted}>
                Thread: {thread.preview}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          Turn Composer
        </Text>
        <Text selectable style={styles.label}>
          Active thread: {session.activeThreadId ?? "none"}
        </Text>
        <Text selectable style={styles.label}>
          Turn status: {session.turnStatus}
        </Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask Codex to make a change..."
          autoCapitalize="sentences"
          multiline
          style={styles.input}
        />
        <Button
          title="Run Turn"
          onPress={() => void runTurn()}
          disabled={!clientRef.current || isLoading || !prompt.trim()}
        />
      </View>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          Pending Approvals
        </Text>
        {pendingApprovals.length === 0 ? (
          <Text selectable style={styles.muted}>
            No pending approvals.
          </Text>
        ) : (
          <View style={styles.snapshotInfo}>
            {pendingApprovals.map((approval) => {
              const methodLabel =
                approval.method === COMMAND_APPROVAL_METHOD
                  ? "Command execution"
                  : "File change";
              const subtitle =
                approval.command ?? approval.parsedCmdText ?? approval.reason ?? "";
              const transcriptItem = transcriptById.get(approval.itemId);
              const transcriptSummary = transcriptItem?.text
                ? transcriptItem.text.slice(0, 500)
                : "";

              return (
                <View key={approval.requestId} style={styles.approvalRow}>
                  <Text selectable style={styles.transcriptTitle}>
                    {methodLabel}
                  </Text>
                  <Text selectable style={styles.muted}>
                    Item: {approval.itemId}
                  </Text>
                  <Text selectable style={styles.muted}>
                    Thread: {approval.threadId}
                  </Text>
                  <Text selectable style={styles.muted}>
                    Turn: {approval.turnId}
                  </Text>
                  {approval.cwd ? (
                    <Text selectable style={styles.muted}>
                      CWD: {approval.cwd}
                    </Text>
                  ) : null}
                  {approval.risk ? (
                    <Text selectable style={styles.approvalRisk}>
                      Risk: {approval.risk}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text selectable style={styles.transcriptText}>
                      {subtitle}
                    </Text>
                  ) : null}
                  {transcriptItem ? (
                    <View style={styles.approvalContextBox}>
                      <Text selectable style={styles.muted}>
                        Latest item state: {transcriptItem.title}
                        {transcriptItem.status ? ` (${transcriptItem.status})` : ""}
                      </Text>
                      <Text selectable style={styles.transcriptText}>
                        {transcriptSummary || "(no details yet)"}
                      </Text>
                    </View>
                  ) : null}
                  {approval.method === COMMAND_APPROVAL_METHOD ? (
                    <View style={styles.snapshotInfo}>
                      <Text selectable style={styles.muted}>
                        Optional `acceptSettings` JSON:
                      </Text>
                      <TextInput
                        value={commandAcceptSettingsJson}
                        onChangeText={setCommandAcceptSettingsJson}
                        placeholder='{"policy":"alwaysAllow"}'
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                        style={styles.approvalSettingsInput}
                      />
                    </View>
                  ) : null}
                  <View style={styles.buttonRow}>
                    <Button
                      title="Accept"
                      onPress={() => {
                        respondToApproval(approval.requestId, approval.method, "accept");
                      }}
                    />
                    <Button
                      title="Decline"
                      onPress={() => {
                        respondToApproval(approval.requestId, approval.method, "decline");
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          Transcript
        </Text>
        {session.transcript.length === 0 ? (
          <Text selectable style={styles.muted}>
            No transcript yet.
          </Text>
        ) : (
          <View style={styles.snapshotInfo}>
            {session.transcript.map((entry) => (
              <View key={entry.id} style={styles.transcriptRow}>
                <Text
                  selectable
                  style={[
                    styles.transcriptTitle,
                    transcriptTypeStyles[entry.type] ?? transcriptTypeStyles.system
                  ]}
                >
                  {entry.title}
                  {entry.status ? ` (${entry.status})` : ""}
                </Text>
                <Text selectable style={styles.transcriptText}>
                  {entry.text || "(no content)"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <StatusBar style="dark" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 16,
    backgroundColor: "#f6f7fb",
    minHeight: "100%"
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    fontSize: 14,
    color: "#4b5563"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827"
  },
  pairingInfo: {
    gap: 4
  },
  snapshotInfo: {
    gap: 4
  },
  label: {
    fontSize: 14,
    color: "#1f2937"
  },
  muted: {
    fontSize: 14,
    color: "#6b7280"
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10
  },
  scannerBox: {
    width: "100%",
    minHeight: 240,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11182710"
  },
  input: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#ffffff"
  },
  error: {
    color: "#b91c1c",
    fontSize: 13
  },
  transcriptRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  approvalRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  approvalRisk: {
    fontSize: 13,
    color: "#7c2d12"
  },
  approvalContextBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    padding: 8,
    gap: 6
  },
  approvalSettingsInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#ffffff"
  },
  transcriptTitle: {
    fontSize: 13,
    fontWeight: "600"
  },
  transcriptText: {
    fontSize: 14,
    color: "#111827"
  }
});

const transcriptTypeStyles: Record<string, TextStyle> = {
  userMessage: { color: "#1d4ed8" },
  agentMessage: { color: "#047857" },
  commandExecution: { color: "#7c3aed" },
  fileChange: { color: "#b45309" },
  system: { color: "#4b5563" }
};

export default App;
