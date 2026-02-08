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
- Bridge now defaults to `codex.cmd` on Windows hosts (instead of bare `codex`) to reduce app-server spawn `ENOENT` failures
- Bridge now emits `appServerStatus` control events (`starting`, `running`, `stopped`, `error`) so mobile can surface app-server health explicitly
- Bridge now auto-opens ChatGPT auth URLs on the computer when `account/login/start` (chatgpt) returns `authUrl`, with opt-out flag `--no-open-auth-url`
- Bridge emits `__bridge.authBrowserLaunch` status to mobile so the app can display browser-launch success/failure feedback in realtime
- Bridge now accepts `__bridge.clientLog` messages from mobile and prints them to terminal logs for phone-side error visibility
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
  - `thread/resume` before `turn/start` when an existing archived/listed thread is selected
  - auth gate before `turn/start` when account state is unauthenticated (`authMode: none`)
  - `turn/start` for user prompts
  - streaming transcript updates from `turn/*` and `item/*` notifications
- Mobile approval flow now handles server-initiated requests:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - explicit accept/decline responses from app UI
  - optional command `acceptSettings` JSON passthrough on accept decisions
  - approval cards now show thread/turn ids and latest transcript item context by `itemId`
  - approval cards and bottom-sheet now include explicit risk summaries (`LOW/MEDIUM/HIGH`) and available diff preview context before decision
  - each risk reason now has a compact `Why` explainer toggle for operator clarity
- Mobile auth workflow now includes:
  - `account/login/start` via ChatGPT flow
  - `account/login/start` via API key
  - `account/login/cancel`
  - `account/logout`
  - auth state refresh from `account/read` + `account/updated` + `account/login/completed`
- Mobile connection lifecycle now supports reconnect with exponential backoff after unexpected disconnects
- Connection diagnostics now include:
  - per-endpoint attempt logs (`lan` / `tailscale`) with reason + duration
  - actionable connection hints derived from fallback failures
  - connection health state (`connected` / `connecting` / `degraded` / `offline`)
  - latency trend history visible in settings diagnostics
  - bridge app-server status visibility in settings diagnostics
- Mobile now runs an active bridge heartbeat loop (`__bridge.ping` / `__bridge.pong`) after bootstrap:
  - continuously refreshes connection latency
  - marks connection degraded on missed heartbeat windows
  - forces socket reconnect after repeated missed heartbeats
- Mobile now forwards app errors (and unhandled JS exceptions when available) to bridge through `__bridge.clientLog` with screen/endpoint context
- Session transcript now includes:
  - command `cwd` context on command execution items
  - file-change summaries from `changes`
  - `item/fileChange/outputDelta` aggregation
  - `turn/plan/updated` projection into plan cards
  - `turn/diff/updated` projection into a unified diff card experience
  - `item/plan/delta` and `item/reasoning/summaryTextDelta` streaming text support
- Mobile UI now uses an editorial "paper on carbon" shell with four primary tabs:
  - `Threads`: machine fallback (when disconnected), thread-library management, and archive controls
  - `Agent`: opened-thread workspace, composer, and transcript timeline
  - `Approvals`: dedicated approval desk with explicit approve/decline actions
  - `Settings`: machine controls, appearance/safety/diagnostics controls
- Mobile design system added:
  - Carbon/Parchment theme tokens
  - Fraunces + Commissioner + Azeret Mono font system
  - reusable primitives (`AppBackground`, `Typo`, `IndexCard`, `Chip`, `Stamp`, `PierreDiffCard`)
- Mobile runtime preferences are now persisted across app restarts:
  - active screen (`threads`, `agent`, `approvals`, `settings`)
  - appearance (`themeName`, motion override)
  - composer defaults (`mode`, `network`, `effort`, `reasoning`)
  - model preference (`selectedModelId`) with runtime validation against available models
  - operator view toggles (`tool calls`, `archived threads`)
- Approval UX now includes a visible stamp animation moment on approve/decline decisions
- RPC request timeout default increased to 30s to reduce transient timeout failures in slower runtime conditions
- Interrupt action now calls `turn/interrupt` for active turn/thread instead of disconnecting the bridge socket
- Composer toggles now affect runtime turn parameters:
  - model selection
  - effort
  - mode-based sandbox policy
  - network access
  - reasoning summary mode
- Thread lifecycle management now includes:
  - enriched thread metadata rendering (provider/source/updated time)
  - cursor-based `thread/list` pagination with load-more behavior
  - explicit selected-thread actions: resume, fork, archive, unarchive
- Bridge endpoint discovery now supports Tailscale MagicDNS hostnames (when available via local `tailscale status --json`)
- Docs folder now tracks decisions, learnings, mistakes, and best practices
