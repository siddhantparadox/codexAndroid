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
