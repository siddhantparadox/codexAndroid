# Decisions

## 2026-02-07 - Use Turborepo + PNPM workspace

- Decision: Standardize on Turborepo for task orchestration and PNPM workspace for package management.
- Why: Shared protocol types across mobile and bridge require strong dependency graph orchestration and consistent caching.
- Consequence: All package tasks are defined in package-level `package.json` scripts and run via `turbo run` from root.

## 2026-02-07 - Keep v1 transport local-network only

- Decision: Keep bridge communication on LAN/Tailscale over `ws://` for v1.
- Why: Minimizes deployment complexity and keeps computer-local execution model intact.
- Consequence: No public relay, no port forwarding, and no cloud runner in v1.

## 2026-02-07 - Pairing UX uses QR-first with manual JSON fallback

- Decision: Support both QR scanning and manual pairing-payload paste in mobile.
- Why: QR is primary UX; manual payload is needed for development, camera-permission denials, and scanner edge cases.
- Consequence: Pairing parser/validator is shared by both paths and stored payload remains one schema.

## 2026-02-07 - Bootstrap app-server immediately after bridge connection

- Decision: After socket connection, run the initialization handshake and fetch a baseline snapshot (`account/read`, `model/list`, `thread/list`) before exposing advanced actions.
- Why: This validates protocol health early and gives immediate user-visible state for auth/models/threads.
- Consequence: Mobile owns a dedicated JSON-RPC client with request lifecycle management.

## 2026-02-07 - Use a pure session reducer for turn/item streaming

- Decision: Handle `turn/*` and `item/*` notifications through a pure reducer module (`src/codex/session.ts`) instead of embedding mutation logic in React callbacks.
- Why: Streaming updates are high-frequency and easier to validate with unit tests when state transitions are pure.
- Consequence: UI becomes a projection of reducer state; transcript behavior is testable without device runtime.

## 2026-02-07 - Handle approvals as server-initiated RPC requests with queued UI state

- Decision: Parse `item/commandExecution/requestApproval` and `item/fileChange/requestApproval` into a dedicated pending-approvals queue and resolve each request with explicit `accept`/`decline`.
- Why: Approval requests are request/response RPC events, not notifications, and require deterministic mapping between request id and user decision.
- Consequence: Mobile now maintains approval resolver bookkeeping and timeouts to avoid hanging request ids.

## 2026-02-07 - Reconnect on unexpected close using bounded exponential backoff

- Decision: On unplanned socket close, schedule reconnect attempts with exponential backoff capped at a fixed max delay.
- Why: Bridge and network availability can be transient; automatic retry improves resilience without tight reconnect loops.
- Consequence: Connection lifecycle tracks manual-vs-unexpected disconnects and suppresses retries when pairing is intentionally removed.

## 2026-02-07 - Keep command approval `acceptSettings` as JSON passthrough in v1

- Decision: Support optional `acceptSettings` for command approvals via a raw JSON object input that is validated client-side and forwarded unchanged.
- Why: Current app-server docs confirm `acceptSettings` exists but do not define a stable field schema; passthrough avoids hard-coding speculative keys.
- Consequence: UI exposes an advanced JSON field for command approvals only, and rejects invalid/non-object JSON before responding.

## 2026-02-07 - Introduce a multi-screen app shell before final visual polish

- Decision: Split the single long-scroll debug screen into four primary screens (`Connect`, `Turn`, `Approvals`, `Transcript`) under one in-app shell.
- Why: Functional separation makes day-to-day testing and future feature work (threads/auth/settings) easier before committing to final design language.
- Consequence: Existing behaviors are preserved but now surfaced in focused screens with per-screen badge counts.

## 2026-02-07 - Prefer explicit thread selection UX over implicit thread creation

- Decision: Add thread refresh/list/select controls to the `Turn` screen and keep explicit `Start New Thread` behavior.
- Why: Users need predictable control of conversation context and should not be forced into automatic thread creation every turn.
- Consequence: `turn/start` now commonly uses an existing selected thread id, with `thread/start` only when the user intentionally begins a new thread.

## 2026-02-07 - Increase JSON-RPC default request timeout to 30 seconds

- Decision: Raise mobile JSON-RPC default timeout from 8s to 30s.
- Why: On slower devices or bridge/app-server warm states, 8s can cause false-negative timeout errors for otherwise successful requests.
- Consequence: Fewer transient timeout failures; request-level overrides remain available for tests/specific flows.

## 2026-02-08 - Adopt editorial mobile shell for v1 runtime workflows

- Decision: Replace the early utilitarian mobile screen set with a distinct editorial shell using index-card threads, stamp-based approvals, and a three-tab IA (`Threads`, `Approvals`, `Settings`).
- Why: v1 requires high trust for remote execution decisions; stronger visual hierarchy and signature interactions improve scanability and decision confidence on phone-sized screens.
- Consequence: UI now depends on a dedicated design system layer (theme tokens, custom fonts, reusable primitives), plus animation/haptics packages for interaction feedback.

## 2026-02-08 - Map composer controls directly to `turn/start` / `thread/start` overrides

- Decision: Build runtime payloads from explicit mobile composer settings (mode, network, model, effort, reasoning) instead of using fixed defaults.
- Why: V1 requires transparent control over execution profile from phone; users need immediate effect from toggles.
- Consequence: Added pure `turn-settings` builder logic with tests and wired both thread creation and turn execution to use it.

## 2026-02-08 - Handle auth as first-class mobile workflow via account APIs

- Decision: Expose ChatGPT/API-key login, cancel, and logout directly in mobile settings, and track completion through `account/login/completed` + `account/updated`.
- Why: Bootstrap-only auth visibility was insufficient for real usage; users must be able to recover auth without leaving app context.
- Consequence: Added account parsing helpers, auth UI/actions, and explicit auth-state refresh path.

## 2026-02-08 - Auto-open ChatGPT auth URL in bridge runtime

- Decision: When app-server responds to ChatGPT login start with `authUrl`, bridge opens it on the local computer browser automatically.
- Why: ChatGPT callback is hosted on localhost by app-server; opening from the computer avoids dead-end auth starts from phone-only context.
- Consequence: Added cross-platform URL opener with safe protocol checks and a disable flag (`--no-open-auth-url`) for headless environments.

## 2026-02-08 - Implement Pierre-style diff UI natively instead of embedding `@pierre/diffs`

- Decision: Build a native React Native diff parser + renderer inspired by Pierre's diff aesthetic, rather than importing `@pierre/diffs` directly.
- Why: `@pierre/diffs` and `@pierre/precision-diffs` require `react-dom` and are web-first, which does not fit Expo React Native runtime.
- Consequence: Added `parseUnifiedDiff` and `PierreDiffCard` for mobile-safe diff rendering, and wired reducer support for `turn/diff/updated` + `turn/plan/updated`.
