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
  TextInput,
  View
} from "react-native";
import { initializeAndBootstrap } from "./src/codex/bootstrap";
import { CodexRpcClient, type RpcSocket } from "./src/codex/rpc-client";
import { getAppTitle } from "./src/config";
import { connectWithEndpointFallback } from "./src/pairing/connect";
import { parsePairingQrPayload } from "./src/pairing/qr";
import {
  clearPersistedPairing,
  loadPersistedPairing,
  persistPairing
} from "./src/pairing/secure-store";

export const App = (): React.ReactElement => {
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = React.useState<PairingPayload | null>(null);
  const [manualPayload, setManualPayload] = React.useState("");
  const [isScannerVisible, setIsScannerVisible] = React.useState(false);
  const [status, setStatus] = React.useState("Not connected");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [bootstrap, setBootstrap] = React.useState<{
    requiresOpenaiAuth: boolean;
    authMode: string;
    modelCount: number;
    models: Array<{ id: string; displayName: string }>;
    threadCount: number;
    threads: Array<{ id: string; preview: string }>;
  } | null>(null);

  const socketRef = React.useRef<WebSocket | null>(null);
  const clientRef = React.useRef<CodexRpcClient | null>(null);

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
      clientRef.current?.dispose();
      clientRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const applyPairing = React.useCallback(async (raw: string): Promise<void> => {
    const parsed = parsePairingQrPayload(raw);
    await persistPairing(parsed);
    setPairing(parsed);
    setBootstrap(null);
    setError(null);
    setStatus("Paired. Ready to connect.");
  }, []);

  const connectToBridge = React.useCallback(async (): Promise<void> => {
    if (!pairing) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus("Connecting...");

    clientRef.current?.dispose();
    clientRef.current = null;

    socketRef.current?.close();
    socketRef.current = null;
    setBootstrap(null);

    try {
      const connection = await connectWithEndpointFallback({
        payload: pairing
      });

      const socket = connection.socket as unknown as WebSocket;
      socketRef.current = socket;

      const client = new CodexRpcClient(socket as unknown as RpcSocket, {
        onBridgeMessage: (message) => {
          if (message.__bridge.type === "error") {
            setError(`[bridge] ${message.__bridge.message}`);
          }
        },
        onClose: () => {
          setStatus("Disconnected");
          setBootstrap(null);
        }
      });
      clientRef.current = client;

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
      setIsLoading(false);
    }
  }, [pairing]);

  const forgetPairing = React.useCallback(async (): Promise<void> => {
    clientRef.current?.dispose();
    clientRef.current = null;

    socketRef.current?.close();
    socketRef.current = null;

    await clearPersistedPairing();
    setPairing(null);
    setBootstrap(null);
    setManualPayload("");
    setError(null);
    setStatus("Pairing removed");
  }, []);

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
  }
});

export default App;
