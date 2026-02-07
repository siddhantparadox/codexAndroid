## Do you need Android Studio, or will VS Code work?

**You can write the Expo app entirely in VS Code**, but **you should still install Android Studio** in v1 because it provides the Android SDK + emulator + device tooling that makes “I’m new to Android” dramatically easier.

* **VS Code** = where you’ll spend most of your time writing TypeScript/React Native code.
* **Android Studio** = the easiest way to get:

  * an Android emulator,
  * the Android SDK & build tools,
  * native debugging/profiling when you eventually need it.

Even React Native’s own docs recommend using Android Studio/Xcode tools when you need to inspect underlying platform layers. ([React Native][1])

---

# V1 “no-stones-unturned” specification

You said: **Home network only** in v1; no VPN/relay/cloud runner yet; **basic companion**.

This spec is designed so you can:

* ship a clean v1,
* keep the codebase structured for v2 (VPN/relay, multi-workspace, cloud runner) without rewriting everything.

---

## 1) Product definition

### V1 promise

“Use Codex from your phone” **while you’re at home**, by connecting the phone to your computer on the same Wi‑Fi and controlling Codex **running on that computer’s repo**.

### V1 hard constraints

* **Computer must be ON** while using it.
* **Phone and computer must be on the same LAN** (same home Wi‑Fi).
* Only **one paired phone** per computer in v1 (keeps everything simple).
* The companion is **a basic local bridge** (CLI process) — no fancy tray app yet.

### Why the computer must be on

Codex is a local coding agent that reads/writes your workspace and runs commands in a sandbox. If the machine is off, there is no filesystem, no terminal, no sandbox, and no Codex runtime to stream events. Codex’s security model also assumes local sandboxing + approvals. ([OpenAI Developers][2])

---

## 2) Architecture overview

### Core design choice

Use **Codex App Server** (not SSH, not scraping the TUI, not `codex exec`) because App Server is the protocol meant for “rich clients” like the VS Code extension: streamed events, approvals, thread history, etc. ([OpenAI][3])

### Components (v1)

#### A) Mobile app (Expo / React Native)

Responsibilities:

* Pair to a computer (scan QR)
* Maintain a WebSocket connection
* Render: threads, turns, items, diffs, logs, approvals
* Provide “easy toggles” (mode, network, model, effort, show reasoning/tool calls)

Technical notes:

* React Native supports **WebSockets** directly (`new WebSocket(...)`). ([React Native][4])
* Use **FlatList** for transcript virtualization (performance). ([React Native][5])
* Store pairing tokens in **SecureStore** (encrypted storage). ([Expo Documentation][6])
* Scan QR codes with **expo-camera** (barcode detection). ([Expo Documentation][7])

#### B) Companion bridge (basic CLI service on the computer)

Responsibilities:

* Spawn `codex app-server`
* Forward messages:

  * phone WebSocket ⇄ app-server stdin/stdout JSONL
* Enforce pairing token access control
* Provide minimal “bridge metadata” (workspace path, codex version, etc.)

#### C) Codex App Server

Facts you must build around:

* It waits for **JSONL over stdin** and prints protocol messages on stdout. ([OpenAI Developers][8])
* Client must send `initialize` then `initialized` before any other requests. ([OpenAI Developers][8])
* It’s “JSON‑RPC lite”: request/response/notification shape, framed as JSONL, omits `"jsonrpc": "2.0"`. ([OpenAI][3])
* Approvals are **server-initiated requests** the client must respond to. ([OpenAI Developers][9])

> Important: `codex app-server` is marked “primarily for development and debugging and may change without notice.” That means you must plan version pinning. ([OpenAI Developers][10])

---

## 3) V1 system diagram (home LAN)

```
[Expo App on Phone]
  - WebSocket client
  - UI/UX, settings, rendering
        |
        |  ws://<LAN-IP>:<PORT>  (pairing token required)
        v
[Bridge on Computer]
  - WebSocket server
  - Spawns "codex app-server"
  - JSON message forwarder
        |
        |  stdin/stdout (JSONL)
        v
[codex app-server]
  - threads / turns / items
  - approvals
  - auth
  - config read/write
  - runs tools/commands via Codex core & sandbox
```

OpenAI explicitly describes that “stdio” protocols are often tunneled over a persistent connection (WebSocket-like) in hosted setups; your bridge is doing the same idea locally. ([OpenAI][3])

