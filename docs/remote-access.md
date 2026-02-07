# Remote Access

## v1 behavior

- Primary connection path: `lan` endpoint on same Wi-Fi.
- Fallback path: `tailscale` endpoint when LAN path fails quickly.
- Public internet exposure is out of scope.

## Current implementation

- Mobile connection utility performs ordered WebSocket attempts:
  1. `lan`
  2. `tailscale`
- Bridge startup now prints pairing JSON and a terminal QR to support scan-based pairing.

## Troubleshooting checklist

- Verify computer is powered on.
- Verify bridge process is running and port is open locally.
- Verify phone has route to LAN/Tailscale endpoint.
- Verify pairing token is valid.
