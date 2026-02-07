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
- Bridge package supports token auth, single-client lock, and app-server passthrough
- Mobile package is now an Expo scaffold (`expo` + `react-native`) with app identity set to `Codex Mobile`
- Docs folder now tracks decisions, learnings, mistakes, and best practices