---

## 4) V1 user flow (what the user actually does)

### 4.1 First-time setup

**On the computer**

1. Install Codex CLI (or your bridge checks for it).

   * Codex CLI supports macOS/Linux; Windows support is experimental; WSL recommended for best Windows experience. ([OpenAI Developers][11])
2. In the repo folder, run your bridge:

   * Example: `npx codex-remote-bridge start`
3. Bridge prints:

   * Local URL (LAN IP + port)
   * A **QR code** containing the pairing info
   * “Waiting for phone…”

**On the phone**

1. Install your app.
2. Tap **Add Computer** → scan QR.
3. App connects, shows “Connected”.

### 4.2 Authentication (v1)

Codex supports:

* ChatGPT subscription login
* API key login
* device code login (beta) ([OpenAI Developers][12])

In v1 (home network), you should implement:

#### A) “Sign in with ChatGPT” (recommended default)

* Phone sends `account/login/start` with `{ type: "chatgpt" }`
* App server returns `{ authUrl, loginId }`
* The **computer** must open this `authUrl` in a browser because the app-server hosts a localhost callback. ([OpenAI Developers][8])

**Best v1 UX**: The bridge auto-opens the browser on the computer when it sees `authUrl`, while the phone shows “Waiting for sign-in to finish…”.

#### B) “Sign in with API key”

* Phone enters key (or user pastes it)
* Send `account/login/start` with `{ type: "apiKey", apiKey: "sk-..." }` ([OpenAI Developers][8])

#### C) Device code (beta) (optional in v1, but nice)

Codex supports `codex login --device-auth` and also mentions device code authentication steps. ([OpenAI Developers][12])
In v1 you can implement this as a bridge-only helper (bridge runs that command and shows code on phone). It’s optional for home network.

### 4.3 Daily usage

1. User opens the phone app → sees **thread list**
2. Tap a thread to resume, or **New thread**
3. Choose quick toggles (mode/model/effort/network)
4. Type prompt → Run
5. Watch live streaming:

   * plan updates
   * tool calls
   * command output
   * diffs
6. Approve/decline actions when prompted (commands/file changes)
7. Review final diff and outputs

Thread and turn APIs exist specifically for rendering a history UI and streaming events. ([OpenAI Developers][8])

---

## 5) V1 “Basic Bridge” specification

### 5.1 Bridge UX requirements (v1)

* User can run one command in the repo folder and be done:

  * “start bridge”
  * “scan QR”
* It should not require cloud accounts, port forwarding, or router settings.

### 5.2 Bridge CLI interface

**Command**:

* `codex-remote-bridge start`

**Flags** (v1):

* `--port <port>` default 8787
* `--host <host>` default `0.0.0.0` (LAN)
* `--cwd <path>` default current directory
* `--token <token>` optional; default random generated token
* `--kill-on-disconnect` default true (keep simple)
* `--verbose` for debug logs

**Output**:

* “Workspace: …”
* “Listening on ws://192.168.1.23:8787”
* QR code with pairing payload

### 5.3 Bridge pairing payload (QR content)

Use a simple JSON payload encoded as text (QR).
Example:

```json
{
  "v": 1,
  "name": "Home MacBook",
  "ws": "ws://192.168.1.23:8787/ws",
  "token": "random-32-byte-base64",
  "cwdHint": "/Users/alex/projects/myrepo"
}
```

* `token` is the *only* secret in v1. Treat it like a password.
* Store this token in Expo SecureStore on device. ([Expo Documentation][6])

### 5.4 Bridge network rules (v1)

* **LAN only**: do not support public internet
* Do not implement relay in v1
* The bridge should refuse non-LAN addresses if you want to be strict (optional)

### 5.5 Bridge transport protocol (WebSocket)

WebSocket endpoint:

* `GET /ws?token=...`

Connection rules:

* If token mismatch → close connection (code 4401)
* Allow only one connection at a time in v1:

  * if a second client connects → reject or disconnect old client (choose one)

Heartbeats (recommended):

* Phone sends `{ "__bridge": { "type": "ping", "t": 123 } }` every 15s
* Bridge replies `{ "__bridge": { "type": "pong", "t": 123 } }`

This makes “Disconnected” detection instantaneous.

