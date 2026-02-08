# Mistakes

## 2026-02-07

- Mistake: A unit test for server-initiated RPC approvals assumed the response was synchronously written to the socket.
- Root cause: `handleServerRequest` is async and schedules the send on a microtask even when the handler returns immediately.
- Remediation: Updated the test to await one microtask tick before asserting socket output.
- Prevention rule: For async request handlers, tests must explicitly await completion boundaries (`await Promise.resolve()` or equivalent) before checking side effects.
- Mistake: Pairing persistence key used `codex-mobile/pairing`, which is rejected by Expo SecureStore on Android.
- Root cause: SecureStore key constraints were not validated against Android requirements during initial implementation.
- Remediation: Migrated to `codex-mobile.pairing` and added fallback migration for legacy key reads.
- Prevention rule: Use only `[A-Za-z0-9._-]` in SecureStore keys and cover key-format assumptions in unit tests.
- Mistake: Attempted a single oversized rewrite of `apps/mobile/App.tsx` in one patch command.
- Root cause: Command/payload size limits were ignored during a large UI refactor.
- Remediation: Split file writes into smaller chunks and kept componentized UI primitives in separate files to reduce patch size.
- Prevention rule: For large UI rewrites, break changes into modular files first, then integrate incrementally.
- Mistake: Assumed a web diff library could be dropped into Expo native UI without runtime constraints review.
- Root cause: Package compatibility checks were deferred until implementation.
- Remediation: Verified peer dependencies (`react-dom`) before integration and implemented a native diff renderer for mobile.
- Prevention rule: For each UI dependency, confirm platform compatibility (`react-native` vs `react-dom`) before design implementation starts.

## 2026-02-08

- Mistake: Wrote an initial heartbeat test that assumed no follow-up ping after one interval tick.
- Root cause: Test setup used `timeoutMs` shorter than `intervalMs`, so the first ping timed out before the next interval as designed.
- Remediation: Updated the test to use a longer timeout for that scenario and retained a separate timeout-specific test case.
- Prevention rule: For timer-driven tests, explicitly validate interval/timeout relationships before asserting event counts.
- Mistake: Left machine pairing/connection controls permanently in the `Threads` workflow after introducing multi-screen shell navigation.
- Root cause: Screen-content separation rules were not revisited after tab architecture was added, so operational controls stayed in the execution screen.
- Remediation: Moved machine controls to `Settings` and kept a disconnected-only fallback card in `Threads`.
- Prevention rule: For each new screen split, explicitly classify each card as `workflow` vs `configuration` and enforce that split in UI placement helpers/tests.
- Mistake: Left turn submission ungated while unauthenticated account states were possible (`authMode: none`).
- Root cause: Auth controls existed in Settings, but the send action path did not enforce account prerequisites.
- Remediation: Added a turn-submit auth gate and redirected unauthenticated send attempts to auth choices (ChatGPT/API key).
- Prevention rule: For every privileged action, implement prerequisite checks in the action handler itself, not only in surrounding screens.

When mistakes happen, document:
- what happened
- root cause
- remediation
- prevention rule
