# Mistakes

## 2026-02-07

- Mistake: A unit test for server-initiated RPC approvals assumed the response was synchronously written to the socket.
- Root cause: `handleServerRequest` is async and schedules the send on a microtask even when the handler returns immediately.
- Remediation: Updated the test to await one microtask tick before asserting socket output.
- Prevention rule: For async request handlers, tests must explicitly await completion boundaries (`await Promise.resolve()` or equivalent) before checking side effects.

When mistakes happen, document:
- what happened
- root cause
- remediation
- prevention rule