### 5.6 App Server process lifecycle (v1 simple choice)

**Recommended v1 simplicity**:

* Start `codex app-server` when the phone connects.
* Kill it when the phone disconnects (or after 60s grace).

Pros:

* No complex “re-initialize” problems.
* Easy mental model.

You still keep thread history because App Server stores threads as JSONL on disk and `thread/list` reads stored logs. ([OpenAI Developers][8])

### 5.7 App Server initialization handling

App Server requires:

* `initialize` request
* then `initialized` notification ([OpenAI Developers][8])

In v1:

* Let the **phone app** send these two messages on connect.
* The bridge just forwards.

### 5.8 Bridge pass-through rules

**Phone → App Server**:

* Any message that does *not* start with `__bridge` is considered an App Server message.
* Bridge writes: `JSON.stringify(msg) + "\n"` to app-server stdin.

**App Server → Phone**:

* Bridge reads stdout line by line
* Parses JSON
* Sends JSON object to phone

App Server “prints only protocol messages” on stdout, so line-by-line JSON parsing is the intended integration method. ([OpenAI Developers][8])

### 5.9 Bridge “hello” metadata message (recommended)

On successful auth and app-server start, bridge sends:

```json
{
  "__bridge": {
    "type": "hello",
    "v": 1,
    "cwd": "/Users/me/project",
    "platform": "darwin",
    "codex": { "binary": "codex", "mode": "app-server" }
  }
}
```

This lets the phone show “Connected to Home MacBook • Workspace: myrepo”.

---

## 6) V1 Mobile App specification (Expo)

### 6.1 Expo project setup (best practice)

Start with Expo + TypeScript.

**Important best practice (2026): use development builds once you get past toy testing.** Expo documents that Expo Go is a learning playground with a fixed set of native libraries; a “development build” is the fully featured environment for production-grade apps. ([Expo Documentation][13])

Build/distribution:

* Use **EAS Build** to create installable Android builds and (later) handle signing. ([Expo Documentation][14])

Performance:

* Enable **Hermes** (Expo docs explain Hermes compiles JS to bytecode ahead of time and can improve startup time and memory). ([Expo Documentation][15])

Debugging:

* Use **React Native DevTools** (supported in Expo dev clients/Expo Go). ([Expo Documentation][16])

### 6.2 Mobile screens (exact v1 UI structure)

#### Screen 1: “Computers”

* List of paired computers (cards):

  * Name (editable)
  * Connection status (Connected / Disconnected)
  * Last seen time
* CTA: “Add Computer” → QR scan
* Optional: “Remove” (forget pairing)

#### Screen 2: “Scan QR”

* Uses `expo-camera` barcode detection in CameraView. ([Expo Documentation][7])
* After scan:

  * validate payload `v=1`
  * store `ws` + `token` in SecureStore
  * navigate to “Connect”

#### Screen 3: “Connect / Login”

* Attempt WebSocket connect
* Show:

  * connection spinner
  * errors (“Wrong token”, “Computer unreachable”, “Different Wi‑Fi”)
* When connected:

  * call `account/read`
  * if not authenticated → show login options:

    * “Sign in with ChatGPT”
    * “Sign in with API key”
* For ChatGPT login:

  * show “Open the browser on your computer to finish”
  * show progress until `account/updated` arrives ([OpenAI Developers][8])

#### Screen 4: “Threads”

* Implements history UI via `thread/list` with pagination. ([OpenAI Developers][8])
* Each thread row shows:

  * preview
  * updatedAt
  * modelProvider
* Actions:

  * New thread
  * Open thread
  * Archive thread (optional in v1)
* “Archived” filter (optional)

Thread archiving moves a thread’s persisted JSONL log file into an archived directory; unarchive restores it. ([OpenAI Developers][8])

#### Screen 5: “Thread Detail”

Layout:

* Top bar:

  * thread title/preview
  * “Stop” (interrupt)
  * “Settings” (turn defaults)
* Main: Transcript timeline (FlatList)
* Bottom: Composer + **Quick Toggles Row**
* Secondary: Tabs/panels:

  * Plan
  * Diff
  * Logs
  * Tools

Streaming rules:

* After you call `turn/start`, keep reading notifications: item started/completed, agent deltas, tool progress, etc. ([OpenAI Developers][8])

#### Screen 6: “Approvals”

Two ways:

