# Codex Mobile

Codex Mobile is a Turborepo monorepo for the v1 mobile client and local computer bridge.

## Packages

- `apps/mobile`: mobile client (initial scaffold)
- `apps/bridge`: local bridge that exposes WebSocket and proxies to `codex app-server`
- `packages/protocol`: shared protocol types and validators

## Commands

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm dev:bridge`
- `pnpm dev:mobile`