# UX

## v1 principles

- Fast access to pairing, connection status, and active thread.
- Streaming-first interface for plan, tool calls, command output, and diffs.
- High-friction actions (approvals) use explicit, contextual confirmation.

## Visual direction

- Editorial mission-control aesthetic ("paper on carbon").
- Theme modes:
  - Carbon (default)
  - Parchment (optional reading mode)
- Font stack:
  - Fraunces (display)
  - Commissioner (body/UI)
  - Azeret Mono (code/logs)

## Information architecture

- Bottom tabs:
  - Threads
  - Approvals
  - Settings
- Global machine pill at top:
  - paired machine name
  - connection mode label (LAN/TAILNET/OFFLINE)
  - quick path to settings

## Signature interactions

- Thread archive uses index-card styling with slight tilt variation.
- Approvals use explicit stamp animation (`APPROVED` / `DECLINED`) with haptic feedback.
- Composer controls use tactile chips and quick actions.
- Diff rendering uses a Pierre-style unified patch card with file headers, hunk headers, line numbers, and add/remove color channels.

## Accessibility and runtime rules

- Reduced motion respects OS setting with in-app override.
- Controls keep minimum 44dp hit target.
- Dynamic text scaling is supported by default text rendering.
