# AGENTS.md

This repository builds **Codex Mobile** (**Codex Remote v1**):
- **Mobile app**: Expo (React Native) client (Android-first UX; iOS later).
- **Computer bridge**: minimal local service that spawns `codex app-server` and tunnels the protocol to the phone.
- **V1 networking**:
  - **Home LAN** (same Wi‑Fi) is supported.
  - **Remote-from-anywhere via Tailscale** is supported (phone can be off-LAN) **as long as the computer is ON**.
- **Computer must be ON** to run Codex against local repos/workspaces.

You are an implementation agent working in this repo. Follow the rules below.

---

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Patterns you establish will be copied.  
Corners you cut will be cut again.  
Fight entropy. Leave the codebase better than you found it.

---

## Summary

Read architecture/style guides. Write/run tests. Check lint/types. Hardcore code review.

---

## Monorepo and Build System

- Use a **PNPM workspace + Turborepo** monorepo.
- Keep shared logic in `packages/*` and app/runtime code in `apps/*`.
- Use Turborepo for task orchestration (`lint`, `typecheck`, `test`, `build`, and scoped dev tasks).
- Do not introduce a second orchestration layer (Nx/Lerna/custom task runners) for v1.

---

## Required implementation workflow (for all implementations)

> Not for research or Q&A. For any actual coding/change work, you MUST do these steps.

### Plan
- Create a solid, high quality architecture plan (brief but concrete).
- Read `repo-root/docs/overview.md` **if it exists**.
  - If it does not exist and your change is non-trivial, create it (or update it) with the minimum needed context.

### Implement
- Implement incrementally.
- Ensure you write tests for whatever you implement.
  - Focus on: happy paths, common edge cases, and core logic.

### Validate
- Run the linter.
- Run the type checker.
- Run tests.

If you cannot run any of these (CI/down env), explain exactly why and provide best-effort alternatives.

---

## Setup commands (run these first)

### Prereqs
- Node.js **20+** recommended.
- PNPM recommended:
  - `corepack enable`

### Install
- `pnpm install`
- `pnpm turbo run build` (when build scripts exist)

### Run (development)
- Start the bridge (spawns `codex app-server`, exposes WebSocket server):
  - `pnpm dev:bridge`
- Start the mobile app (Expo dev server):
  - `pnpm dev:mobile`
- Launch Android:
  - `pnpm --filter @codex-remote/mobile android`
  - (or) `pnpm --filter @codex-remote/mobile start` then press `a`

### Quality checks (MUST run before finishing)
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test`

If scripts are missing, create them in the root `package.json` and ensure they work through Turborepo pipelines.

---

## Repository layout (expected)

- `apps/`
  - `mobile/` — Expo app
  - `bridge/` — Node.js bridge (CLI)
- `packages/`
  - `protocol/` — shared TS types/helpers (message framing, ids, reducers)
- `docs/`
  - `overview.md` — architecture & decisions (required as the repo grows)
  - `decisions.md` — ADR-style decisions (navigation/state libs, protocol envelope, etc.)
  - `ux.md` — UI structure and design rules
  - `remote-access.md` — Tailscale instructions & troubleshooting
- `AGENTS.md` — this file
- `codex-appserver-docs` -- codex app-server documentation
- `project.md` -- Project infrmation
- `v1spec.md` -- v1 spec information

Add nested `AGENTS.md` files in subfolders only when you need narrower rules.

---

## Product scope (v1)

### What we are building
A premium-feeling mobile client that lets a user:
1) Pair phone ↔ computer
2) Authenticate Codex (ChatGPT login or API key)
3) Browse threads and run new turns
4) See live streaming: plan, tool calls, command output, diffs
5) Approve/decline command executions and file changes

### V1 networking behavior
- **LAN**: works on the same Wi‑Fi using the computer’s LAN IP.
- **Remote**: works via **Tailscale** using the computer’s Tailscale IP or MagicDNS name.
- **No public internet exposure** in v1:
  - ❌ No port forwarding
  - ❌ No relay service
  - ❌ No cloud runner

### Hard non-goals (do not implement)
- ❌ Any non-Tailscale remote path (Cloudflare Tunnel, DDNS/port-forward, SSH tunnel UX, etc.)
- ❌ Multi-device concurrency per bridge (one phone at a time)
- ❌ Cloud runner / hosted workspace
- ❌ Full mobile file explorer/IDE (keep minimal; focus on Codex experience)

If a request conflicts with non-goals, propose a v2 follow-up instead of implementing.

---

## System architecture (v1)

### Runtime components
1) **Mobile (Expo)** connects to the bridge over WebSocket.
2) **Bridge** spawns `codex app-server` and forwards messages:
   - Mobile ⇄ Bridge: WebSocket (JSON messages)
   - Bridge ⇄ App Server: stdin/stdout (JSONL, one JSON object per line)

### Transport rules
- v1 uses **ws://** (LAN or Tailscale overlay). Do not expose on public internet.
- Authentication is a **pairing token** embedded in the QR payload.
- Enforce **single connected phone** at a time.

---

## Remote access in v1 (Tailscale)

### Design goal
Remote access must be:
- easy for users (install Tailscale on phone + computer; log in)
- reliable (no NAT traversal work by us)
- safe by default (no router changes, no public ports)

### Requirements
- Bridge must support two endpoint types:
  - `lan`: `ws://192.168.x.y:<port>/ws`
  - `tailscale`: `ws://100.x.y.z:<port>/ws` OR `ws://<magicdns-name>:<port>/ws` (if available)
- Mobile connection strategy:
  1) try `lan`
  2) if fails quickly, try `tailscale`
  3) show actionable errors (“computer asleep”, “Tailscale not connected”, “wrong Wi‑Fi”)

### QR payload schema (v1)
Encode JSON text in QR:

```json
{
  "v": 1,
  "name": "Home Computer",
  "token": "<random-long-token>",
  "endpoints": {
    "lan": "ws://192.168.1.23:8787/ws",
    "tailscale": "ws://100.101.102.103:8787/ws"
  },
  "cwdHint": "/path/to/repo"
}
```

## Documentation
- Use codex-appserver-docs.md to reference Openai codex app server documentation.
- Browse web to reference any other documentation that might be useful if you are unsure about something.
- Use the internet to find any other information that might be useful.

## Agent Skills
- use /rams to see real-time design feedback in your AI coding agent.
  1. curl -fsSL https://rams.ai/install | bash
  2. /rams
  3. If failed to use /rams, remove it from AGENTS.md file.
- Use appropriate skills from .agents/skills when needed to code using best practices.
- Use the Turborepo skill at `.agents/skills/turborepo/SKILL.md` for workspace, pipeline, caching, and task-graph changes.
- If a repo uses `.agent/skills` in another branch or machine setup, check that path as a fallback.

## MCPs
- Use `openaiDeveloperDocs` MCP server to browse relevant openai developer documentation like Codex and codex app server and any thinge else required.

## Remember this file AGENTS.md is a growing and evolving file so make sure to update it with important information as we build the app like learnings, mistakes, best practices, and other important information.
