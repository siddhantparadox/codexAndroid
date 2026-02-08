import { spawn } from "node:child_process";
import { createServer } from "node:http";
import readline from "node:readline";
import { URL } from "node:url";
import {
  type BridgeControlMessage,
  type PairingPayload,
  isBridgeControlMessage
} from "@codex-mobile/protocol";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { parseBridgeArgs } from "./args.js";
import { extractChatgptAuthUrl, openExternalUrl } from "./auth-url.js";
import { writeClientLog } from "./client-log.js";
import { resolveBridgeEndpoints } from "./network.js";
import { pairingPayloadToQrText, printPairingQr } from "./pairing-qr.js";

const cwd = process.cwd();
const args = parseBridgeArgs(process.argv.slice(2), cwd);
const endpoints = resolveBridgeEndpoints(args.port);

const appServer = spawn(args.codexBin, ["app-server"], {
  cwd: args.cwd,
  stdio: ["pipe", "pipe", "pipe"]
});

appServer.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

appServer.on("spawn", () => {
  updateAppServerState(
    "running",
    "codex app-server started",
    appServer.exitCode ?? null
  );
});

appServer.on("error", (error) => {
  console.error(`[bridge] failed to start codex app-server: ${error.message}`);
  updateAppServerState("error", `Failed to start app-server: ${error.message}`);
  if (activeClient && activeClient.readyState === activeClient.OPEN) {
    sendBridgeError(
      activeClient,
      "app_server_start_failed",
      "Failed to start codex app-server. Check codex CLI installation."
    );
  }
});

appServer.on("exit", (code) => {
  console.error(`[bridge] codex app-server exited with code ${String(code)}`);
  updateAppServerState("stopped", `codex app-server exited (${String(code)})`, code);
  if (activeClient && activeClient.readyState === activeClient.OPEN) {
    sendBridgeError(
      activeClient,
      "app_server_exited",
      `codex app-server exited with code ${String(code)}`
    );
  }
});

const appServerLines = readline.createInterface({
  input: appServer.stdout
});

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

let activeClient: WebSocket | null = null;
let appServerState: "starting" | "running" | "stopped" | "error" = "starting";
let appServerMessage: string | undefined = "Starting codex app-server";
let appServerExitCode: number | null | undefined;

const sendBridge = (ws: WebSocket, message: BridgeControlMessage): void => {
  ws.send(JSON.stringify(message));
};

const broadcastBridge = (message: BridgeControlMessage): void => {
  if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
    return;
  }
  sendBridge(activeClient, message);
};

const sendAppServerStatus = (): void => {
  broadcastBridge({
    __bridge: {
      type: "appServerStatus",
      state: appServerState,
      timestamp: Date.now(),
      message: appServerMessage,
      pid: appServer.pid ?? undefined,
      exitCode:
        typeof appServerExitCode === "number" || appServerExitCode === null
          ? appServerExitCode
          : undefined
    }
  });
};

const updateAppServerState = (
  state: "starting" | "running" | "stopped" | "error",
  message?: string,
  exitCode?: number | null
): void => {
  appServerState = state;
  appServerMessage = message;
  appServerExitCode = exitCode;
  sendAppServerStatus();
};

const sendBridgeError = (ws: WebSocket, code: string, message: string): void => {
  sendBridge(ws, {
    __bridge: {
      type: "error",
      code,
      message
    }
  });
};

const sendAuthBrowserLaunchStatus = (
  success: boolean,
  url: string,
  message?: string
): void => {
  if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
    return;
  }

  sendBridge(activeClient, {
    __bridge: {
      type: "authBrowserLaunch",
      success,
      url,
      message
    }
  });
};

const pairingPayload: PairingPayload = {
  v: 1,
  name: args.name,
  token: args.token,
  endpoints,
  cwdHint: args.cwd
};

server.on("upgrade", (request, socket, head) => {
  const host = request.headers.host ?? `${args.host}:${args.port}`;
  const url = new URL(request.url ?? "", `http://${host}`);

  if (url.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  if (token !== args.token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  if (activeClient && activeClient.readyState === activeClient.OPEN) {
    socket.write("HTTP/1.1 409 Conflict\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  activeClient = ws;

  sendBridge(ws, {
    __bridge: {
      type: "hello",
      v: 1,
      name: args.name,
      cwd: args.cwd,
      endpoints,
      timestamp: Date.now()
    }
  });
  sendBridge(ws, {
    __bridge: {
      type: "appServerStatus",
      state: appServerState,
      timestamp: Date.now(),
      message: appServerMessage,
      pid: appServer.pid ?? undefined,
      exitCode:
        typeof appServerExitCode === "number" || appServerExitCode === null
          ? appServerExitCode
          : undefined
    }
  });

  ws.on("message", (raw) => {
    const text = raw.toString();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      sendBridgeError(ws, "invalid_json", "Message must be valid JSON");
      return;
    }

    if (isBridgeControlMessage(parsed)) {
      if (parsed.__bridge.type === "ping") {
        sendBridge(ws, {
          __bridge: {
            type: "pong",
            t: parsed.__bridge.t
          }
        });
      } else if (parsed.__bridge.type === "clientLog") {
        writeClientLog(parsed.__bridge);
      }
      return;
    }

    if (
      appServerState === "error" ||
      appServerState === "stopped" ||
      appServer.exitCode !== null ||
      appServer.stdin.destroyed ||
      !appServer.stdin.writable
    ) {
      sendBridgeError(
        ws,
        "app_server_unavailable",
        "codex app-server is unavailable. Restart bridge or check codex installation."
      );
      sendAppServerStatus();
      return;
    }

    appServer.stdin.write(`${JSON.stringify(parsed)}\n`, (error) => {
      if (!error) {
        return;
      }

      updateAppServerState("error", `Failed to write to app-server: ${error.message}`);
      sendBridgeError(
        ws,
        "app_server_write_failed",
        "Failed to send request to codex app-server."
      );
    });
  });

  ws.on("close", () => {
    if (activeClient === ws) {
      activeClient = null;
    }
  });
});

appServerLines.on("line", (line) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    parsed = null;
  }

  const authUrl = extractChatgptAuthUrl(parsed);
  if (authUrl && args.autoOpenAuthUrl) {
    const opened = openExternalUrl(authUrl);
    if (opened) {
      console.log("[bridge] opened ChatGPT login URL in local browser");
      sendAuthBrowserLaunchStatus(
        true,
        authUrl,
        "Opened login URL in local browser"
      );
    } else {
      console.warn("[bridge] unable to open ChatGPT login URL automatically");
      sendAuthBrowserLaunchStatus(
        false,
        authUrl,
        "Unable to open login URL automatically"
      );
    }
  }

  if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
    return;
  }

  activeClient.send(line);
});

server.listen(args.port, args.host, () => {
  console.log(`[bridge] listening on ws://${args.host}:${args.port}/ws`);
  console.log(`[bridge] name: ${args.name}`);
  console.log(`[bridge] lan endpoint: ${endpoints.lan ?? "unavailable"}`);
  console.log(
    `[bridge] tailscale endpoint: ${endpoints.tailscale ?? "unavailable"}`
  );
  console.log("[bridge] pairing payload:");
  console.log(pairingPayloadToQrText(pairingPayload));
  console.log("[bridge] scan this QR from Codex Mobile:");
  printPairingQr(pairingPayload);
});

const shutdown = (): void => {
  server.close();
  appServer.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
