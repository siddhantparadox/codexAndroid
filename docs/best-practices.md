# Best Practices

## Engineering

- Keep package tasks in package `package.json` files; root only delegates through `turbo run`.
- Validate shared message contracts in `packages/protocol` before wiring runtime behavior.
- Keep bridge control events (`__bridge`) distinct from app-server protocol pass-through.
- Treat Codex app-server initialization as a strict handshake: `initialize` then `initialized`, exactly once per process lifecycle.
- Keep bridge pairing UX dual-path:
  - machine-readable QR payload for normal pairing
  - manual JSON input fallback for debugging and camera-permission edge cases
- Implement connection strategy explicitly as ordered attempts (`lan` before `tailscale`) and keep per-attempt failure reasons for user-facing diagnostics.
- Use a dedicated request/response manager for app-server JSON-RPC (`id` tracking + timeout + close/error fanout), not ad-hoc `onmessage` logic in UI components.
- Keep turn/item stream processing in a pure reducer and unit-test key method paths (`item/started`, deltas, `item/completed`, `turn/completed`).
- Use optimistic local user transcript entries before remote turn stream starts to improve responsiveness.
- Treat server-initiated approval events as first-class request/response flows with explicit request-id resolver maps and deterministic cleanup on disconnect.
- Cap reconnect backoff and guard against duplicate timers to avoid reconnect storms after transient bridge/socket failures.
- Keep reconnect delay calculations and approval payload parsing in pure modules with dedicated unit tests.
- For optional protocol extensions with unspecified schema, validate input shape (JSON object) and forward transparently instead of hard-coding assumptions.
- In approval UIs, always display thread/turn/item identifiers and the latest transcript snapshot keyed by `itemId` to reduce blind approvals.
- Summarize proposed file changes directly from item payloads before approval decisions.
- Keep app shell metadata (screen list, badge rules) in a pure module with tests, even if navigation is local state for now.
- Separate user workflows into focused screens early to reduce regression risk while iterating on protocol-heavy features.
- Keep thread operations explicit in UI (`refresh`, `select`, `new`) and make selected thread state visible before running a turn.
- Centralize protocol-list parsing (such as `thread/list`) into shared utilities used by both bootstrap and incremental refresh actions.
- Set conservative default RPC timeouts for mobile runtime conditions; use shorter overrides only in tests.
- Keep UI identity in explicit design tokens and shared primitives; avoid screen-level hard-coded colors/typography.
- Use a distinct monospace style for command/log content so approvals and transcript output remain scannable under high update frequency.
- Keep approval decisions high-friction and explicit (approve/decline only), with immediate local feedback and clear state transition messaging.
- Respect reduced motion in every signature animation path.
- Keep request payload shaping in pure helper modules with tests whenever UI toggles influence execution behavior.
- Treat auth lifecycle notifications as state transitions to reconcile immediately, rather than relying on periodic reads.
- For ChatGPT auth in app-server integrations, prefer bridge-side local browser launch of returned `authUrl` and provide a CLI opt-out for non-interactive/headless runs.
- Validate package runtime targets before adoption (`react-dom` packages are not portable to Expo native without wrappers).
- Keep aggregated turn diffs and plan updates as first-class timeline artifacts (`turn/diff/updated`, `turn/plan/updated`) to preserve execution transparency.
- Cap diff rendering work (max files + max lines per hunk) and surface truncation explicitly to balance fidelity with mobile performance.
- Parse paginated API responses into page models first, then derive flattened UI lists; avoid losing cursor state in parser boundaries.
- When users can select historic threads, enforce `thread/resume` before starting a turn unless the thread is already known in-memory.
- In endpoint fallback flows, treat missing endpoints as explicit diagnostic events rather than implicit no-ops.
- Keep user-facing connection hints deterministic and endpoint-scoped (LAN guidance should differ from Tailnet guidance).
- For bridge runtimes, emit process-health events for child services (`codex app-server`) and show them in client diagnostics.
- Before proxying client RPC payloads, verify child process writability/state and return structured bridge errors on failure paths.
- Normalize discovered hostnames (for example trailing-dot DNS names) before serializing pairing endpoints.
- Treat bridge heartbeat (`ping`/`pong`) as an ongoing health contract: sample latency, surface degraded state on misses, and trigger controlled reconnect after bounded consecutive timeouts.
- Keep heartbeat logic isolated in a pure module with tests so connection-policy tuning does not require editing UI components directly.

## Product constraints (v1)

- Computer must be ON for Codex execution.
- Single connected phone per bridge instance.
- LAN first, Tailscale fallback.

Keep this file updated as new operational patterns are discovered.