* Either a dedicated “Approvals inbox” screen
* Or (recommended) approval bottom sheets on top of Thread Detail

App Server approval protocol is explicit:

* `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`
* client must respond `{ decision: "accept" | "decline" }` (plus optional `acceptSettings` for command approvals). ([OpenAI Developers][9])

---

## 7) Mobile “Quick Toggles” spec (the key UX you requested)

These are toggles visible *right above the text composer* (so users don’t dig in settings):

### Toggle group A: Mode

You present 3 modes as a UX abstraction (your app’s labels), mapping to App Server fields:

1. **Chat (Safe)**

* `approvalPolicy`: strict (ask more)
* `sandboxPolicy`: readOnly or workspaceWrite with network off
* Goal: discuss + inspect, minimal actions

2. **Agent (Default)**

* `approvalPolicy`: “unlessTrusted” (or “on-request” equivalent)
* `sandboxPolicy`: workspaceWrite, network off by default
* Matches Codex default “Agent mode lets it read files, run commands, and write changes.” ([OpenAI Developers][17])

3. **Full Access (Danger)**

* `approvalPolicy`: never (or minimal prompts)
* `sandboxPolicy`: dangerFullAccess (or external sandbox)
* Show warning UI (red chip)

App Server allows per-turn overrides (approvalPolicy, sandboxPolicy, etc.) and notes these can become defaults for later turns on the same thread. ([OpenAI Developers][8])

### Toggle group B: Network

A simple switch:

* Off → `sandboxPolicy.networkAccess: false`
* On → `sandboxPolicy.networkAccess: true`

Codex security docs emphasize network access is off by default. ([OpenAI Developers][2])
Config advanced docs also show `network_access = false` in workspace-write sandbox mode. ([OpenAI Developers][18])

### Toggle group C: Model + effort

* Populate from `model/list`:

  * `displayName`
  * `reasoningEffort[]`
  * `defaultReasoningEffort`
  * `supportsPersonality` ([OpenAI Developers][8])

Then map:

* `turn/start.params.model`
* `turn/start.params.effort`

### Toggle group D: Reasoning visibility

Your UI can provide:

* Show reasoning summaries (default on)
* Show raw reasoning (default off)

App Server describes `reasoning` items with `summary` and `content` (raw blocks). ([OpenAI Developers][8])
Codex config supports things like `model_reasoning_summary` and verbosity controls. ([OpenAI Developers][18])

> Important: raw reasoning availability can be model/provider dependent; your UI should gracefully show “not available” when no raw blocks arrive.

### Toggle group E: Tool calls visibility

Switch:

* “Show tool calls”
  If off, hide MCP/webSearch/tool items by default, but keep them accessible via a “Tools” tab.

App Server includes item types like `mcpToolCall` and `webSearch`. ([OpenAI Developers][8])

---

## 8) Data model & state management (so it never feels laggy)

### 8.1 Why you need a normalized store

Streaming means you can receive many tiny deltas (`item/agentMessage/delta`, command output deltas, etc.). If you append to a giant array and re-render everything every time, it will lag.

### 8.2 Required local data structures

Use a normalized store keyed by IDs:

* `Computer`:

  * id, name, wsUrl, token, lastSeen, cwdHint
* `ConnectionState`:

  * status: connecting/connected/disconnected
  * latency estimate
* `Threads`:

  * `threadById`
  * `threadListOrder` (pagination)
* `Turns`:

  * `turnById`, keyed by `turnId`
  * `turnsByThreadId`: list of turnIds
* `Items`:

  * `itemById`
  * `itemsByTurnId`: list of itemIds
* `StreamingBuffers`:

  * agent message partial text
  * command output rolling buffer (tail)
  * diff preview caches

### 8.3 Rendering strategy

* Transcript is a `FlatList` of “renderable blocks”
* Each block has a stable key: `${turnId}:${itemId}`
* For huge logs: render only last N lines, with “Show full output” expanding into a separate screen

React Native provides guidance and props to optimize FlatList rendering. ([React Native][19])

---

## 9) V1 Protocol spec (phone ⇄ app-server via bridge)

### 9.1 App Server message shapes

App Server uses:

* Requests: `{ method, id, params }`
* Responses: `{ id, result }` or `{ id, error }`
* Notifications: `{ method, params }` (no id)

