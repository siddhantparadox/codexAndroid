# Overview

## Project

Codex Mobile (Codex Remote v1) is a mobile-first client that connects to a local computer bridge, which in turn runs `codex app-server` against local repositories.

## v1 architecture

- `apps/mobile`: user-facing client UX
- `apps/bridge`: WebSocket bridge + app-server process manager
- `packages/protocol`: shared JSON message schemas and TypeScript contracts

## Networking

- Home LAN over `ws://`
- Tailscale endpoint fallback over `ws://`
- No public internet exposure in v1

## Current implementation state

- Monorepo scaffold created with Turborepo + PNPM workspace
- Protocol package defines pairing and bridge-control schemas
- Bridge package supports token auth, single-client lock, app-server passthrough, and terminal QR output for pairing
- Mobile package includes initial pairing flow:
  - QR scan support via `expo-camera`
  - manual JSON pairing fallback
  - pairing persistence via `expo-secure-store`
  - LAN-first then Tailscale connection fallback
- Mobile now initializes Codex app-server after connection and boots initial data:
  - `initialize` + `initialized`
  - `account/read`
  - `model/list`
  - `thread/list`
- Mobile turn flow now includes:
  - `thread/start` on first prompt when no active thread exists
  - `turn/start` for user prompts
  - streaming transcript updates from `turn/*` and `item/*` notifications
- Mobile approval flow now handles server-initiated requests:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - explicit accept/decline responses from app UI
- Mobile connection lifecycle now supports reconnect with exponential backoff after unexpected disconnects
- Docs folder now tracks decisions, learnings, mistakes, and best practices
