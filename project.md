## Do you need Android Studio, or will VS Code work?

You can **build an Expo app using VS Code** (that’s where most people write the code), but as a beginner you should **install Android Studio anyway** because it gives you:

* the **Android SDK** + emulator (easy way to run/debug your app)
* native profiling tools (useful later)
* fewer “why won’t my device connect” headaches

So:

* **Coding:** VS Code is totally fine.
* **Running/testing like a pro:** Android Studio is **strongly recommended** (even if you mostly use VS Code).

Also note: Expo’s docs say VS Code debugging exists, but it’s **in alpha**, and they recommend React Native DevTools for the most stable debugging experience. ([Expo Documentation][1])

---

## What you’re building in v1

### Goal (v1)

A **beautiful “Codex on your phone”** experience, but limited to:

* The user is at home
* **Phone and computer are on the same home Wi‑Fi/LAN**
* The **computer is ON** (because that’s where the repo/files/tests live)

No VPN/relay/cloud runner in v1 — you’ll add those later.

### The key design truth

To match “Codex VS Code extension–like” features (streamed events, approvals, tool calls, diffs, threads), you build on **Codex App Server**, which is specifically “the interface Codex uses to power rich clients (e.g. the Codex VS Code extension)”. ([OpenAI Developers][2])

But App Server talks **JSONL over stdio**, so the phone cannot connect directly. ([OpenAI Developers][3])
That’s why you need a **basic companion (bridge) running on the computer** in v1.

---

## v1 Architecture (simple + best-practice)

### Components

**1) Expo mobile app (React Native)**

* UI/UX, settings toggles, thread list, approvals screen
* Connects to your computer over **WebSocket** (React Native supports WebSockets out of the box). ([reactnative.dev][4])

**2) “Companion” bridge (basic for v1)**

* A small Node.js process the user runs on their computer
* Spawns `codex app-server` and forwards messages between:

  * Phone (WebSocket)
  * App Server (stdin/stdout JSONL)

**3) `codex app-server`**

* Streams “turn/item” events (messages, diffs, command output, tool calls)
* Handles approvals via server-initiated requests
* Stores thread history on disk ([OpenAI Developers][3])

### Data flow (ASCII)

```
[Expo App on Phone]
   WebSocket (LAN)
        |
        v
[Bridge on Computer]  <-->  stdin/stdout JSONL  <-->  [codex app-server]
        |
        v
   Local repo + sandbox + command execution
```

### Why this matches the VS Code extension feel

Because you’re speaking the same App Server protocol that provides:

* conversation history (threads)
* streamed agent events (items + deltas)
* approvals
* auth modes ([OpenAI Developers][2])

---

## Can users work if their computer is off?

### In v1 (local mode): **No**

If the computer is off:

* there’s no repo filesystem
* no test runner / commands
* no sandboxed execution
* no App Server process to stream events

So the user can only:

* **read previously cached history** on the phone (optional feature)
* but cannot run new tasks

This aligns with Codex’s “local” model: it runs in an OS sandbox and operates on the current workspace; without the machine, there’s nothing to operate on. ([OpenAI Developers][5])

### Future (cloud runner mode): **Yes**

…but that becomes a different mode where you host the runtime and workspace in the cloud (you said later — good plan).

---

## Will it work if the user is not in the city?

### In v1 (home network only): **No**

If you purposely restrict to LAN and don’t implement VPN/relay yet, the phone won’t be able to reach the bridge from another city.

### Future versions: **Yes**

With VPN or a relay, it will work as long as the computer is on (or in cloud-runner mode).

**Best practice for v1:** still design the app so “connection transport” can be swapped later (LAN → VPN → relay) without rewriting the whole protocol layer.

---

# Start from zero: Everything you need to build v1

## 0) What you need installed (developer prerequisites)

### On your development computer

* **Node.js** (LTS)
* **Git**
* **VS Code** (editor)
* **Android Studio** (recommended: emulator + SDK tools)

