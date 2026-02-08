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
- A reusable theme/component layer (`theme/*` + `components/*`) prevents app-state logic and visual styling from coupling in `App.tsx`.
- Approval interactions feel safer when decision feedback is immediate and multimodal (visual stamp + haptic), even before backend completion is visible.
- Slight card tilt variation is enough to create an index-card identity; large transforms hurt readability on small screens.
- Reduced-motion support should be wired before adding signature animation so product identity does not conflict with accessibility requirements.
- Mapping UI toggles to request payload builders (`thread/start` + `turn/start`) is more reliable than in-component ad-hoc payload assembly.
- Auth notifications (`account/login/completed`, `account/updated`) should immediately refresh account snapshot, otherwise UI can drift from actual server auth state.
- A real interrupt action must call `turn/interrupt`; using disconnect as a proxy is behaviorally incorrect and loses session continuity.
- ChatGPT login UX is materially smoother when the bridge auto-opens `authUrl` locally; requiring manual copy/paste between phone and computer adds avoidable failure points.
- Bridge control channels are useful for UX feedback loops beyond errors (`authBrowserLaunch` success/failure), not just transport diagnostics.
- Pierre's open-source diff packages are web-oriented (`react-dom` peers), so Expo clients need native rendering rather than direct package usage.
- Aggregated `turn/diff/updated` is best treated as a dedicated transcript artifact, not merged into file-change plain text summaries.
- Rendering line-numbered unified diff previews with strict caps (files + lines per hunk) keeps UI responsive during large patch streams.
- `thread/list` cursor handling should be modeled explicitly (`data` + `nextCursor`) instead of flattening response data early.
- For existing-thread workflows, resume state benefits from local tracking to avoid repeated `thread/resume` calls and improve turn-start reliability.
- Connection fallback diagnostics become much more useful when missing endpoints are captured explicitly (`endpoint_unavailable`) instead of silently skipped.
- Storing a short history of per-attempt latency and reason gives enough signal for debugging without introducing heavy telemetry infrastructure.

Add new entries with date, context, and impact.