And it’s JSONL over stdio. ([OpenAI][3])

### 9.2 Required connect sequence (v1)

When the WebSocket opens:

1. Phone waits for bridge `__bridge.hello` (optional)
2. Phone sends App Server init:

```json
{ "method": "initialize", "id": 1, "params": {
  "clientInfo": { "name": "codex_remote_mobile", "title": "Codex Remote", "version": "1.0.0" }
}}
{ "method": "initialized", "params": {} }
```

Initialize requirement is explicit. ([OpenAI Developers][8])

3. Phone calls `account/read` to decide whether to show login.
4. Phone calls `model/list` to populate model/effort UI. ([OpenAI Developers][8])
5. Phone calls `thread/list` to populate thread history. ([OpenAI Developers][8])

### 9.3 Starting a thread

Example:

```json
{ "method": "thread/start", "id": 10, "params": {
  "model": "gpt-5.2-codex",
  "cwd": "/Users/me/project",
  "approvalPolicy": "unlessTrusted",
  "sandbox": "workspaceWrite",
  "personality": "friendly"
}}
```

Thread start/resume/fork are explicitly part of the protocol. ([OpenAI Developers][8])

### 9.4 Starting a turn

Example (core v1):

```json
{ "method": "turn/start", "id": 30, "params": {
  "threadId": "thr_123",
  "input": [{ "type": "text", "text": "Add a /health endpoint and write tests." }],
  "cwd": "/Users/me/project",
  "approvalPolicy": "unlessTrusted",
  "sandboxPolicy": { "type": "workspaceWrite", "writableRoots": ["/Users/me/project"], "networkAccess": false },
  "model": "gpt-5.2-codex",
  "effort": "medium",
  "summary": "concise",
  "personality": "friendly"
}}
```

App Server docs show these fields, and note per-turn overrides can become defaults for later turns on the same thread. ([OpenAI Developers][8])

### 9.5 Streaming events you MUST support in v1

You will receive notifications such as:

* `turn/started`
* `turn/completed`
* `item/started`
* `item/completed`
* `item/agentMessage/delta`
* `item/commandExecution/outputDelta`
* `turn/diff/updated`
* `turn/plan/updated`
  …and other item types. ([OpenAI Developers][8])

Important nuance:

* `turn/diff/updated` and `turn/plan/updated` can include empty `items` arrays; App Server tells you to treat `item/*` notifications as the source of truth for items. ([OpenAI Developers][8])

### 9.6 Interrupting a turn

* Button in UI: “Stop”
* Send:

```json
{ "method": "turn/interrupt", "id": 31, "params": { "threadId": "thr_123", "turnId": "turn_456" } }
```

On success the turn ends with status “interrupted”. ([OpenAI Developers][8])

### 9.7 Approvals (must feel excellent)

App Server describes the exact sequence for command/file approvals. ([OpenAI Developers][9])

#### Command approval sequence

1. `item/started` includes a pending `commandExecution` item
2. `item/commandExecution/requestApproval` arrives with:

   * itemId, threadId, turnId
   * optional reason/risk
   * parsedCmd for display
3. You respond with:

```json
{
  "id": <sameRequestId>,
  "result": { "decision": "accept" }
}
```

4. You later get `item/completed` with status completed/failed/declined. ([OpenAI Developers][9])

#### File change approval sequence

Similar, via `item/fileChange/requestApproval`. ([OpenAI Developers][9])

**UX requirement (v1):**

* approvals must show:

  * full command (not truncated)
  * cwd
  * reason/risk when present
  * for file changes: diff preview

---

## 10) V1 Settings & config strategy

You need two kinds of settings:

### 10.1 “Instant toggles” (phone-only defaults)

These are quick toggles described earlier (mode, network, effort, etc.). They live in mobile state and get applied to `turn/start` calls.

### 10.2 “Real Codex settings” (persist on the computer)

Codex config lives in layered TOML files:

* user config at `~/.codex/config.toml`
* project overrides in `.codex/config.toml` (trusted projects only)
* precedence order is documented ([OpenAI Developers][20])

App Server exposes config APIs:

* `config/read`
* `config/value/write`
* `config/batchWrite` ([OpenAI Developers][8])

So v1 Settings screen can:

* read effective config
* change a small safe subset (approval policy, sandbox mode, reasoning summaries, etc.)

