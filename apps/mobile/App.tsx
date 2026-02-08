import type { PairingPayload } from "@codex-mobile/protocol";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { MotiView } from "moti";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { AppBackground } from "./src/components/AppBackground";
import { Chip } from "./src/components/Chip";
import { IndexCard } from "./src/components/IndexCard";
import { Stamp } from "./src/components/Stamp";
import { Typo } from "./src/components/Typo";
import {
  initializeAndBootstrap,
  type BootstrapSnapshot
} from "./src/codex/bootstrap";
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
  setActiveThreadId,
  type TranscriptItem
} from "./src/codex/session";
import { parseThreadListResponse } from "./src/codex/thread-list";
import { getAppTitle } from "./src/config";
import { connectWithEndpointFallback } from "./src/pairing/connect";
import { parsePairingQrPayload } from "./src/pairing/qr";
import {
  clearPersistedPairing,
  loadPersistedPairing,
  persistPairing
} from "./src/pairing/secure-store";
import { fontFamilies, useAppFonts } from "./src/theme/fonts";
import {
  carbonTheme,
  parchmentTheme,
  radii,
  space,
  type Theme,
  type ThemeName
} from "./src/theme/tokens";
import {
  APP_SCREENS,
  getScreenBadgeCount,
  type AppScreenKey
} from "./src/ui/app-shell";

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

type StampState = {
  kind: "approved" | "declined";
  visible: boolean;
};

const APPROVAL_TIMEOUT_MS = 120000;

const clip = (text: string, max = 220): string =>
  text.length <= max ? text : `${text.slice(0, max)}...`;

const transcriptAccentByType: Record<
  TranscriptItem["type"],
  "acid" | "cyan" | "amber" | "danger"
> = {
  userMessage: "acid",
  agentMessage: "cyan",
  commandExecution: "amber",
  fileChange: "danger",
  system: "cyan"
};

const getConnectionLabel = (
  endpoint: "lan" | "tailscale" | null,
  latencyMs: number | null
): string => {
  if (!endpoint) {
    return "OFFLINE";
  }
  const name = endpoint === "tailscale" ? "TAILNET" : "LAN";
  return latencyMs ? `${name} ${latencyMs}ms` : `${name} --ms`;
};

const ActionButton = ({
  theme,
  label,
  onPress,
  disabled,
  tone = "panel"
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "acid" | "panel" | "danger" | "outline";
}): React.ReactElement => {
  const backgroundColor =
    tone === "acid"
      ? theme.acid
      : tone === "danger"
        ? theme.danger
        : tone === "panel"
          ? theme.panel
          : "transparent";
  const borderColor = tone === "outline" ? theme.hairline : "rgba(0,0,0,0.15)";
  const textColor = tone === "acid" ? "#0F1217" : theme.text;

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !disabled ? 0.98 : 1, opacity: disabled ? 0.5 : 1 }}
          transition={{ type: "timing", duration: 120 }}
          style={[styles.actionButton, { backgroundColor, borderColor }]}
        >
          <Typo theme={theme} variant="small" weight="semibold" style={{ color: textColor }}>
            {label}
          </Typo>
        </MotiView>
      )}
    </Pressable>
  );
};

