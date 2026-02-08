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

## Product constraints (v1)

- Computer must be ON for Codex execution.
- Single connected phone per bridge instance.
- LAN first, Tailscale fallback.

Keep this file updated as new operational patterns are discovered.