Codex advanced config docs show examples for approval_policy, sandbox_mode, and network_access. ([OpenAI Developers][18])

**V1 safety rule:** do not expose “danger-full-access” without heavy warnings. Codex security docs explain why sandbox and approvals matter. ([OpenAI Developers][2])

---

## 11) Security model (v1 home LAN)

### 11.1 Threat model (v1)

Assume:

* home Wi‑Fi could have guests or IoT devices
* LAN traffic might be sniffable on compromised networks
* anyone on LAN might try to connect to your bridge port

### 11.2 V1 security requirements (minimum acceptable)

1. **Strong pairing token**
2. **No public internet exposure**
3. **One device connection**
4. **Safe defaults**:

   * network off by default
   * approvals on by default
     Codex defaults to network off and uses sandbox + approvals to reduce risk. ([OpenAI Developers][2])

### 11.3 Should v1 use TLS (wss://)?

In an ideal world: yes. In a practical Expo v1:

* WSS with self-signed certs can be painful to get right without a custom dev client and certificate pinning work.

**Recommended v1 stance**:

* Use `ws://` + strong pairing token + home LAN only.
* Make WSS a v2 goal (when you add remote access).

---

## 12) Performance + “smooth app feel” requirements

### 12.1 Performance targets (v1)

* Transcript scroll stays smooth even during heavy streaming
* Approvals pop instantly (no multi-second lag)
* Command output updates at least 5–10 times/sec without freezing UI
* Diff view loads quickly:

  * show summary first
  * lazy-load full diff

### 12.2 Concrete implementation practices

* Parse incoming WS messages on a background queue (in JS: keep parsing cheap; avoid heavy diff parsing on every delta)
* Batch UI updates:

  * accumulate deltas for 50–100ms then apply once
* FlatList:

  * stable keys
  * tuned props like `windowSize`, `maxToRenderPerBatch`, etc. (RN docs explicitly call out FlatList optimization props). ([React Native][19])
* Use Hermes for better startup/memory characteristics. ([Expo Documentation][15])

### 12.3 Dev environment best practices (2026)

* Use Expo development builds as soon as you need production-like behavior. ([Expo Documentation][13])
* Use React Native DevTools for debugging. ([Expo Documentation][16])
* Use EAS Build for distributable builds and signing. ([Expo Documentation][14])

---

## 13) V1 feature list & acceptance criteria (what you ship)

### Must-have (v1)

**Connectivity**

* Pair computer by QR scan
* Reliable LAN WebSocket connection with heartbeats
* Show connection status + error states

**Auth**

* ChatGPT login via browser flow
* API key login ([OpenAI Developers][8])

**Core Codex interaction**

* `model/list` and effort selector ([OpenAI Developers][8])
* `thread/list` paginated history ([OpenAI Developers][8])
* create thread (`thread/start`) and resume existing threads (`thread/resume`) ([OpenAI Developers][8])
* start turns (`turn/start`) with streaming updates ([OpenAI Developers][8])
* interrupt turn (`turn/interrupt`) ([OpenAI Developers][8])

**Streaming UI**

* Render items:

  * userMessage
  * agentMessage (delta streaming)
  * commandExecution (output deltas)
  * fileChange
  * plan + plan updates
  * diff updates ([OpenAI Developers][8])

**Approvals**

* Command approvals
* File change approvals
* Elegant bottom sheet UX ([OpenAI Developers][9])

### Nice-to-have (still feasible in v1)

* Archive/unarchive threads
* “Review mode” (`review/start`) button
* Config viewer (`config/read`) and a small set of safe config edits (`config/value/write`) ([OpenAI Developers][8])

### Explicit non-goals (v1)

* Remote access outside home network
* Multi-device concurrency
* Cloud runner mode
* Full workspace/file tree browsing from phone (keep bridge basic)

---

## 14) Build plan from zero (what you implement first)

### Step 1: Build the bridge (you can’t build the phone app without it)

1. Create Node/TS project
2. Spawn `codex app-server`
3. Create WebSocket server (`ws` library)
4. Implement:

   * token checking
   * JSON forwarder (WS → stdin newline JSON; stdout line → WS)
5. Print QR payload

### Step 2: Build the Expo app skeleton

