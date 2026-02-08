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
- Turn streaming is stable when notifications are normalized into one reducer (`applyCodexNotification`) and UI only consumes derived transcript state.
- Optimistic local user prompt insertion helps avoid perceived latency before `turn/start` response/stream notifications arrive.
- Approval request handling is cleaner when parsing into a typed queue model (`PendingApproval`) before touching UI state.
- Reconnect logic is safer when delay math is isolated in a pure helper and tested independently from React lifecycle code.
- Server-initiated request replies may resolve on a microtask boundary even with synchronous handlers; tests should await at least one microtask tick before assertions.
- Where protocol docs mention optional extension fields without schema (`acceptSettings`), a validated JSON passthrough is safer than inventing strict client-side enums early.
- Linking approval cards back to transcript state by `itemId` gives useful execution context without additional server round trips.
- Including file-change summaries and `item/fileChange/outputDelta` in the reducer materially improves approval clarity.
- A lightweight local app shell (screen state + metadata helper) is a good midpoint between a debug monolith screen and full router migration.
- Screen badge counts help surface operational hotspots (pending approvals, transcript growth) without forcing users into one screen.
- Expo SecureStore key names on Android must avoid `/`; use dot/underscore/hyphen separators and keep a legacy-key migration path where possible.
- Runtime stability improves when thread context is user-selectable; implicit new-thread creation should be the fallback, not the primary path.
- Parsing `thread/list` responses in a shared pure module reduces duplication between bootstrap and interactive refresh flows.
- A 30s default RPC timeout is a safer baseline for mobile + local bridge conditions than 8s.

Add new entries with date, context, and impact.