### Expo tooling

Expo’s CLI is `npx expo` (that’s the standard interface). ([Expo Documentation][6])

For builds you will likely use **EAS Build**, a hosted service that creates installable Android/iOS binaries and can manage signing credentials. ([Expo Documentation][7])

### Why you should plan for “development builds” early

Expo Go is convenient, but it has limitations and isn’t meant to represent production behavior (for example, push notifications and native configuration constraints). Expo recommends testing certain behaviors in **development builds** so you get parity with production. ([Expo Documentation][8])

For your app specifically:

* you’ll want a stable, “real app” environment early
* and later you may want native customizations (TLS pinning, background behavior)

So v1 development can start with Expo Go, but you should move to **dev builds** quickly.

---

## 1) What the user does (v1 user flow)

### Flow A — Setup (first day)

1. User installs Codex CLI on their computer (or your bridge installs/validates it).
2. User runs your bridge in a repo folder:

   * Bridge starts
   * Bridge prints a QR code
3. User installs your mobile app.
4. User taps **Add Computer** → scans QR → connected.
5. Mobile shows **Sign in**:

   * “Sign in with ChatGPT” or “Use API key”
6. User signs in and starts using Codex from the phone.

Codex supports signing in with ChatGPT subscription access or API credits via API key. ([OpenAI Developers][9])

### Flow B — Daily usage (home network)

1. Open app → see recent **threads**
2. Pick a thread or tap **New thread**
3. Choose:

   * model
   * reasoning effort
   * mode (Chat / Agent / Auto)
   * network on/off
4. Type request → press Run
5. Watch streaming:

   * plan
   * tool calls
   * command output
   * diffs
6. Approve commands / file changes in sleek bottom sheets
7. Done — review diff, run tests again if needed

App Server is built around Threads → Turns → Items, streaming item deltas in real time. ([OpenAI Developers][3])

---

## 2) Companion “Bridge” (keep it basic, but correct)

### What it must do (v1)

* Start `codex app-server`
* Perform the App Server initialize handshake once
* Open a WebSocket server on the LAN
* Pair a phone via QR (URL + token)
* Forward JSON messages:

  * phone → app-server stdin
  * app-server stdout → phone
* Allow only **one phone connection** in v1 (simplifies everything)

### App Server protocol constraints you must follow

* App Server streams **JSONL over stdio**
* It’s JSON-RPC-like, but omits `"jsonrpc":"2.0"` ([OpenAI Developers][3])
* You must send:

  * `initialize` request
  * then `initialized` notification
  * before other calls ([OpenAI Developers][3])

### Why the bridge should handle `initialize` (v1 best practice)

If the phone disconnects and reconnects, you don’t want to re-run initialize and fight “Already initialized” errors. App Server explicitly documents initialization as a one-time lifecycle step. ([OpenAI Developers][3])

So the bridge should do initialize once on startup and keep App Server running.

### Pairing (v1 best practice)

Because you are on a home LAN, the main risk is a random device on the same Wi‑Fi connecting.

So your v1 pairing should include:

* **random long token** generated by the bridge
* QR code contains: `ws://<computer-ip>:<port>?token=<token>`
* phone must present the token to connect

Store the token on the phone using SecureStore.

> v1 note: encryption (WSS) is ideal, but self-signed cert trust is painful in Expo managed apps. In v1 LAN-only, “ws + strong pairing token + no port forwarding” is the practical baseline; move to WSS/TLS pinning when you add remote access.

---

## 3) Mobile app (Expo) structure

### Why Expo fits your v1

* fast UI iteration
* one codebase (Android now; iOS later)
* easy QR scanning and secure storage

### Core Expo libraries you’ll use

1. **WebSocket** (built-in React Native)

   * for streaming JSON messages in both directions ([reactnative.dev][4])
2. **expo-camera** for QR scan

   * CameraView can detect barcodes in preview ([Expo Documentation][10])