export const App = (): React.ReactElement => {
  const fontsReady = useAppFonts();
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = React.useState<PairingPayload | null>(null);
  const [manualPayload, setManualPayload] = React.useState("");
  const [isScannerVisible, setIsScannerVisible] = React.useState(false);
  const [status, setStatus] = React.useState("Not connected");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRefreshingThreads, setIsRefreshingThreads] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [activeScreen, setActiveScreen] = React.useState<AppScreenKey>("threads");
  const [commandAcceptSettingsJson, setCommandAcceptSettingsJson] = React.useState("");
  const [pendingApprovals, setPendingApprovals] = React.useState<PendingApproval[]>([]);
  const [bootstrap, setBootstrap] = React.useState<BootstrapSnapshot | null>(null);
  const [session, setSession] = React.useState(createInitialSessionState);
  const [themeName, setThemeName] = React.useState<ThemeName>("carbon");
  const [systemReducedMotion, setSystemReducedMotion] = React.useState(false);
  const [reducedMotionOverride, setReducedMotionOverride] = React.useState<boolean | null>(null);
  const [composerMode, setComposerMode] = React.useState<"chat" | "agent">("agent");
  const [networkAccess, setNetworkAccess] = React.useState<"off" | "on">("off");
  const [connectionEndpoint, setConnectionEndpoint] = React.useState<"lan" | "tailscale" | null>(null);
  const [connectionLatencyMs, setConnectionLatencyMs] = React.useState<number | null>(null);
  const [stampByRequestId, setStampByRequestId] = React.useState<Record<number, StampState>>({});

  const socketRef = React.useRef<WebSocket | null>(null);
  const clientRef = React.useRef<CodexRpcClient | null>(null);
  const sessionRef = React.useRef(session);
  const pairingRef = React.useRef<PairingPayload | null>(pairing);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = React.useRef(0);
  const isConnectingRef = React.useRef(false);
  const manualDisconnectRef = React.useRef(false);
  const connectInvokerRef = React.useRef<(() => Promise<void>) | null>(null);
  const approvalResolversRef = React.useRef<Map<number, ApprovalResolverEntry>>(new Map());
  const stampTimersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const theme = themeName === "parchment" ? parchmentTheme : carbonTheme;
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const connected = Boolean(bootstrap);

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    pairingRef.current = pairing;
  }, [pairing]);

  React.useEffect(() => {
    if (pendingApprovals.length > 0) {
      setActiveScreen("approvals");
    }
  }, [pendingApprovals.length]);

  React.useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setSystemReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReducedMotion).catch(() => undefined);
    return () => {
      subscription.remove();
    };
  }, []);

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
      }
      for (const entry of approvalResolversRef.current.values()) {
        clearTimeout(entry.timeout);
      }
      for (const timer of stampTimersRef.current.values()) {
        clearTimeout(timer);
      }
      approvalResolversRef.current.clear();
      stampTimersRef.current.clear();
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
    setConnectionEndpoint(null);
    setConnectionLatencyMs(null);
    setStatus("Paired. Ready to connect.");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  const clearReconnectTimer = React.useCallback((): void => {
    if (!reconnectTimerRef.current) {
      return;
    }
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const resolveOutstandingApprovals = React.useCallback((decision: ApprovalDecision): void => {
    for (const [requestId, entry] of approvalResolversRef.current.entries()) {
      clearTimeout(entry.timeout);
      entry.resolve({ decision });
      approvalResolversRef.current.delete(requestId);
    }
    setPendingApprovals([]);
  }, []);

  const triggerStamp = React.useCallback(
    (requestId: number, kind: StampState["kind"]): void => {
      const existing = stampTimersRef.current.get(requestId);
      if (existing) {
        clearTimeout(existing);
      }

      setStampByRequestId((previous) => ({ ...previous, [requestId]: { kind, visible: true } }));
      const timer = setTimeout(() => {
        setStampByRequestId((previous) => ({ ...previous, [requestId]: { kind, visible: false } }));
      }, reducedMotion ? 180 : 500);
      stampTimersRef.current.set(requestId, timer);
    },
    [reducedMotion]
  );

  const respondToApproval = React.useCallback(
    (requestId: number, method: ApprovalRequestMethod, decision: ApprovalDecision): void => {
      const entry = approvalResolversRef.current.get(requestId);
      if (!entry) {
        return;
      }

      let response: ApprovalResponsePayload;
      try {
        response = buildApprovalResponse({ method, decision, commandAcceptSettingsJson });
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Invalid acceptSettings payload.");
        return;
      }

      clearTimeout(entry.timeout);
      approvalResolversRef.current.delete(requestId);

      triggerStamp(requestId, decision === "accept" ? "approved" : "declined");
      void Haptics.impactAsync(
        decision === "accept" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
      ).catch(() => undefined);

      setTimeout(() => {
        setPendingApprovals((previous) => previous.filter((approval) => approval.requestId !== requestId));
        entry.resolve(response);
      }, reducedMotion ? 80 : 260);

      setStatus(decision === "accept" ? "Approval accepted." : "Approval declined.");
    },
    [commandAcceptSettingsJson, reducedMotion, triggerStamp]
  );

  const queueApprovalRequest = React.useCallback(
    (request: { id: number; method: string; params: unknown }): Promise<ApprovalResponsePayload> => {
      let approval: PendingApproval;
      try {
        approval = parseApprovalRequest(request);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to parse approval request.");
        return Promise.resolve({ decision: "decline" });
      }

      setPendingApprovals((previous) => {
        const withoutCurrent = previous.filter((entry) => entry.requestId !== approval.requestId);
        return [...withoutCurrent, approval];
      });

      setStatus(approval.method === COMMAND_APPROVAL_METHOD ? "Command approval requested." : "File change approval requested.");

      return new Promise((resolve) => {
        const existing = approvalResolversRef.current.get(approval.requestId);
        if (existing) {
          clearTimeout(existing.timeout);
          existing.resolve({ decision: "decline" });
          approvalResolversRef.current.delete(approval.requestId);
        }

        const timeout = setTimeout(() => {
          approvalResolversRef.current.delete(approval.requestId);
          setPendingApprovals((previous) => previous.filter((entry) => entry.requestId !== approval.requestId));
          resolve({ decision: "decline" });
          setStatus("Approval timed out and was declined.");
        }, APPROVAL_TIMEOUT_MS);

        approvalResolversRef.current.set(approval.requestId, { resolve, timeout });
      });
    },
    []
  );

  const scheduleReconnect = React.useCallback((): void => {
    if (manualDisconnectRef.current || !pairingRef.current || reconnectTimerRef.current || isConnectingRef.current) {
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
      if (invoke) {
        void invoke();
      }
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
    setStatus("Searching (LAN first)...");

    resolveOutstandingApprovals("decline");

    const previousSocket = socketRef.current;
    socketRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    previousSocket?.close();
    setBootstrap(null);
    setConnectionEndpoint(null);
    setConnectionLatencyMs(null);

    const startedAtMs = Date.now();

    try {
      const connection = await connectWithEndpointFallback({ payload: nextPairing });
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
        onServerRequest: ({ id, method, params }) => queueApprovalRequest({ id, method, params }),
        onClose: () => {
          if (socketRef.current !== socket) {
            return;
          }

          socketRef.current = null;
          resolveOutstandingApprovals("decline");
          setPendingApprovals([]);
          setBootstrap(null);
          setSession(createInitialSessionState());
          setConnectionEndpoint(null);
          setConnectionLatencyMs(null);

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
      setConnectionEndpoint(connection.endpointType);
      setConnectionLatencyMs(Math.max(1, Date.now() - startedAtMs));
      setStatus(`Connected via ${connection.endpointType}. App server ready.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Connection failed");
      setStatus("Connection failed");
    } finally {
      isConnectingRef.current = false;
      setIsLoading(false);
    }
  }, [clearReconnectTimer, queueApprovalRequest, resolveOutstandingApprovals, scheduleReconnect]);

  React.useEffect(() => {
    connectInvokerRef.current = connectToBridge;
  }, [connectToBridge]);

  const disconnectBridge = React.useCallback((): void => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    resolveOutstandingApprovals("decline");

    const previousSocket = socketRef.current;
    socketRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    previousSocket?.close();

    setBootstrap(null);
    setSession(createInitialSessionState());
    setPendingApprovals([]);
    setConnectionEndpoint(null);
    setConnectionLatencyMs(null);
    setStatus("Disconnected");
  }, [clearReconnectTimer, resolveOutstandingApprovals]);

  const forgetPairing = React.useCallback(async (): Promise<void> => {
    disconnectBridge();
    await clearPersistedPairing();
    setPairing(null);
    setManualPayload("");
    setError(null);
    setStatus("Pairing removed");
  }, [disconnectBridge]);

  const refreshThreads = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || !bootstrap || isRefreshingThreads) {
      return;
    }

    setIsRefreshingThreads(true);
    try {
      const threads = parseThreadListResponse(await client.request("thread/list", { limit: 20, sortKey: "updated_at" }));
      setBootstrap((previous) =>
        previous
          ? { ...previous, threadCount: threads.length, threads }
          : previous
      );
      setStatus(`Loaded ${threads.length} thread${threads.length === 1 ? "" : "s"}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to refresh threads");
      setStatus("Failed to refresh threads");
    } finally {
      setIsRefreshingThreads(false);
    }
  }, [bootstrap, isRefreshingThreads]);

  const startNewThread = React.useCallback((): void => {
    setSession((previous) => ({ ...previous, activeThreadId: null, activeTurnId: null, turnStatus: "idle" }));
    setStatus("Next turn will start a new thread.");
  }, []);

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
      }

      const turnStartResult = await client.request("turn/start", {
        threadId,
        input: [{ type: "text", text: promptText }],
        cwd
      });

      setSession((previous) => applyTurnStartResult(previous, turnStartResult));
      setStatus(`Turn in progress (${composerMode}/${networkAccess}).`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to start turn");
      setStatus("Turn failed to start");
    }
  }, [bootstrap, composerMode, networkAccess, pairing?.cwdHint, prompt]);

  const submitManualPayload = React.useCallback(async (): Promise<void> => {
    try {
      await applyPairing(manualPayload);
      setManualPayload("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Invalid pairing payload");
    }
  }, [applyPairing, manualPayload]);

  const handleQrCode = React.useCallback(
    async ({ data }: { data: string }): Promise<void> => {
      try {
        await applyPairing(data);
        setIsScannerVisible(false);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Invalid QR payload");
      }
    },
    [applyPairing]
  );

  if (!fontsReady) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: carbonTheme.bg }]}> 
        <ActivityIndicator size="large" color={carbonTheme.acid} />
      </View>
    );
  }

  const activeApproval = pendingApprovals[0] ?? null;

  const renderThreads = (): React.ReactElement => (
    <View style={styles.screenStack}>
      <IndexCard theme={theme} accent={connected ? "acid" : pairing ? "amber" : "danger"}>
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Machines</Typo>
        <Typo theme={theme} variant="small" tone="paper">{pairing ? pairing.name : "No paired computer"}</Typo>
        <Typo theme={theme} variant="micro" tone="paper">{getConnectionLabel(connectionEndpoint, connectionLatencyMs)}</Typo>
        <View style={styles.actionRow}>
          <ActionButton theme={theme} label={isScannerVisible ? "Close Scanner" : "Pair by QR"} onPress={() => setIsScannerVisible((value) => !value)} tone="acid" />
          <ActionButton theme={theme} label={isLoading ? "Connecting..." : "Connect"} onPress={() => { void connectToBridge(); }} disabled={!pairing || isLoading} tone="outline" />
          <ActionButton theme={theme} label="Disconnect" onPress={disconnectBridge} disabled={!connected} tone="danger" />
        </View>
        <TextInput
          value={manualPayload}
          onChangeText={setManualPayload}
          placeholder="Paste pairing JSON"
          placeholderTextColor={theme.mode === "carbon" ? "#5E5F63" : "#868079"}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={[styles.input, { backgroundColor: theme.cardAlt, borderColor: theme.cardHairline, color: theme.cardText }]}
        />
        <View style={styles.actionRow}>
          <ActionButton theme={theme} label="Apply JSON" onPress={() => { void submitManualPayload(); }} disabled={!manualPayload.trim()} tone="outline" />
          <ActionButton theme={theme} label="Forget Pairing" onPress={() => { void forgetPairing(); }} disabled={!pairing} tone="panel" />
        </View>
      </IndexCard>

      <IndexCard theme={theme} accent="acid">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Composer</Typo>
        <View style={styles.chipRow}>
          <Chip theme={theme} label={`Mode: ${composerMode}`} selected={composerMode === "agent"} onPress={() => setComposerMode((value) => value === "agent" ? "chat" : "agent")} />
          <Chip theme={theme} label={`Network: ${networkAccess}`} selected={networkAccess === "on"} onPress={() => setNetworkAccess((value) => value === "on" ? "off" : "on")} />
          <Chip theme={theme} label={isRefreshingThreads ? "Refreshing..." : "Refresh Threads"} onPress={() => { void refreshThreads(); }} selected={false} />
        </View>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask Codex to make a change..."
          placeholderTextColor={theme.mode === "carbon" ? "#5E5F63" : "#868079"}
          autoCapitalize="sentences"
          multiline
          style={[styles.input, { backgroundColor: theme.cardAlt, borderColor: theme.cardHairline, color: theme.cardText }]}
        />
        <View style={styles.actionRow}>
          <ActionButton theme={theme} label="Run" onPress={() => { void runTurn(); }} disabled={!clientRef.current || isLoading || !prompt.trim()} tone="acid" />
          <ActionButton theme={theme} label="New Thread" onPress={startNewThread} disabled={!clientRef.current} tone="outline" />
        </View>
      </IndexCard>

      <Typo theme={theme} variant="heading" weight="semibold">Thread Archive</Typo>
      {!bootstrap || bootstrap.threads.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
          <Typo theme={theme} variant="small" tone="muted">No threads loaded yet.</Typo>
        </View>
      ) : (
        bootstrap.threads.slice(0, 8).map((thread, index) => (
          <MotiView key={thread.id} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "timing", duration: 180, delay: index * 40 }}>
            <Pressable onPress={() => setSession((previous) => setActiveThreadId(previous, thread.id))}>
              <IndexCard theme={theme} tilt={index % 2 === 0 ? 0.8 : -0.8} accent={session.activeThreadId === thread.id ? "acid" : "cyan"}>
                <Typo theme={theme} variant="small" tone="paper" weight="display">{clip(thread.preview, 80)}</Typo>
                <Typo theme={theme} variant="micro" tone="paper">{thread.id}</Typo>
              </IndexCard>
            </Pressable>
          </MotiView>
        ))
      )}

      <Typo theme={theme} variant="heading" weight="semibold">Timeline</Typo>
      {session.transcript.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
          <Typo theme={theme} variant="small" tone="muted">No transcript yet.</Typo>
        </View>
      ) : (
        session.transcript.slice(-20).map((entry) => (
          <IndexCard key={entry.id} theme={theme} accent={transcriptAccentByType[entry.type]}>
            <Typo theme={theme} variant="micro" tone="paper" weight="semibold">{entry.title}{entry.status ? ` (${entry.status})` : ""}</Typo>
            <Typo theme={theme} variant={entry.type === "commandExecution" ? "mono" : "small"} tone="paper" style={entry.type === "commandExecution" ? styles.monoRow : undefined}>{entry.text || "(no content)"}</Typo>
          </IndexCard>
        ))
      )}
    </View>
  );

  const renderApprovals = (): React.ReactElement => (
    <View style={styles.screenStack}>
      <Typo theme={theme} variant="displayL" weight="display">Approval Desk</Typo>
      {pendingApprovals.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
          <Typo theme={theme} variant="small" tone="muted">No pending approvals.</Typo>
        </View>
      ) : (
        pendingApprovals.map((approval) => {
          const stamp = stampByRequestId[approval.requestId];
          return (
            <View key={approval.requestId}>
              <IndexCard theme={theme} accent="amber">
                <Typo theme={theme} variant="heading" tone="paper" weight="semibold">{approval.method === COMMAND_APPROVAL_METHOD ? "Command execution" : "File change"}</Typo>
                <Typo theme={theme} variant="mono" tone="paper">Item: {approval.itemId}</Typo>
                {approval.cwd ? <Typo theme={theme} variant="mono" tone="paper">cwd: {approval.cwd}</Typo> : null}
                <Typo theme={theme} variant="small" tone="paper">{clip(approval.command ?? approval.parsedCmdText ?? approval.reason ?? "", 280)}</Typo>
                {approval.method === COMMAND_APPROVAL_METHOD ? (
                  <TextInput
                    value={commandAcceptSettingsJson}
                    onChangeText={setCommandAcceptSettingsJson}
                    placeholder='{"policy":"alwaysAllow"}'
                    placeholderTextColor={theme.mode === "carbon" ? "#5E5F63" : "#868079"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    style={[styles.input, styles.shortInput, { backgroundColor: theme.cardAlt, borderColor: theme.cardHairline, color: theme.cardText }]}
                  />
                ) : null}
                <View style={styles.actionRow}>
                  <ActionButton theme={theme} label="Approve" onPress={() => respondToApproval(approval.requestId, approval.method, "accept")} tone="acid" />
                  <ActionButton theme={theme} label="Decline" onPress={() => respondToApproval(approval.requestId, approval.method, "decline")} tone="danger" />
                </View>
              </IndexCard>
              <Stamp theme={theme} kind={stamp?.kind ?? "approved"} visible={Boolean(stamp?.visible)} reducedMotion={reducedMotion} />
            </View>
          );
        })
      )}
    </View>
  );

  const renderSettings = (): React.ReactElement => (
    <View style={styles.screenStack}>
      <IndexCard theme={theme} accent="cyan">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Appearance</Typo>
        <View style={styles.chipRow}>
          <Chip theme={theme} label="Carbon" selected={themeName === "carbon"} onPress={() => setThemeName("carbon")} />
          <Chip theme={theme} label="Parchment" selected={themeName === "parchment"} onPress={() => setThemeName("parchment")} />
        </View>
        <View style={styles.chipRow}>
          <Chip theme={theme} label="Motion: System" selected={reducedMotionOverride === null} onPress={() => setReducedMotionOverride(null)} />
          <Chip theme={theme} label="Motion: Reduce" selected={reducedMotionOverride === true} onPress={() => setReducedMotionOverride(true)} />
          <Chip theme={theme} label="Motion: Full" selected={reducedMotionOverride === false} onPress={() => setReducedMotionOverride(false)} />
        </View>
      </IndexCard>

      <IndexCard theme={theme} accent="amber">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Safety</Typo>
        <Typo theme={theme} variant="micro" tone="paper">Tailnet works remotely when your home computer is on.</Typo>
        <View style={styles.chipRow}>
          <Chip theme={theme} label={`Mode ${composerMode}`} selected={composerMode === "agent"} onPress={() => setComposerMode((value) => value === "agent" ? "chat" : "agent")} />
          <Chip theme={theme} label={`Network ${networkAccess}`} selected={networkAccess === "on"} onPress={() => setNetworkAccess((value) => value === "on" ? "off" : "on")} />
        </View>
      </IndexCard>

      <IndexCard theme={theme} accent="acid">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Diagnostics</Typo>
        <Typo theme={theme} variant="micro" tone="paper">Auth mode: {bootstrap?.authMode ?? "unknown"}</Typo>
        <Typo theme={theme} variant="micro" tone="paper">Models: {bootstrap?.modelCount ?? 0} | Threads: {bootstrap?.threadCount ?? 0}</Typo>
      </IndexCard>
    </View>
  );

  return (
    <AppBackground theme={theme}>
      <View style={styles.root}>
        <View style={styles.topRail}>
          <Pressable style={[styles.machinePill, { borderColor: theme.hairline }]} onPress={() => setActiveScreen("settings")}>
            <View style={[styles.statusDot, { backgroundColor: connected ? theme.acid : theme.amber }]} />
            <View style={{ flex: 1 }}>
              <Typo theme={theme} variant="micro" weight="semibold">{pairing?.name ?? "Pair a Computer"}</Typo>
              <Typo theme={theme} variant="micro" tone="muted">{getConnectionLabel(connectionEndpoint, connectionLatencyMs)}</Typo>
            </View>
          </Pressable>
          <ActionButton theme={theme} label={connected ? "Interrupt" : "Idle"} onPress={disconnectBridge} disabled={!connected} tone={connected ? "danger" : "panel"} />
        </View>

        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroHeader}>
            <Typo theme={theme} variant="displayL" weight="display">{getAppTitle()}</Typo>
            <Typo theme={theme} variant="small" tone="muted">Editorial mission-control for Codex away from your laptop.</Typo>
          </View>

          <View style={[styles.statusCard, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
            <Typo theme={theme} variant="small" weight="semibold">{status}</Typo>
            {error ? <Typo theme={theme} variant="micro" style={{ color: theme.danger }}>{error}</Typo> : null}
          </View>

          {activeScreen === "threads" ? renderThreads() : null}
          {activeScreen === "approvals" ? renderApprovals() : null}
          {activeScreen === "settings" ? renderSettings() : null}
        </ScrollView>

        <View style={[styles.bottomTabs, { borderColor: theme.hairline, backgroundColor: theme.panel }]}>
          {APP_SCREENS.map((screen) => {
            const isActive = activeScreen === screen.key;
            const badgeCount = getScreenBadgeCount(screen.key, {
              pendingApprovals: pendingApprovals.length,
              transcriptItems: session.transcript.length,
              threadItems: bootstrap?.threadCount ?? 0
            });

            return (
              <Pressable
                key={screen.key}
                style={[styles.tabButton, { borderColor: isActive ? theme.acid : theme.hairline, backgroundColor: isActive ? theme.acid : "transparent" }]}
                onPress={() => setActiveScreen(screen.key)}
              >
                <Typo theme={theme} variant="micro" weight="semibold" style={{ color: isActive ? "#0F1217" : theme.text }}>{screen.title}</Typo>
                {badgeCount > 0 ? (
                  <View style={[styles.tabBadge, { backgroundColor: isActive ? "#0F1217" : theme.card }]}>
                    <Typo theme={theme} variant="micro" weight="semibold" style={{ color: isActive ? theme.acid : theme.cardText, fontVariant: ["tabular-nums"] }}>{badgeCount}</Typo>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {activeApproval ? (
          <View style={styles.sheetBackdrop}>
            <View style={[styles.approvalSheet, { borderColor: theme.cardHairline, backgroundColor: theme.card }]}>
              <Typo theme={theme} variant="heading" tone="paper" weight="semibold">
                Approval Required
              </Typo>
              <Typo theme={theme} variant="small" tone="paper">
                {activeApproval.method === COMMAND_APPROVAL_METHOD ? "Command execution request" : "File change request"}
              </Typo>
              <Typo theme={theme} variant="mono" tone="paper">
                {clip(activeApproval.command ?? activeApproval.parsedCmdText ?? activeApproval.itemId, 180)}
              </Typo>
              <View style={styles.actionRow}>
                <ActionButton
                  theme={theme}
                  label="Approve"
                  tone="acid"
                  onPress={() => respondToApproval(activeApproval.requestId, activeApproval.method, "accept")}
                />
                <ActionButton
                  theme={theme}
                  label="Decline"
                  tone="danger"
                  onPress={() => respondToApproval(activeApproval.requestId, activeApproval.method, "decline")}
                />
              </View>
              <Stamp
                theme={theme}
                kind={stampByRequestId[activeApproval.requestId]?.kind ?? "approved"}
                visible={Boolean(stampByRequestId[activeApproval.requestId]?.visible)}
                reducedMotion={reducedMotion}
              />
            </View>
          </View>
        ) : null}

        {isScannerVisible ? (
          <View style={styles.sheetBackdrop}>
            <View style={[styles.scannerSheet, { borderColor: theme.cardHairline, backgroundColor: theme.card }]}> 
              <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Scan bridge QR</Typo>
              <View style={[styles.scannerBox, { borderColor: theme.cardHairline }]}> 
                {!permission ? (
                  <ActivityIndicator color={theme.cardText} />
                ) : permission.granted ? (
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={(event) => {
                      void handleQrCode(event);
                    }}
                  />
                ) : (
                  <ActionButton theme={theme} label="Grant Camera Permission" onPress={() => { void requestPermission(); }} tone="outline" />
                )}
              </View>
              <ActionButton theme={theme} label="Close" onPress={() => setIsScannerVisible(false)} tone="panel" />
            </View>
          </View>
        ) : null}

        <StatusBar style={theme.mode === "carbon" ? "light" : "dark"} />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  root: { flex: 1 },
  topRail: {
    paddingHorizontal: space.x5,
    flexDirection: "row",
    gap: space.x3,
    alignItems: "center",
    marginBottom: space.x3
  },
  machinePill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x2,
    flex: 1
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999
  },
  scrollContent: {
    paddingHorizontal: space.x5,
    paddingBottom: 108,
    gap: space.x3
  },
  heroHeader: {
    gap: space.x1
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    padding: space.x3,
    gap: space.x1
  },
  screenStack: {
    gap: space.x3
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x2
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x2
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    minHeight: 88,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    textAlignVertical: "top",
    fontFamily: fontFamilies.mono,
    fontSize: 13,
    lineHeight: 18
  },
  shortInput: {
    minHeight: 72
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    padding: space.x4
  },
  monoRow: {
    fontVariant: ["tabular-nums"]
  },
  bottomTabs: {
    position: "absolute",
    left: space.x5,
    right: space.x5,
    bottom: space.x4,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: space.x2,
    flexDirection: "row",
    gap: space.x2
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space.x2
  },
  tabBadge: {
    borderRadius: radii.pill,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
    padding: space.x5,
    backgroundColor: "rgba(0,0,0,0.4)"
  },
  scannerSheet: {
    borderWidth: 1,
    borderRadius: radii.card,
    padding: space.x5,
    gap: space.x3
  },
  approvalSheet: {
    borderWidth: 1,
    borderRadius: radii.card,
    padding: space.x5,
    gap: space.x2
  },
  scannerBox: {
    minHeight: 280,
    borderWidth: 1,
    borderRadius: radii.cardInner,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  }
});

export default App;
