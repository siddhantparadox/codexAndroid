# Remote Access

## v1 behavior

- Primary connection path: `lan` endpoint on same Wi-Fi.
- Fallback path: `tailscale` endpoint when LAN path fails quickly.
- Public internet exposure is out of scope.

## Troubleshooting checklist

- Verify computer is powered on.
- Verify bridge process is running and port is open locally.
- Verify phone has route to LAN/Tailscale endpoint.
- Verify pairing token is valid.