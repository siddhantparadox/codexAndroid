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
  View,
  type ViewStyle
} from "react-native";
import { AppBackground } from "./src/components/AppBackground";
import { Chip } from "./src/components/Chip";
import { IndexCard } from "./src/components/IndexCard";
import { PierreDiffCard } from "./src/components/PierreDiffCard";
import { Stamp } from "./src/components/Stamp";
import { Typo } from "./src/components/Typo";
import {
  parseAccountSnapshot,
  parseChatgptLoginStartResult,
  parseLoginCompletedNotification
} from "./src/codex/account";
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
import { buildApprovalRiskSummary } from "./src/codex/approval-insights";
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
  type CodexSessionState,
  type TranscriptItem
} from "./src/codex/session";
import { resolveSelectedModelId } from "./src/codex/model-selection";
import {
  parseThreadListPageResponse,
  type ThreadSummary
} from "./src/codex/thread-list";
import {
  buildThreadStartParams,
  buildTurnStartParams,
  type EffortLevel,
  type ReasoningMode
} from "./src/codex/turn-settings";
import { getAppTitle } from "./src/config";
import {
  ConnectionFallbackError,
  connectWithEndpointFallback,
  type ConnectionAttempt
} from "./src/pairing/connect";
import {
  buildConnectionHint,
  formatAttemptSummary
} from "./src/pairing/diagnostics";
import {
  createBridgeHeartbeat,
  type BridgeHeartbeatController
} from "./src/pairing/heartbeat";
import { parsePairingQrPayload } from "./src/pairing/qr";
import {
  clearPersistedPairing,
  loadPersistedPairing,
  persistPairing
} from "./src/pairing/secure-store";
import {
  loadPersistedPreferences,
  persistPreferences
} from "./src/preferences/secure-store";
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

type BridgeClientLogLevel = "debug" | "info" | "warn" | "error";

type ErrorUtilsGlobal = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

const APPROVAL_TIMEOUT_MS = 120000;
const HEARTBEAT_DEGRADED_HINT = "Heartbeat delayed. Connection quality is degraded.";
const HEARTBEAT_RECONNECT_HINT = "Heartbeat lost. Reconnecting to bridge...";

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
  plan: "cyan",
  diff: "danger",
  toolCall: "amber",
  reasoning: "cyan",
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

const formatThreadTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "updated unknown";
  }

  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const mergeThreadsById = (
  currentThreads: ThreadSummary[],
  nextThreads: ThreadSummary[]
): ThreadSummary[] => {
  const order: string[] = [];
  const byId = new Map<string, ThreadSummary>();

  for (const thread of [...currentThreads, ...nextThreads]) {
    if (!byId.has(thread.id)) {
      order.push(thread.id);
    }
    byId.set(thread.id, thread);
  }

  return order
    .map((id) => byId.get(id))
    .filter((entry): entry is ThreadSummary => Boolean(entry));
};

const isUnifiedDiffText = (value: string): boolean =>
  /\bdiff --git\b/.test(value) || /^@@\s+-\d+/m.test(value);

