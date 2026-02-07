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
import { connectWithEndpointFallback } from "./src/pairing/connect";
import { getAppTitle } from "./src/config";
import {
  clearPersistedPairing,
  loadPersistedPairing,
  persistPairing
} from "./src/pairing/secure-store";
import { parsePairingQrPayload } from "./src/pairing/qr";

export const App = (): React.ReactElement => {
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = React.useState<PairingPayload | null>(null);
  const [manualPayload, setManualPayload] = React.useState("");
  const [isScannerVisible, setIsScannerVisible] = React.useState(false);
  const [status, setStatus] = React.useState("Not connected");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const socketRef = React.useRef<WebSocket | null>(null);

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
      socketRef.current?.close();
    };
  }, []);

  const applyPairing = React.useCallback(async (raw: string): Promise<void> => {
    const parsed = parsePairingQrPayload(raw);
    await persistPairing(parsed);
    setPairing(parsed);
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

    socketRef.current?.close();
    socketRef.current = null;

    try {
      const result = await connectWithEndpointFallback({
        payload: pairing
      });

      socketRef.current = result.socket as WebSocket;
      setStatus(`Connected via ${result.endpointType}`);

      result.socket.onclose = () => {
        setStatus("Disconnected");
      };
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
    socketRef.current?.close();
    socketRef.current = null;

    await clearPersistedPairing();
    setPairing(null);
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
