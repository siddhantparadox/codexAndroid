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