3. **expo-secure-store** for pairing tokens / remembered computers

   * encrypted key-value store; beware large value limitations ([Expo Documentation][11])
4. **FlatList** for high-performance transcript rendering

   * follow RN’s guidance (use light components, keep list efficient) ([reactnative.dev][12])

### Performance baseline in 2026

* Expo uses Hermes by default and recommends it; Hermes can improve startup time and memory usage. ([Expo Documentation][13])
* Debugging is best done with React Native DevTools (not Chrome DevTools). ([Expo Documentation][1])

---

# The “Codex-quality” UX you want (how the app should feel)

## The main screen layout (feels like a premium IDE panel)

* **Top bar:** Computer name + connection status + workspace name
* **Thread list:** recent threads, search, archive
* **Thread view:** timeline of items with “cards”
* **Composer:** bottom input + quick toggles row
* **Side panels (tabs):**

  * Plan
  * Diff
  * Logs
  * Tools

## Your “Quick Toggles Row” (super easy on/off)

Keep these above the prompt input so users don’t hunt in Settings:

* Mode: **Chat / Agent / Auto**
* Network: **Off / On** (default Off)
* Show tool calls: **On / Off**
* Show reasoning summaries: **On / Off**
* Show raw reasoning: **On / Off** (label “model-dependent”)
* Model dropdown
* Effort segmented (low / medium / high, based on `model/list`)

These map cleanly to App Server turn overrides (model, effort, sandboxPolicy, approvalPolicy, summary/personality). ([OpenAI Developers][3])

---

# Streaming: how you show everything in real time

App Server’s best practice is: treat `item/*` notifications as truth, and treat `item/completed` as authoritative final state. ([OpenAI Developers][3])

## Your UI renders “Items” as cards

Examples of item types App Server streams:

* `agentMessage` (with `item/agentMessage/delta`)
* `commandExecution` (with `item/commandExecution/outputDelta`)
* `fileChange` (diffs)
* `reasoning` (summary + raw blocks, when supported)
* `mcpToolCall`, `webSearch`, etc. ([OpenAI Developers][3])

## Important practical note

App Server docs note `turn/diff/updated` and `turn/plan/updated` may include empty items arrays, so rely on item events. ([OpenAI Developers][3])
So don’t build your UI around “fetch full turn repeatedly.” Build it around the event stream.

---

# Approvals: make it elegant

App Server can pause and send a **server-initiated request** asking your client to approve command execution or file changes, and your client must respond with `{ decision: "accept" | "decline" }`. ([OpenAI Developers][2])

## UX pattern that feels premium

* When approval request arrives:

  * show a **bottom sheet**
  * show:

    * command + cwd + parsed display form (for commands)
    * diff preview (for file changes)
    * reason/risk text if present ([OpenAI Developers][2])
  * buttons:

    * Approve
    * Decline
* When user decides:

  * send the approval response immediately
  * UI transitions from “Pending approval” → “Running…” smoothly

This is one of the most important “feels like VS Code extension” moments.

---

# Authentication options (v1)

Codex supports:

* ChatGPT subscription sign-in
* API key sign-in
* device code sign-in (beta) ([OpenAI Developers][9])

## v1 recommendation (home user)

* Primary: **ChatGPT sign-in**
* Secondary: **API key**
* Optional advanced: **Device code** (great for headless setups)

Also note: Codex documentation indicates some functionality may differ depending on auth method (e.g., cloud-thread features). ([OpenAI Developers][9])

---

# Step-by-step implementation plan (developer)

## Phase 1 — Build the bridge first (so you can stream events immediately)

1. Create Node project (TypeScript)
2. Spawn `codex app-server`
3. Send `initialize` then `initialized` once ([OpenAI Developers][3])
4. Start WebSocket server
5. Print pairing URL and QR
6. Forward messages

