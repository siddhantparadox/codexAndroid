# Learnings

## 2026-02-07

- Monorepo bootstrapping is fastest when protocol contracts are implemented first.
- Bridge development is easier when WebSocket control messages are separated from app-server passthrough messages.
- Codex app-server lifecycle requires one `initialize` request followed by `initialized`; bridge/client state should enforce this sequence.
- For Expo scaffolding in 2026-02, `create-expo-app` blank TypeScript currently pins `expo ~54.0.33`, `react 19.1.0`, and `react-native 0.81.5`.
- Keeping pairing parsing/validation as a pure module (`parsePairingQrPayload`) makes QR scan and manual-input flows share one contract path.
- Endpoint fallback logic is easier to test when WebSocket construction is injected (constructor dependency instead of global-only usage).
- A dedicated mobile JSON-RPC client with request timeout/rejection handling simplifies app-server bootstrap and avoids UI-level message parsing.
- Bridge control envelopes (`__bridge`) and app-server JSON-RPC can share one socket safely when the client explicitly routes and ignores bridge control payloads.

Add new entries with date, context, and impact.