const ActionButton = ({
  theme,
  label,
  onPress,
  disabled,
  tone = "panel",
  style
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "acid" | "panel" | "danger" | "outline";
  style?: ViewStyle;
}): React.ReactElement => {
  const backgroundColor =
    tone === "acid"
      ? theme.acid
      : tone === "danger"
        ? theme.danger
        : tone === "panel"
          ? theme.panel
          : "transparent";
  const borderColor =
    tone === "outline"
      ? theme.cardHairline
      : tone === "danger"
        ? "rgba(0,0,0,0.25)"
        : "rgba(0,0,0,0.15)";
  const textColor =
    tone === "acid" || tone === "danger"
      ? "#0F1217"
      : tone === "outline"
        ? theme.cardText
        : theme.text;

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !disabled ? 0.98 : 1, opacity: disabled ? 0.5 : 1 }}
          transition={{ type: "timing", duration: 120 }}
          style={[styles.actionButton, { backgroundColor, borderColor }, style]}
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
  const [isLoadingMoreThreads, setIsLoadingMoreThreads] = React.useState(false);
  const [isMutatingThread, setIsMutatingThread] = React.useState(false);
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
  const [effortLevel, setEffortLevel] = React.useState<EffortLevel>("medium");
  const [reasoningMode, setReasoningMode] = React.useState<ReasoningMode>("summary");
  const [showToolCalls, setShowToolCalls] = React.useState(true);
  const [showArchivedThreads, setShowArchivedThreads] = React.useState(false);
  const [hasHydratedPreferences, setHasHydratedPreferences] = React.useState(false);
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [activeLoginId, setActiveLoginId] = React.useState<string | null>(null);
  const [pendingAuthUrl, setPendingAuthUrl] = React.useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = React.useState(false);
  const [connectionEndpoint, setConnectionEndpoint] = React.useState<"lan" | "tailscale" | null>(null);
  const [connectionLatencyMs, setConnectionLatencyMs] = React.useState<number | null>(null);
  const [latencyHistoryMs, setLatencyHistoryMs] = React.useState<number[]>([]);
  const [heartbeatTimeoutCount, setHeartbeatTimeoutCount] = React.useState(0);
  const [connectionAttemptLog, setConnectionAttemptLog] = React.useState<ConnectionAttempt[]>([]);
  const [lastConnectionHint, setLastConnectionHint] = React.useState<string | null>(null);
  const [bridgeAppServerState, setBridgeAppServerState] = React.useState<
    "starting" | "running" | "stopped" | "error" | "unknown"
  >("unknown");
  const [bridgeAppServerMessage, setBridgeAppServerMessage] = React.useState<string | null>(null);
  const [stampByRequestId, setStampByRequestId] = React.useState<Record<number, StampState>>({});
  const [expandedRiskReasonKeys, setExpandedRiskReasonKeys] = React.useState<
    Record<string, boolean>
  >({});

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
  const resumedThreadIdsRef = React.useRef<Set<string>>(new Set());
  const heartbeatRef = React.useRef<BridgeHeartbeatController | null>(null);
  const lastReportedErrorRef = React.useRef<string | null>(null);

  const theme = themeName === "parchment" ? parchmentTheme : carbonTheme;
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const connected = Boolean(bootstrap);
  const connectionHealth: "connected" | "connecting" | "degraded" | "offline" =
    connected
      ? bridgeAppServerState === "error" || bridgeAppServerState === "stopped"
        ? "degraded"
        : heartbeatTimeoutCount > 0
        ? "degraded"
        : "connected"
      : isLoading
        ? "connecting"
        : lastConnectionHint
          ? "degraded"
          : "offline";
  const connectionHealthColor =
    connectionHealth === "connected"
      ? theme.acid
      : connectionHealth === "connecting"
        ? theme.cyan
        : connectionHealth === "degraded"
          ? theme.amber
          : theme.danger;

  const sendClientLog = React.useCallback(
    (
      level: BridgeClientLogLevel,
      message: string,
      context?: Record<string, unknown>
    ): void => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        socket.send(
          JSON.stringify({
            __bridge: {
              type: "clientLog",
              level,
              source: "mobile.app",
              message,
              timestamp: Date.now(),
              context
            }
          })
        );
      } catch {
        // best effort only; avoid secondary failures while logging errors.
      }
    },
    []
  );

  const getApprovalItemContext = React.useCallback(
    (approval: PendingApproval): { itemText?: string; diffText?: string } => {
      const itemText = session.transcript.find((item) => item.id === approval.itemId)?.text;
      const turnDiffText = session.transcript.find(
        (item) => item.id === `diff-${approval.turnId}` && item.type === "diff"
      )?.text;

      const candidateDiff =
        approval.diffText ?? turnDiffText ?? (itemText && isUnifiedDiffText(itemText) ? itemText : undefined);

      return {
        itemText: itemText && itemText.length > 0 ? itemText : undefined,
        diffText: candidateDiff && candidateDiff.length > 0 ? candidateDiff : undefined
      };
    },
    [session.transcript]
  );

  const toggleRiskReasonExplainer = React.useCallback((key: string): void => {
    setExpandedRiskReasonKeys((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  }, []);

  const renderRiskReasons = React.useCallback(
    (
      requestId: number,
      reasons: ReturnType<typeof buildApprovalRiskSummary>["reasons"],
      scope: "card" | "sheet"
    ): React.ReactElement[] =>
      reasons.slice(0, 3).map((reason, index) => {
        const reasonKey = `${requestId}:${scope}:${reason.code}:${index}`;
        const expanded = Boolean(expandedRiskReasonKeys[reasonKey]);
        return (
          <View key={reasonKey} style={styles.riskReasonBlock}>
            <View style={styles.riskReasonRow}>
              <Typo theme={theme} variant="micro" tone="paper" style={styles.riskReasonText}>
                - {reason.text}
              </Typo>
              <Pressable
                style={[
                  styles.whyChip,
                  {
                    borderColor: theme.cardHairline,
                    backgroundColor: theme.card
                  }
                ]}
                onPress={() => toggleRiskReasonExplainer(reasonKey)}
              >
                <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
                  {expanded ? "Hide" : "Why"}
                </Typo>
              </Pressable>
            </View>
            {expanded ? (
              <View
                style={[
                  styles.riskExplainer,
                  {
                    borderColor: theme.cardHairline,
                    backgroundColor: theme.card
                  }
                ]}
              >
                <Typo theme={theme} variant="micro" tone="paper">
                  {reason.explainer}
                </Typo>
              </View>
            ) : null}
          </View>
        );
      }),
    [expandedRiskReasonKeys, theme, toggleRiskReasonExplainer]
  );

  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => {
    pairingRef.current = pairing;
  }, [pairing]);

  React.useEffect(() => {
    const maybeErrorUtils = (
      globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsGlobal }
    ).ErrorUtils;
    const previousHandler = maybeErrorUtils?.getGlobalHandler?.();

    maybeErrorUtils?.setGlobalHandler?.((caughtError, isFatal) => {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError ?? "Unknown error");
      sendClientLog("error", `Unhandled exception${isFatal ? " (fatal)" : ""}: ${message}`);
      if (previousHandler) {
        previousHandler(caughtError, isFatal);
      }
    });

    return () => {
      if (previousHandler) {
        maybeErrorUtils?.setGlobalHandler?.(previousHandler);
      }
    };
  }, [sendClientLog]);

  React.useEffect(() => {
    if (!error) {
      lastReportedErrorRef.current = null;
      return;
    }

    if (lastReportedErrorRef.current === error) {
      return;
    }

    lastReportedErrorRef.current = error;
    sendClientLog("error", error, {
      screen: activeScreen,
      status,
      endpoint: connectionEndpoint ?? "none",
      bridgeAppServerState
    });
  }, [activeScreen, bridgeAppServerState, connectionEndpoint, error, sendClientLog, status]);

  React.useEffect(() => {
    if (pendingApprovals.length > 0) {
      setActiveScreen("approvals");
    }
  }, [pendingApprovals.length]);

  React.useEffect(() => {
    if (!bootstrap) {
      setSelectedModelId(null);
      return;
    }

    setSelectedModelId((previous) =>
      resolveSelectedModelId(bootstrap.models, previous)
    );
  }, [bootstrap]);

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
      try {
        const [storedPairing, storedPreferences] = await Promise.all([
          loadPersistedPairing(),
          loadPersistedPreferences()
        ]);

        if (storedPairing) {
          setPairing(storedPairing);
          setStatus("Pairing found. Ready to connect.");
        }

        setActiveScreen(storedPreferences.activeScreen);
        setThemeName(storedPreferences.themeName);
        setReducedMotionOverride(storedPreferences.reducedMotionOverride);
        setComposerMode(storedPreferences.composerMode);
        setNetworkAccess(storedPreferences.networkAccess);
        setEffortLevel(storedPreferences.effortLevel);
        setReasoningMode(storedPreferences.reasoningMode);
        setSelectedModelId(storedPreferences.selectedModelId);
        setShowToolCalls(storedPreferences.showToolCalls);
        setShowArchivedThreads(storedPreferences.showArchivedThreads);
      } finally {
        setHasHydratedPreferences(true);
      }
    };

    void load();

    return () => {
      manualDisconnectRef.current = true;
      heartbeatRef.current?.stop();
      heartbeatRef.current = null;
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

  React.useEffect(() => {
    if (!hasHydratedPreferences) {
      return;
    }

    void persistPreferences({
      activeScreen,
      themeName,
      reducedMotionOverride,
      composerMode,
      networkAccess,
      effortLevel,
      reasoningMode,
      selectedModelId,
      showToolCalls,
      showArchivedThreads
    }).catch(() => undefined);
  }, [
    activeScreen,
    composerMode,
    effortLevel,
    hasHydratedPreferences,
    networkAccess,
    reasoningMode,
    reducedMotionOverride,
    selectedModelId,
    showArchivedThreads,
    showToolCalls,
    themeName
  ]);

  const applyPairing = React.useCallback(async (raw: string): Promise<void> => {
    const parsed = parsePairingQrPayload(raw);
    await persistPairing(parsed);
    setPairing(parsed);
    setBootstrap(null);
    setSession(createInitialSessionState());
    resumedThreadIdsRef.current.clear();
    setPendingApprovals([]);
    setCommandAcceptSettingsJson("");
    setError(null);
    setConnectionEndpoint(null);
    setConnectionLatencyMs(null);
    setLatencyHistoryMs([]);
    setHeartbeatTimeoutCount(0);
    setConnectionAttemptLog([]);
    setLastConnectionHint(null);
    setBridgeAppServerState("unknown");
    setBridgeAppServerMessage(null);
    setActiveLoginId(null);
    setPendingAuthUrl(null);
    setApiKeyInput("");
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

  const stopHeartbeat = React.useCallback((): void => {
    heartbeatRef.current?.stop();
    heartbeatRef.current = null;
    setHeartbeatTimeoutCount(0);
  }, []);

  const resolveOutstandingApprovals = React.useCallback((decision: ApprovalDecision): void => {
    for (const [requestId, entry] of approvalResolversRef.current.entries()) {
      clearTimeout(entry.timeout);
      entry.resolve({ decision });
      approvalResolversRef.current.delete(requestId);
    }
    setPendingApprovals([]);
    setExpandedRiskReasonKeys({});
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
        setExpandedRiskReasonKeys((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([key]) => !key.startsWith(`${requestId}:`))
          )
        );
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

  const refreshAccountState = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    try {
      const snapshot = parseAccountSnapshot(
        await client.request("account/read", { refreshToken: false })
      );

      setBootstrap((previous) =>
        previous
          ? {
              ...previous,
              authMode: snapshot.authMode,
              requiresOpenaiAuth: snapshot.requiresOpenaiAuth
            }
          : previous
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to refresh auth state"
      );
    }
  }, []);

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
    stopHeartbeat();
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
    setHeartbeatTimeoutCount(0);
    setLastConnectionHint(null);
    setBridgeAppServerState("unknown");
    setBridgeAppServerMessage(null);
    resumedThreadIdsRef.current.clear();

    const startedAtMs = Date.now();

    try {
      const connection = await connectWithEndpointFallback({ payload: nextPairing });
      const socket = connection.socket as unknown as WebSocket;
      socketRef.current = socket;

      const client = new CodexRpcClient(socket as unknown as RpcSocket, {
        onBridgeMessage: (message) => {
          if (message.__bridge.type === "pong") {
            heartbeatRef.current?.handleBridgeMessage(message);
            return;
          }

          if (message.__bridge.type === "error") {
            setError(`[bridge] ${message.__bridge.message}`);
            return;
          }

          if (message.__bridge.type === "authBrowserLaunch") {
            if (message.__bridge.success) {
              setStatus("Opened sign-in link in computer browser.");
            } else {
              setStatus("Could not open sign-in link automatically.");
              if (message.__bridge.message) {
                setError(`[bridge] ${message.__bridge.message}`);
              }
            }
            return;
          }

          if (message.__bridge.type === "appServerStatus") {
            setBridgeAppServerState(message.__bridge.state);
            setBridgeAppServerMessage(message.__bridge.message ?? null);
            if (message.__bridge.state === "error" || message.__bridge.state === "stopped") {
              if (message.__bridge.message) {
                setError(`[bridge] ${message.__bridge.message}`);
              }
              setLastConnectionHint(
                "Bridge app-server is unavailable. Restart bridge or check codex CLI on computer."
              );
            }
            if (message.__bridge.state === "starting") {
              setStatus("Bridge app-server starting...");
            }
            if (message.__bridge.state === "running") {
              setStatus("Bridge app-server running.");
            }
          }
        },
        onNotification: (method, params) => {
          setSession((previous) => applyCodexNotification(previous, method, params));
          if (method === "thread/started") {
            const record = asRecord(params);
            const thread = asRecord(record?.thread);
            const threadId = typeof thread?.id === "string" ? thread.id : null;
            if (threadId) {
              resumedThreadIdsRef.current.add(threadId);
            }
          }
          if (method === "turn/started") {
            setStatus("Turn in progress...");
          }
          if (method === "turn/completed") {
            setStatus("Turn completed.");
          }
          if (method === "account/login/completed") {
            const loginResult = parseLoginCompletedNotification(params);
            if (!loginResult) {
              return;
            }

            if (!loginResult.success && loginResult.error) {
              setError(loginResult.error);
            } else {
              setError(null);
            }

            setActiveLoginId(null);
            setPendingAuthUrl(null);
            setIsAuthSubmitting(false);
            setStatus(
              loginResult.success
                ? "Authentication completed."
                : "Authentication failed."
            );
            void refreshAccountState();
          }
          if (method === "account/updated") {
            const record = asRecord(params);
            const authMode =
              typeof record?.authMode === "string"
                ? record.authMode
                : record?.authMode === null
                  ? "none"
                  : null;
            if (authMode) {
              setBootstrap((previous) =>
                previous
                  ? {
                      ...previous,
                      authMode,
                      requiresOpenaiAuth: authMode !== "none"
                    }
                  : previous
              );
            }
          }
        },
        onServerRequest: ({ id, method, params }) => queueApprovalRequest({ id, method, params }),
        onClose: () => {
          if (socketRef.current !== socket) {
            return;
          }

          socketRef.current = null;
          stopHeartbeat();
          resolveOutstandingApprovals("decline");
          setPendingApprovals([]);
          setBootstrap(null);
          setSession(createInitialSessionState());
          setConnectionEndpoint(null);
          setConnectionLatencyMs(null);
          setHeartbeatTimeoutCount(0);
          setLastConnectionHint("Connection closed unexpectedly. Computer may be asleep or bridge stopped.");
          setBridgeAppServerState("unknown");
          setBridgeAppServerMessage(null);
          resumedThreadIdsRef.current.clear();

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
      resumedThreadIdsRef.current.clear();
      setPendingApprovals([]);
      setCommandAcceptSettingsJson("");
      setBridgeAppServerState("unknown");
      setBridgeAppServerMessage(null);
      setStatus(`Connected via ${connection.endpointType}. Initializing...`);
      const snapshot = await initializeAndBootstrap(client);
      const successfulAttempt =
        connection.attempts.find((attempt) => attempt.success) ?? null;
      const latencyMs =
        successfulAttempt?.durationMs ?? Math.max(1, Date.now() - startedAtMs);
      setBootstrap(snapshot);
      setSelectedModelId((previous) =>
        resolveSelectedModelId(snapshot.models, previous)
      );
      setActiveLoginId(null);
      setPendingAuthUrl(null);
      setConnectionEndpoint(connection.endpointType);
      setConnectionLatencyMs(latencyMs);
      setLatencyHistoryMs((previous) => [...previous, latencyMs].slice(-8));
      setHeartbeatTimeoutCount(0);
      setConnectionAttemptLog((previous) => [...previous, ...connection.attempts].slice(-20));
      setLastConnectionHint(null);
      setBridgeAppServerState("running");
      setBridgeAppServerMessage("codex app-server is ready.");
      setStatus(`Connected via ${connection.endpointType}. App server ready.`);

      heartbeatRef.current = createBridgeHeartbeat(
        (message) => {
          socket.send(JSON.stringify(message));
        },
        {
          onLatencySample: (nextLatencyMs) => {
            setConnectionLatencyMs(nextLatencyMs);
            setLatencyHistoryMs((previous) => [...previous, nextLatencyMs].slice(-8));
          },
          onTimeout: (timeoutCount) => {
            setHeartbeatTimeoutCount(timeoutCount);
            setLastConnectionHint(HEARTBEAT_DEGRADED_HINT);
          },
          onRecovered: () => {
            setHeartbeatTimeoutCount(0);
            setLastConnectionHint((previous) =>
              previous === HEARTBEAT_DEGRADED_HINT || previous === HEARTBEAT_RECONNECT_HINT
                ? null
                : previous
            );
          },
          onMaxTimeouts: () => {
            setLastConnectionHint(HEARTBEAT_RECONNECT_HINT);
            setStatus("Heartbeat lost. Reconnecting...");
            socket.close();
          }
        }
      );

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (caughtError) {
      if (caughtError instanceof ConnectionFallbackError) {
        const failedAttempts = caughtError.attempts.map((attempt) => ({
          endpointType: attempt.endpointType,
          url: attempt.url,
          success: false,
          reason: attempt.reason,
          durationMs: attempt.durationMs,
          timestampMs: attempt.timestampMs
        } satisfies ConnectionAttempt));
        const hint = buildConnectionHint(caughtError.attempts);
        const detail = caughtError.attempts
          .map((attempt) => formatAttemptSummary(attempt))
          .join(" ");

        setConnectionAttemptLog((previous) => [...previous, ...failedAttempts].slice(-20));
        setLastConnectionHint(hint);
        setError(detail || "Connection failed");
        setStatus(`Connection failed. ${hint}`);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : "Connection failed");
        setStatus("Connection failed");
      }
    } finally {
      isConnectingRef.current = false;
      setIsLoading(false);
    }
  }, [
    clearReconnectTimer,
    queueApprovalRequest,
    refreshAccountState,
    resolveOutstandingApprovals,
    scheduleReconnect,
    stopHeartbeat
  ]);

  React.useEffect(() => {
    connectInvokerRef.current = connectToBridge;
  }, [connectToBridge]);

  const disconnectBridge = React.useCallback((): void => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    stopHeartbeat();
    resolveOutstandingApprovals("decline");

    const previousSocket = socketRef.current;
    socketRef.current = null;
    clientRef.current?.dispose();
    clientRef.current = null;
    previousSocket?.close();

    setBootstrap(null);
    setSession(createInitialSessionState());
    resumedThreadIdsRef.current.clear();
    setPendingApprovals([]);
    setConnectionEndpoint(null);
    setConnectionLatencyMs(null);
    setHeartbeatTimeoutCount(0);
    setLastConnectionHint(null);
    setBridgeAppServerState("unknown");
    setBridgeAppServerMessage(null);
    setActiveLoginId(null);
    setPendingAuthUrl(null);
    setIsAuthSubmitting(false);
    setStatus("Disconnected");
  }, [clearReconnectTimer, resolveOutstandingApprovals, stopHeartbeat]);

  const forgetPairing = React.useCallback(async (): Promise<void> => {
    disconnectBridge();
    await clearPersistedPairing();
    setPairing(null);
    setManualPayload("");
    setError(null);
    setStatus("Pairing removed");
  }, [disconnectBridge]);

  const interruptTurn = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const threadId = sessionRef.current.activeThreadId;
    const turnId = sessionRef.current.activeTurnId;

    if (!client || !threadId || !turnId) {
      setStatus("No active turn to interrupt.");
      return;
    }

    try {
      await client.request("turn/interrupt", { threadId, turnId });
      setStatus("Interrupt requested.");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
        () => undefined
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to interrupt turn"
      );
      setStatus("Failed to interrupt turn");
    }
  }, []);

  const startChatgptLogin = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    setIsAuthSubmitting(true);
    setError(null);
    setStatus("Starting ChatGPT login...");

    try {
      const result = parseChatgptLoginStartResult(
        await client.request("account/login/start", { type: "chatgpt" })
      );

      if (!result) {
        throw new Error("ChatGPT login did not return loginId/authUrl");
      }

      setActiveLoginId(result.loginId);
      setPendingAuthUrl(result.authUrl);
      setStatus("Finish sign-in in your computer browser.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to start ChatGPT login"
      );
      setStatus("Failed to start ChatGPT login");
      setIsAuthSubmitting(false);
    }
  }, []);

  const submitApiKeyLogin = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const apiKey = apiKeyInput.trim();
    if (!client || !apiKey) {
      return;
    }

    setIsAuthSubmitting(true);
    setError(null);
    setStatus("Submitting API key...");

    try {
      await client.request("account/login/start", { type: "apiKey", apiKey });
      setApiKeyInput("");
      setStatus("API key submitted. Waiting for completion...");
      await refreshAccountState();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "API key login failed"
      );
      setStatus("API key login failed");
    } finally {
      setIsAuthSubmitting(false);
    }
  }, [apiKeyInput, refreshAccountState]);

  const cancelChatgptLogin = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || !activeLoginId) {
      return;
    }

    try {
      await client.request("account/login/cancel", { loginId: activeLoginId });
      setStatus("Login cancelled.");
      setActiveLoginId(null);
      setPendingAuthUrl(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to cancel login"
      );
    }
  }, [activeLoginId]);

  const logoutAccount = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    try {
      await client.request("account/logout");
      setStatus("Logged out.");
      await refreshAccountState();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Logout failed"
      );
    }
  }, [refreshAccountState]);

  const ensureThreadResumed = React.useCallback(
    async (client: CodexRpcClient, threadId: string): Promise<string> => {
      if (resumedThreadIdsRef.current.has(threadId)) {
        return threadId;
      }

      const resumeResult = asRecord(await client.request("thread/resume", { threadId }));
      const resumedThread = asRecord(resumeResult?.thread);
      const resumedId =
        typeof resumedThread?.id === "string" ? resumedThread.id : threadId;

      resumedThreadIdsRef.current.add(resumedId);
      setSession((previous) => setActiveThreadId(previous, resumedId));
      return resumedId;
    },
    []
  );

  const refreshThreads = React.useCallback(async (archivedOverride?: boolean): Promise<void> => {
    const client = clientRef.current;
    if (!client || isRefreshingThreads) {
      return;
    }

    const archived = archivedOverride ?? showArchivedThreads;
    setIsRefreshingThreads(true);
    try {
      const page = parseThreadListPageResponse(
        await client.request("thread/list", {
          limit: 20,
          sortKey: "updated_at",
          archived
        })
      );

      setBootstrap((previous) =>
        previous
          ? {
              ...previous,
              threadCount: page.data.length,
              threads: page.data,
              threadNextCursor: page.nextCursor
            }
          : previous
      );
      setStatus(
        `Loaded ${page.data.length} ${archived ? "archived " : ""}thread${page.data.length === 1 ? "" : "s"}.`
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to refresh threads");
      setStatus("Failed to refresh threads");
    } finally {
      setIsRefreshingThreads(false);
    }
  }, [isRefreshingThreads, showArchivedThreads]);

  const loadMoreThreads = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const nextCursor = bootstrap?.threadNextCursor ?? null;
    if (!client || !bootstrap || !nextCursor || isLoadingMoreThreads) {
      return;
    }

    setIsLoadingMoreThreads(true);
    try {
      const page = parseThreadListPageResponse(
        await client.request("thread/list", {
          cursor: nextCursor,
          limit: 20,
          sortKey: "updated_at",
          archived: showArchivedThreads
        })
      );

      setBootstrap((previous) => {
        if (!previous) {
          return previous;
        }

        const merged = mergeThreadsById(previous.threads, page.data);
        return {
          ...previous,
          threads: merged,
          threadCount: merged.length,
          threadNextCursor: page.nextCursor
        };
      });
      setStatus(`Loaded ${page.data.length} more threads.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load more threads");
      setStatus("Failed to load more threads");
    } finally {
      setIsLoadingMoreThreads(false);
    }
  }, [bootstrap, isLoadingMoreThreads, showArchivedThreads]);

  const resumeSelectedThread = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const threadId = sessionRef.current.activeThreadId;
    if (!client || !threadId || isMutatingThread) {
      return;
    }

    setIsMutatingThread(true);
    try {
      const resumedId = await ensureThreadResumed(client, threadId);
      setSession((previous) => setActiveThreadId(previous, resumedId));
      setStatus("Thread resumed.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to resume thread");
      setStatus("Failed to resume thread");
    } finally {
      setIsMutatingThread(false);
    }
  }, [ensureThreadResumed, isMutatingThread]);

  const forkSelectedThread = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const threadId = sessionRef.current.activeThreadId;
    if (!client || !threadId || isMutatingThread) {
      return;
    }

    setIsMutatingThread(true);
    try {
      const forkResult = asRecord(await client.request("thread/fork", { threadId }));
      const forkThread = asRecord(forkResult?.thread);
      const forkId = typeof forkThread?.id === "string" ? forkThread.id : null;

      if (!forkId) {
        throw new Error("thread/fork did not return a thread id");
      }

      resumedThreadIdsRef.current.add(forkId);
      setSession((previous): CodexSessionState => ({
        ...previous,
        activeThreadId: forkId,
        activeTurnId: null,
        turnStatus: "idle"
      }));
      setStatus("Thread forked.");
      await refreshThreads();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to fork thread");
      setStatus("Failed to fork thread");
    } finally {
      setIsMutatingThread(false);
    }
  }, [isMutatingThread, refreshThreads]);

  const archiveOrUnarchiveSelectedThread = React.useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const threadId = sessionRef.current.activeThreadId;
    if (!client || !threadId || isMutatingThread) {
      return;
    }

    setIsMutatingThread(true);
    try {
      if (showArchivedThreads) {
        await client.request("thread/unarchive", { threadId });
      } else {
        await client.request("thread/archive", { threadId });
        resumedThreadIdsRef.current.delete(threadId);
        setSession((previous): CodexSessionState => ({
          ...previous,
          activeThreadId: null,
          activeTurnId: null,
          turnStatus: "idle"
        }));
      }

      setStatus(showArchivedThreads ? "Thread unarchived." : "Thread archived.");
      await refreshThreads();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to update archived state"
      );
      setStatus("Failed to update archived state");
    } finally {
      setIsMutatingThread(false);
    }
  }, [isMutatingThread, refreshThreads, showArchivedThreads]);

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

    const cwd = pairing?.cwdHint;

    setPrompt("");
    setError(null);
    setStatus("Starting turn...");
    setSession((previous) => appendLocalUserPrompt(previous, promptText));

    try {
      let threadId = sessionRef.current.activeThreadId;

      if (!threadId) {
        const threadStartResult = asRecord(
          await client.request(
            "thread/start",
            buildThreadStartParams({
              mode: composerMode,
              networkAccess,
              selectedModelId,
              effortLevel,
              reasoningMode,
              cwd
            })
          )
        );
        const thread = asRecord(threadStartResult?.thread);
        threadId = typeof thread?.id === "string" ? thread.id : null;

        if (!threadId) {
          throw new Error("thread/start did not return a thread id");
        }

        resumedThreadIdsRef.current.add(threadId);
        setSession((previous) => setActiveThreadId(previous, threadId as string));
      } else {
        threadId = await ensureThreadResumed(client, threadId);
      }

      const turnStartResult = await client.request(
        "turn/start",
        buildTurnStartParams({
          threadId,
          promptText,
          mode: composerMode,
          networkAccess,
          selectedModelId,
          effortLevel,
          reasoningMode,
          cwd
        })
      );

      setSession((previous) => applyTurnStartResult(previous, turnStartResult));
      setStatus(`Turn in progress (${composerMode}/${networkAccess}).`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to start turn");
      setStatus("Turn failed to start");
    }
  }, [
    composerMode,
    ensureThreadResumed,
    effortLevel,
    networkAccess,
    pairing?.cwdHint,
    prompt,
    reasoningMode,
    selectedModelId
  ]);

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

  const renderTranscriptEntry = (entry: TranscriptItem): React.ReactElement => {
    if (entry.type === "diff") {
      return (
        <PierreDiffCard
          key={entry.id}
          theme={theme}
          title={entry.title}
          status={entry.status}
          diff={entry.text}
        />
      );
    }

    if (entry.type === "plan") {
      const lines = entry.text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return (
        <IndexCard key={entry.id} theme={theme} accent={transcriptAccentByType[entry.type]}>
          <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
            {entry.title}
            {entry.status ? ` (${entry.status})` : ""}
          </Typo>
          {lines.map((line, index) => (
            <View
              key={`${entry.id}-${index}-${line}`}
              style={[styles.planLine, { borderColor: theme.cardHairline, backgroundColor: theme.cardAlt }]}
            >
              <Typo theme={theme} variant="small" tone="paper">
                {line}
              </Typo>
            </View>
          ))}
        </IndexCard>
      );
    }

    if (entry.type === "toolCall") {
      return (
        <IndexCard key={entry.id} theme={theme} accent={transcriptAccentByType[entry.type]}>
          <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
            {entry.title}
            {entry.status ? ` (${entry.status})` : ""}
          </Typo>
          <View style={[styles.toolRow, { borderColor: theme.cardHairline, backgroundColor: theme.cardAlt }]}>
            <Typo theme={theme} variant="mono" tone="paper" style={styles.monoRow}>
              {entry.text || "(tool call in progress)"}
            </Typo>
          </View>
        </IndexCard>
      );
    }

    return (
      <IndexCard key={entry.id} theme={theme} accent={transcriptAccentByType[entry.type]}>
        <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
          {entry.title}
          {entry.status ? ` (${entry.status})` : ""}
        </Typo>
        <Typo
          theme={theme}
          variant={entry.type === "commandExecution" ? "mono" : "small"}
          tone="paper"
          style={entry.type === "commandExecution" ? styles.monoRow : undefined}
        >
          {entry.text || "(no content)"}
        </Typo>
      </IndexCard>
    );
  };

  const renderThreads = (): React.ReactElement => (
    <View style={styles.screenStack}>
      <IndexCard theme={theme} accent={connected ? "acid" : pairing ? "amber" : "danger"}>
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Machines</Typo>
        <Typo theme={theme} variant="small" tone="paper">{pairing ? pairing.name : "No paired computer"}</Typo>
        <Typo theme={theme} variant="micro" tone="paper">{getConnectionLabel(connectionEndpoint, connectionLatencyMs)}</Typo>
        {lastConnectionHint ? (
          <Typo theme={theme} variant="micro" tone="paper">{lastConnectionHint}</Typo>
        ) : null}
        <View style={styles.actionRow}>
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label={isScannerVisible ? "Close Scanner" : "Pair by QR"}
            onPress={() => setIsScannerVisible((value) => !value)}
            tone="acid"
          />
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label={isLoading ? "Connecting..." : "Connect"}
            onPress={() => {
              void connectToBridge();
            }}
            disabled={!pairing || isLoading}
            tone="outline"
          />
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label="Disconnect"
            onPress={disconnectBridge}
            disabled={!connected}
            tone="danger"
          />
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
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label="Apply JSON"
            onPress={() => {
              void submitManualPayload();
            }}
            disabled={!manualPayload.trim()}
            tone="outline"
          />
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label="Forget Pairing"
            onPress={() => {
              void forgetPairing();
            }}
            disabled={!pairing}
            tone="panel"
          />
        </View>
      </IndexCard>

      <IndexCard theme={theme} accent="acid">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Composer</Typo>
        <View style={styles.chipRow}>
          <Chip theme={theme} label={`Mode: ${composerMode}`} selected={composerMode === "agent"} onPress={() => setComposerMode((value) => value === "agent" ? "chat" : "agent")} />
          <Chip theme={theme} label={`Network: ${networkAccess}`} selected={networkAccess === "on"} onPress={() => setNetworkAccess((value) => value === "on" ? "off" : "on")} />
          <Chip
            theme={theme}
            label={`Model: ${selectedModelId ?? "auto"}`}
            selected={Boolean(selectedModelId)}
            onPress={() => {
              const models = bootstrap?.models ?? [];
              if (models.length === 0) {
                return;
              }

              const currentIndex = models.findIndex((model) => model.id === selectedModelId);
              const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % models.length;
              setSelectedModelId(models[nextIndex]?.id ?? null);
            }}
          />
          <Chip
            theme={theme}
            label={`Effort: ${effortLevel}`}
            selected={effortLevel === "high"}
            onPress={() => {
              setEffortLevel((value) =>
                value === "low" ? "medium" : value === "medium" ? "high" : "low"
              );
            }}
          />
          <Chip
            theme={theme}
            label={`Reasoning: ${reasoningMode}`}
            selected={reasoningMode === "raw"}
            onPress={() => {
              setReasoningMode((value) => (value === "summary" ? "raw" : "summary"));
            }}
          />
          <Chip
            theme={theme}
            label={showToolCalls ? "Tool calls: on" : "Tool calls: off"}
            selected={showToolCalls}
            onPress={() => {
              setShowToolCalls((value) => !value);
            }}
          />
          <Chip
            theme={theme}
            label={showArchivedThreads ? "View: archived" : "View: active"}
            selected={showArchivedThreads}
            onPress={() => {
              const next = !showArchivedThreads;
              setShowArchivedThreads(next);
              void refreshThreads(next);
            }}
          />
          <Chip
            theme={theme}
            label={isRefreshingThreads ? "Refreshing..." : "Refresh Threads"}
            onPress={() => {
              void refreshThreads();
            }}
            selected={false}
          />
          <Chip
            theme={theme}
            label={
              isLoadingMoreThreads
                ? "Loading more..."
                : bootstrap?.threadNextCursor
                  ? "Load More"
                  : "No More"
            }
            selected={Boolean(bootstrap?.threadNextCursor)}
            onPress={() => {
              void loadMoreThreads();
            }}
          />
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

      <Typo theme={theme} variant="heading" weight="semibold">
        {showArchivedThreads ? "Archived Threads" : "Thread Archive"}
      </Typo>
      <View style={styles.actionRow}>
        <ActionButton
          theme={theme}
          label={isMutatingThread ? "Working..." : "Resume Selected"}
          onPress={() => {
            void resumeSelectedThread();
          }}
          disabled={!session.activeThreadId || !connected || isMutatingThread}
          tone="outline"
        />
        <ActionButton
          theme={theme}
          label="Fork Selected"
          onPress={() => {
            void forkSelectedThread();
          }}
          disabled={!session.activeThreadId || !connected || isMutatingThread}
          tone="panel"
        />
        <ActionButton
          theme={theme}
          label={showArchivedThreads ? "Unarchive Selected" : "Archive Selected"}
          onPress={() => {
            void archiveOrUnarchiveSelectedThread();
          }}
          disabled={!session.activeThreadId || !connected || isMutatingThread}
          tone={showArchivedThreads ? "outline" : "danger"}
        />
      </View>
      {!bootstrap || bootstrap.threads.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
          <Typo theme={theme} variant="small" tone="muted">
            {showArchivedThreads ? "No archived threads loaded." : "No threads loaded yet."}
          </Typo>
        </View>
      ) : (
        bootstrap.threads.map((thread, index) => (
          <MotiView key={thread.id} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "timing", duration: 180, delay: index * 40 }}>
            <Pressable
              onPress={() => {
                setSession((previous) => setActiveThreadId(previous, thread.id));
                setStatus(`Selected thread ${thread.id}.`);
              }}
            >
              <IndexCard theme={theme} tilt={index % 2 === 0 ? 0.8 : -0.8} accent={session.activeThreadId === thread.id ? "acid" : "cyan"}>
                <Typo theme={theme} variant="small" tone="paper" weight="display">{clip(thread.preview, 80)}</Typo>
                <View style={styles.threadMetaRow}>
                  <Typo theme={theme} variant="micro" tone="paper">
                    {(thread.modelProvider ?? "unknown")} • {(thread.sourceKind ?? "app")}
                  </Typo>
                  <Typo theme={theme} variant="micro" tone="paper">
                    {formatThreadTimestamp(thread.updatedAt ?? thread.createdAt)}
                  </Typo>
                </View>
                {thread.archived ? (
                  <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
                    Archived
                  </Typo>
                ) : null}
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
        session.transcript
          .filter((entry) => (showToolCalls ? true : entry.type !== "toolCall"))
          .slice(-20)
          .map((entry) => renderTranscriptEntry(entry))
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
          const context = getApprovalItemContext(approval);
          const riskSummary = buildApprovalRiskSummary(approval, context);
          const riskColor =
            riskSummary.level === "high"
              ? theme.danger
              : riskSummary.level === "medium"
                ? theme.amber
                : theme.acid;
          const requestLabel =
            approval.method === COMMAND_APPROVAL_METHOD
              ? "Command execution"
              : "File change";
          const primaryText =
            approval.command ??
            approval.parsedCmdText ??
            approval.reason ??
            context.itemText ??
            "";
          return (
            <View key={approval.requestId}>
              <IndexCard theme={theme} accent="amber">
                <Typo theme={theme} variant="heading" tone="paper" weight="semibold">
                  {requestLabel}
                </Typo>
                <View
                  style={[
                    styles.approvalRiskBlock,
                    {
                      borderColor: riskColor,
                      backgroundColor: theme.cardAlt
                    }
                  ]}
                >
                  <Typo
                    theme={theme}
                    variant="micro"
                    tone="paper"
                    weight="semibold"
                    style={{ color: riskColor }}
                  >
                    {riskSummary.label}
                  </Typo>
                  {renderRiskReasons(approval.requestId, riskSummary.reasons, "card")}
                </View>
                <View
                  style={[
                    styles.approvalMetaBlock,
                    {
                      borderColor: theme.cardHairline,
                      backgroundColor: theme.cardAlt
                    }
                  ]}
                >
                  <Typo theme={theme} variant="mono" tone="paper">
                    Thread: {approval.threadId}
                  </Typo>
                  <Typo theme={theme} variant="mono" tone="paper">
                    Turn: {approval.turnId}
                  </Typo>
                  <Typo theme={theme} variant="mono" tone="paper">
                    Item: {approval.itemId}
                  </Typo>
                </View>
                {approval.cwd ? <Typo theme={theme} variant="mono" tone="paper">cwd: {approval.cwd}</Typo> : null}
                {primaryText ? (
                  <Typo theme={theme} variant="small" tone="paper">
                    {clip(primaryText, 320)}
                  </Typo>
                ) : null}
                {approval.changedPaths && approval.changedPaths.length > 0 ? (
                  <View
                    style={[
                      styles.approvalMetaBlock,
                      {
                        borderColor: theme.cardHairline,
                        backgroundColor: theme.cardAlt
                      }
                    ]}
                  >
                    <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
                      Files ({approval.changeCount ?? approval.changedPaths.length})
                    </Typo>
                    {approval.changedPaths.slice(0, 4).map((path) => (
                      <Typo key={`${approval.requestId}-${path}`} theme={theme} variant="micro" tone="paper">
                        - {path}
                      </Typo>
                    ))}
                    {approval.changedPaths.length > 4 ? (
                      <Typo theme={theme} variant="micro" tone="paper">
                        - +{approval.changedPaths.length - 4} more files
                      </Typo>
                    ) : null}
                  </View>
                ) : null}
                {context.diffText ? (
                  <PierreDiffCard
                    theme={theme}
                    title="Approval Diff Preview"
                    status={riskSummary.label}
                    diff={context.diffText}
                  />
                ) : (
                  <Typo theme={theme} variant="micro" tone="paper">
                    Diff preview not available yet.
                  </Typo>
                )}
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

      <IndexCard theme={theme} accent="cyan">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Authentication</Typo>
        <Typo theme={theme} variant="small" tone="paper">
          Current mode: {bootstrap?.authMode ?? "unknown"}
        </Typo>
        <View style={styles.actionRow}>
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label={isAuthSubmitting ? "Starting..." : "Sign in ChatGPT"}
            onPress={() => {
              void startChatgptLogin();
            }}
            disabled={!connected || isAuthSubmitting}
            tone="acid"
          />
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label="Cancel Login"
            onPress={() => {
              void cancelChatgptLogin();
            }}
            disabled={!activeLoginId || isAuthSubmitting}
            tone="outline"
          />
          <ActionButton
            theme={theme}
            style={styles.actionButtonFlex}
            label="Logout"
            onPress={() => {
              void logoutAccount();
            }}
            disabled={!connected || isAuthSubmitting}
            tone="danger"
          />
        </View>
        <TextInput
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder="Paste OpenAI API key"
          placeholderTextColor={theme.mode === "carbon" ? "#5E5F63" : "#868079"}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            styles.shortInput,
            { backgroundColor: theme.cardAlt, borderColor: theme.cardHairline, color: theme.cardText }
          ]}
        />
        <ActionButton
          theme={theme}
          style={styles.actionButtonFlex}
          label={isAuthSubmitting ? "Submitting..." : "Use API Key"}
          onPress={() => {
            void submitApiKeyLogin();
          }}
          disabled={!connected || isAuthSubmitting || apiKeyInput.trim().length === 0}
          tone="outline"
        />
        {pendingAuthUrl ? (
          <Typo theme={theme} variant="micro" tone="paper">
            Open on computer browser: {pendingAuthUrl}
          </Typo>
        ) : null}
      </IndexCard>

      <IndexCard theme={theme} accent="acid">
        <Typo theme={theme} variant="heading" tone="paper" weight="semibold">Diagnostics</Typo>
        <Typo theme={theme} variant="micro" tone="paper">Auth mode: {bootstrap?.authMode ?? "unknown"}</Typo>
        <Typo theme={theme} variant="micro" tone="paper">Models: {bootstrap?.modelCount ?? 0} | Threads: {bootstrap?.threadCount ?? 0}</Typo>
        <Typo theme={theme} variant="micro" tone="paper">
          Connection health: {connectionHealth}
        </Typo>
        <Typo theme={theme} variant="micro" tone="paper">
          Heartbeat: {heartbeatTimeoutCount > 0 ? `degraded (${heartbeatTimeoutCount})` : "healthy"}
        </Typo>
        <Typo theme={theme} variant="micro" tone="paper">
          Bridge app-server: {bridgeAppServerState}
        </Typo>
        {bridgeAppServerMessage ? (
          <Typo theme={theme} variant="micro" tone="paper">
            Bridge message: {bridgeAppServerMessage}
          </Typo>
        ) : null}
        <Typo theme={theme} variant="micro" tone="paper">
          Active endpoint: {connectionEndpoint ?? "none"}
        </Typo>
        <Typo theme={theme} variant="micro" tone="paper">
          Last latency: {connectionLatencyMs ? `${connectionLatencyMs}ms` : "n/a"}
        </Typo>
        <Typo theme={theme} variant="micro" tone="paper">
          Latency trend: {latencyHistoryMs.length > 0 ? latencyHistoryMs.join(" ms, ") + " ms" : "n/a"}
        </Typo>
        {lastConnectionHint ? (
          <Typo theme={theme} variant="micro" tone="paper">
            Last network hint: {lastConnectionHint}
          </Typo>
        ) : null}
        <View style={[styles.diagnosticsBlock, { borderColor: theme.cardHairline, backgroundColor: theme.cardAlt }]}>
          {connectionAttemptLog.slice(-4).map((attempt, index) => (
            <Typo
              key={`${attempt.endpointType}-${attempt.timestampMs}-${index}`}
              theme={theme}
              variant="micro"
              tone="paper"
            >
              {formatAttemptSummary(attempt)}
            </Typo>
          ))}
          {connectionAttemptLog.length === 0 ? (
            <Typo theme={theme} variant="micro" tone="paper">No recent connection attempts.</Typo>
          ) : null}
        </View>
      </IndexCard>
    </View>
  );

  return (
    <AppBackground theme={theme}>
      <View style={styles.root}>
        <View style={styles.topRail}>
          <Pressable style={[styles.machinePill, { borderColor: theme.hairline }]} onPress={() => setActiveScreen("settings")}>
            <View style={[styles.statusDot, { backgroundColor: connectionHealthColor }]} />
            <View style={{ flex: 1 }}>
              <Typo theme={theme} variant="micro" weight="semibold">{pairing?.name ?? "Pair a Computer"}</Typo>
              <Typo theme={theme} variant="micro" tone="muted">
                {connectionEndpoint
                  ? getConnectionLabel(connectionEndpoint, connectionLatencyMs)
                  : connectionHealth.toUpperCase()}
              </Typo>
            </View>
          </Pressable>
          <ActionButton
            theme={theme}
            label={session.activeTurnId ? "Interrupt" : "Idle"}
            onPress={() => {
              void interruptTurn();
            }}
            disabled={!session.activeTurnId}
            tone={session.activeTurnId ? "danger" : "panel"}
          />
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
              {(() => {
                const context = getApprovalItemContext(activeApproval);
                const riskSummary = buildApprovalRiskSummary(activeApproval, context);
                const riskColor =
                  riskSummary.level === "high"
                    ? theme.danger
                    : riskSummary.level === "medium"
                      ? theme.amber
                      : theme.acid;
                const requestLabel =
                  activeApproval.method === COMMAND_APPROVAL_METHOD
                    ? "Command execution request"
                    : "File change request";
                const primaryText =
                  activeApproval.command ??
                  activeApproval.parsedCmdText ??
                  activeApproval.reason ??
                  context.itemText ??
                  activeApproval.itemId;

                return (
                  <>
                    <ScrollView
                      style={styles.approvalSheetScroll}
                      contentContainerStyle={styles.approvalSheetScrollContent}
                      showsVerticalScrollIndicator={false}
                    >
                      <Typo theme={theme} variant="heading" tone="paper" weight="semibold">
                        Approval Required
                      </Typo>
                      <Typo theme={theme} variant="small" tone="paper">
                        {requestLabel}
                      </Typo>
                      <View
                        style={[
                          styles.approvalRiskBlock,
                          {
                            borderColor: riskColor,
                            backgroundColor: theme.cardAlt
                          }
                        ]}
                      >
                        <Typo
                          theme={theme}
                          variant="micro"
                          tone="paper"
                          weight="semibold"
                          style={{ color: riskColor }}
                        >
                          {riskSummary.label}
                        </Typo>
                        {renderRiskReasons(
                          activeApproval.requestId,
                          riskSummary.reasons,
                          "sheet"
                        )}
                      </View>
                      <View
                        style={[
                          styles.approvalMetaBlock,
                          {
                            borderColor: theme.cardHairline,
                            backgroundColor: theme.cardAlt
                          }
                        ]}
                      >
                        <Typo theme={theme} variant="mono" tone="paper">
                          Thread: {activeApproval.threadId}
                        </Typo>
                        <Typo theme={theme} variant="mono" tone="paper">
                          Turn: {activeApproval.turnId}
                        </Typo>
                        <Typo theme={theme} variant="mono" tone="paper">
                          Item: {activeApproval.itemId}
                        </Typo>
                        {activeApproval.cwd ? (
                          <Typo theme={theme} variant="mono" tone="paper">
                            cwd: {activeApproval.cwd}
                          </Typo>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.approvalMetaBlock,
                          {
                            borderColor: theme.cardHairline,
                            backgroundColor: theme.cardAlt
                          }
                        ]}
                      >
                          <Typo theme={theme} variant="small" tone="paper">
                            {clip(primaryText, 320)}
                          </Typo>
                      </View>
                      {activeApproval.changedPaths && activeApproval.changedPaths.length > 0 ? (
                        <View
                          style={[
                            styles.approvalMetaBlock,
                            {
                              borderColor: theme.cardHairline,
                              backgroundColor: theme.cardAlt
                            }
                          ]}
                        >
                          <Typo theme={theme} variant="micro" tone="paper" weight="semibold">
                            Files ({activeApproval.changeCount ?? activeApproval.changedPaths.length})
                          </Typo>
                          {activeApproval.changedPaths.slice(0, 5).map((path) => (
                            <Typo
                              key={`${activeApproval.requestId}-sheet-file-${path}`}
                              theme={theme}
                              variant="micro"
                              tone="paper"
                            >
                              - {path}
                            </Typo>
                          ))}
                          {activeApproval.changedPaths.length > 5 ? (
                            <Typo theme={theme} variant="micro" tone="paper">
                              - +{activeApproval.changedPaths.length - 5} more files
                            </Typo>
                          ) : null}
                        </View>
                      ) : null}
                      {context.diffText ? (
                        <PierreDiffCard
                          theme={theme}
                          title="Approval Diff Preview"
                          status={riskSummary.label}
                          diff={context.diffText}
                        />
                      ) : (
                        <Typo theme={theme} variant="micro" tone="paper">
                          Diff preview not available yet.
                        </Typo>
                      )}
                    </ScrollView>
                    <View style={styles.actionRow}>
                      <ActionButton
                        theme={theme}
                        label="Approve"
                        tone="acid"
                        onPress={() =>
                          respondToApproval(activeApproval.requestId, activeApproval.method, "accept")
                        }
                      />
                      <ActionButton
                        theme={theme}
                        label="Decline"
                        tone="danger"
                        onPress={() =>
                          respondToApproval(activeApproval.requestId, activeApproval.method, "decline")
                        }
                      />
                    </View>
                  </>
                );
              })()}
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
  actionButtonFlex: {
    flexGrow: 1,
    flexBasis: 140
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
  planLine: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2
  },
  toolRow: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2
  },
  threadMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.x2
  },
  diagnosticsBlock: {
    borderRadius: radii.cardInner,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    gap: space.x1
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
  approvalSheetScroll: {
    maxHeight: 420
  },
  approvalSheetScrollContent: {
    gap: space.x2,
    paddingBottom: space.x2
  },
  approvalRiskBlock: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    gap: 2
  },
  riskReasonBlock: {
    gap: 4
  },
  riskReasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x2
  },
  riskReasonText: {
    flex: 1
  },
  whyChip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: 24,
    paddingHorizontal: space.x2,
    alignItems: "center",
    justifyContent: "center"
  },
  riskExplainer: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x2,
    paddingVertical: 6
  },
  approvalMetaBlock: {
    borderWidth: 1,
    borderRadius: radii.cardInner,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    gap: 2
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