**Versioning best practice:** App Server is powerful but the CLI reference notes `codex app-server` may change without notice. ([OpenAI Developers][14])
So pin a Codex version for your bridge and generate matching schemas:

`codex app-server generate-ts --out ./schemas`
`codex app-server generate-json-schema --out ./schemas` ([OpenAI Developers][3])

That’s how you avoid “my app broke after a Codex update.”

## Phase 2 — Build Expo mobile MVP

1. Create Expo app
2. Add QR scanner screen (expo-camera) ([Expo Documentation][10])
3. Store paired computer info in SecureStore ([Expo Documentation][11])
4. Connect WebSocket, parse JSON events ([reactnative.dev][4])
5. Render timeline with FlatList (stable keys) ([reactnative.dev][12])
6. Implement:

   * thread list / thread start
   * turn start
   * streaming deltas
7. Implement approvals (bottom sheet)
8. Add the quick toggles row

## Phase 3 — “Polish to VS Code quality”

* Diff viewer improvements (file list → hunks)
* Logs viewer (tail + expand)
* Settings screen that uses `config/read` / `config/value/write` later
* Better reconnect behavior

---

# Best practices (2026) that matter for your app

## 1) Treat the LAN as untrusted

Even on home Wi‑Fi:

* require pairing tokens
* never enable port forwarding
* default to “one device connected”

## 2) Keep Codex security defaults intact

Codex runs with network access off by default, with an OS sandbox + approval policy controlling what it can do. ([OpenAI Developers][5])
Your app should make “Network: Off” the default and make enabling it feel deliberate.

## 3) Don’t let streaming lag your UI

* keep one normalized state store (threads/turns/items)
* update only the changed item on deltas
* keep transcript virtualization (FlatList)
  React Native’s own guidance: keep list items light. ([reactnative.dev][12])

## 4) Use the right build workflow early

* Use development builds for parity with production behaviors when needed ([Expo Documentation][8])
* Use EAS Build to generate distributable APK/AAB easily ([Expo Documentation][7])

---

# Answering your constraints clearly

### v1: home network only

✅ Works if:

* computer ON
* bridge running
* phone on same Wi‑Fi/LAN

❌ Does not work if:

* computer OFF
* user is away from home (different city) — until you add VPN/relay

### Future: remote access

When you add VPN/relay, the architecture stays the same:

* phone talks to bridge over a secure path
* bridge talks to app-server over stdio
  so you won’t rewrite the product — you’ll just change “how the socket is reached.”

---

[1]: https://docs.expo.dev/debugging/tools/ "Debugging and profiling tools - Expo Documentation"
[2]: https://developers.openai.com/codex/app-server/ "Codex App Server"
[3]: https://developers.openai.com/codex/app-server "Codex App Server"
[4]: https://reactnative.dev/docs/network?utm_source=chatgpt.com "Networking"
[5]: https://developers.openai.com/codex/security/?utm_source=chatgpt.com "Security"
[6]: https://docs.expo.dev/more/expo-cli/?utm_source=chatgpt.com "Expo CLI - Expo Documentation"
[7]: https://docs.expo.dev/build/introduction/ "EAS Build - Expo Documentation"
[8]: https://docs.expo.dev/develop/development-builds/introduction/ "Introduction to development builds - Expo Documentation"
[9]: https://developers.openai.com/codex/quickstart/ "Quickstart"
[10]: https://docs.expo.dev/versions/latest/sdk/camera/?utm_source=chatgpt.com "Camera"
[11]: https://docs.expo.dev/versions/latest/sdk/securestore/?utm_source=chatgpt.com "SecureStore"
[12]: https://reactnative.dev/docs/optimizing-flatlist-configuration?utm_source=chatgpt.com "Optimizing FlatList Configuration"
[13]: https://docs.expo.dev/guides/using-hermes/?utm_source=chatgpt.com "Using Hermes Engine"
[14]: https://developers.openai.com/codex/cli/reference/?utm_source=chatgpt.com "Command line options"
