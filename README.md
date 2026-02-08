# Codex Mobile

Codex Mobile is a Turborepo monorepo for the v1 mobile client and local computer bridge.

## Packages

- `apps/mobile`: mobile client (initial scaffold)
- `apps/bridge`: local bridge that exposes WebSocket and proxies to `codex app-server`
- `packages/protocol`: shared protocol types and validators

## Commands

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm dev:bridge`
- `pnpm dev:mobile`

## Manual App Testing (Android Emulator)

This section is the canonical step-by-step manual test runbook for local development.

### Prerequisites

1. Node.js 20+ and PNPM available.
2. Android Studio installed with at least one bootable emulator.
3. Android SDK tools available in PATH (`adb` should work in PowerShell).
4. Emulator already running before launching the app.

### One-time setup

1. Install deps at repo root:
```powershell
pnpm install
```
2. Optional quality baseline:
```powershell
pnpm lint
pnpm typecheck
pnpm test
```

### Runtime setup (3 terminals)

Use exactly 3 terminals from `D:\projects\codexAndroid`.

1. Terminal 1: run bridge
```powershell
pnpm dev:bridge
```
If you are on a headless machine or do not want browser auto-launch during ChatGPT auth, run:
```powershell
pnpm --filter @codex-mobile/bridge dev -- --no-open-auth-url
```

2. Terminal 2: run mobile bundler
```powershell
pnpm dev:mobile
```

3. Terminal 3: open app on Android emulator
```powershell
pnpm --filter @codex-mobile/mobile android
```

If Terminal 3 fails to launch the app, go to Terminal 2 and press `a`.

### What success looks like

1. Terminal 1 prints bridge startup logs.
2. Terminal 2 starts Metro successfully.
3. Emulator opens Expo Go and loads Codex Mobile.

## Manual App Testing (Physical Android Phone)

Use this when emulator performance is too slow.

### Prerequisites

1. Android phone and development machine are on the same Wi-Fi network.
2. Expo Go installed on the phone.
3. Bridge machine firewall allows local network traffic for Node/Expo processes.
4. Computer stays ON while testing (bridge runs on computer).

### Runtime setup (2 terminals + phone)

Use 2 terminals from `D:\projects\codexAndroid`.

1. Terminal 1: run bridge
```powershell
pnpm dev:bridge
```

2. Terminal 2: run mobile bundler
```powershell
pnpm dev:mobile
```

3. On phone:
   1. Open Expo Go.
   2. Scan the QR shown by Metro in Terminal 2.
   3. If QR scan fails, paste the shown `exp://...` URL manually in Expo Go.

### What success looks like

1. Phone opens Codex Mobile from Expo Go.
2. App can pair and connect to bridge over LAN.
3. Turn stream and approval UI are interactive on device.

### Notes for remote testing

1. LAN is the default path.
2. If LAN fails and pairing payload includes a Tailscale endpoint, the app can fall back to Tailscale.
3. For any remote test path, computer/bridge must remain online.

### In-app manual test checklist (v1 current scope, emulator or phone)

Run these in order:

1. Pairing
   1. Confirm app starts with either no pairing or previously saved pairing.
   2. Paste valid pairing JSON and apply.
   3. Confirm pairing details (name/endpoints) are rendered.

2. Connection
   1. Tap `Connect to Bridge`.
   2. Confirm status reaches `App server ready`.
   3. Confirm snapshot fields are populated (`authMode`, models, threads).

3. Turn execution
   1. Enter a prompt in Turn Composer.
   2. Run turn and verify transcript starts streaming items.
   3. Confirm turn status transitions (`inProgress` -> terminal state).

4. Approvals UI
   1. Trigger a turn that requests approval.
   2. Confirm `Pending Approvals` card appears with thread/turn/item ids.
   3. Test `Decline`.
   4. Trigger again and test `Accept`.
   5. For command approvals, optionally provide valid JSON in `acceptSettings` and accept.

5. Reconnect behavior
   1. While connected, stop bridge (Ctrl+C in Terminal 1).
   2. Confirm app status shows reconnect attempt with backoff.
   3. Restart bridge (`pnpm dev:bridge`) and confirm app reconnects.

6. Heartbeat degradation and recovery
   1. Keep app connected, then temporarily block connectivity (for example disable Wi-Fi on phone for ~10-15s).
   2. Confirm diagnostics shows heartbeat degraded and app attempts reconnect automatically.
   3. Restore connectivity and confirm health returns to connected with fresh latency samples.

### Quick troubleshooting

1. Emulator not detected:
```powershell
adb devices
```
You should see `emulator-xxxx    device`.

2. Expo Go install fails from CLI:
```powershell
adb -s emulator-5554 install -r -d --user 0 C:\Users\<your-user>\.expo\android-apk-cache\Expo-Go-54.0.6.apk
```
Then retry:
```powershell
pnpm --filter @codex-mobile/mobile android
```

3. Force reinstall Expo Go:
```powershell
adb -s emulator-5554 uninstall host.exp.exponent
pnpm --filter @codex-mobile/mobile android
```

4. Metro port conflict (for example 8081 busy):
   1. Accept alternate port when prompted.
   2. Or stop the old Metro process and relaunch.

5. Stale cache / weird bundling behavior:
```powershell
pnpm --filter @codex-mobile/mobile dev -- --clear
```

6. Phone cannot open app from QR:
   1. Confirm phone and laptop are on the same Wi-Fi SSID.
   2. In Expo Go, try manual URL entry using the `exp://` URL printed by Metro.
   3. Restart Metro (`pnpm dev:mobile`) and scan again.

7. Phone app opens but cannot connect to bridge:
   1. Confirm bridge is running in Terminal 1.
   2. Confirm pairing payload endpoint IP matches the bridge machine current LAN IP.
   3. Check local firewall rules on the bridge machine.
   4. If available, retry using pairing payload Tailscale endpoint.

### Optional log inspection

```powershell
adb logcat | Select-String -Pattern "ReactNative|Expo|codex"
```
