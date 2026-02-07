# Decisions

## 2026-02-07 - Use Turborepo + PNPM workspace

- Decision: Standardize on Turborepo for task orchestration and PNPM workspace for package management.
- Why: Shared protocol types across mobile and bridge require strong dependency graph orchestration and consistent caching.
- Consequence: All package tasks are defined in package-level `package.json` scripts and run via `turbo run` from root.

## 2026-02-07 - Keep v1 transport local-network only

- Decision: Keep bridge communication on LAN/Tailscale over `ws://` for v1.
- Why: Minimizes deployment complexity and keeps computer-local execution model intact.
- Consequence: No public relay, no port forwarding, and no cloud runner in v1.