1. Create Expo project + TypeScript
2. Implement navigation (Computers → Scan QR → Threads → Thread Detail)
3. Implement QR scanning with expo-camera ([Expo Documentation][7])
4. Store pairing in SecureStore ([Expo Documentation][6])
5. Implement WebSocket client + reconnection strategy ([React Native][4])

### Step 3: Implement the App Server protocol client

In this order:

1. initialize/initialized ([OpenAI Developers][8])
2. account/read + login flows ([OpenAI Developers][8])
3. model/list ([OpenAI Developers][8])
4. thread/list ([OpenAI Developers][8])
5. thread/start/resume ([OpenAI Developers][8])
6. turn/start + streaming event reducer ([OpenAI Developers][8])
7. approvals request handling ([OpenAI Developers][9])
8. turn/interrupt ([OpenAI Developers][8])

### Step 4: Polish UI performance

* FlatList tuning ([React Native][19])
* batching deltas
* logs tail view
* diff summary-first

---

## 15) Versioning & compatibility (this matters a lot)

Because `codex app-server` is marked as potentially changing, you must plan for compatibility. ([OpenAI Developers][10])

### V1 recommended approach

* **Pin a Codex CLI version** for your bridge installation instructions (and eventually bundle it).
* Generate schema/types matching that Codex version:

  * `codex app-server generate-ts --out ./schemas`
  * `codex app-server generate-json-schema --out ./schemas` ([OpenAI Developers][8])

This is the same style OpenAI describes: local clients bundle/fetch a pinned binary so the client always runs tested bits. ([OpenAI][3])

---

## 16) Clear answers to your key operational questions

### Can the user work if their computer is off?

**No in v1.** The bridge + app-server must be running on the computer. Without that, you can’t read/write the repo or run commands, and there is nothing to stream.

### Will it work if the user is not at home / in another city?

**Not in v1** because you are restricting to home LAN only.
In v2 you can add VPN/relay; the protocol and architecture above are designed so you can replace “how the socket is reached” without changing how Codex is controlled.

---

If you implement exactly what’s above, you’ll have a v1 that:

* feels like a real “Codex client,” not a remote terminal,
* streams everything properly,
* has approvals and safety defaults,
* is structured for v2 (VPN/relay, multi-computer, multi-workspace, cloud runner).

[1]: https://reactnative.dev/docs/react-native-devtools?utm_source=chatgpt.com "React Native DevTools"
[2]: https://developers.openai.com/codex/security/?utm_source=chatgpt.com "Security"
[3]: https://openai.com/index/unlocking-the-codex-harness/?utm_source=chatgpt.com "Unlocking the Codex harness: how we built the App Server"
[4]: https://reactnative.dev/docs/network?utm_source=chatgpt.com "Networking"
[5]: https://reactnative.dev/docs/flatlist?utm_source=chatgpt.com "FlatList"
[6]: https://docs.expo.dev/versions/latest/sdk/securestore/?utm_source=chatgpt.com "SecureStore"
[7]: https://docs.expo.dev/versions/latest/sdk/camera/?utm_source=chatgpt.com "Camera"
[8]: https://developers.openai.com/codex/app-server "Codex App Server"
[9]: https://developers.openai.com/codex/app-server/ "Codex App Server"
[10]: https://developers.openai.com/codex/cli/reference/?utm_source=chatgpt.com "Command line options"
[11]: https://developers.openai.com/codex/cli/?utm_source=chatgpt.com "Codex CLI"
[12]: https://developers.openai.com/codex/auth/ "Authentication"
[13]: https://docs.expo.dev/develop/development-builds/introduction/?utm_source=chatgpt.com "Introduction to development builds"
[14]: https://docs.expo.dev/build/introduction/?utm_source=chatgpt.com "EAS Build"
[15]: https://docs.expo.dev/guides/using-hermes/?utm_source=chatgpt.com "Using Hermes Engine"
[16]: https://docs.expo.dev/debugging/tools/?utm_source=chatgpt.com "Debugging and profiling tools"
[17]: https://developers.openai.com/codex/quickstart/?utm_source=chatgpt.com "Quickstart"
[18]: https://developers.openai.com/codex/config-advanced/ "Advanced Configuration"
[19]: https://reactnative.dev/docs/optimizing-flatlist-configuration?utm_source=chatgpt.com "Optimizing FlatList Configuration"
[20]: https://developers.openai.com/codex/config-basic/ "Config basics"
