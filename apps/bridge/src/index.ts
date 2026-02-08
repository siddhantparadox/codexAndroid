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

appServer.on("error", (error) => {
  console.error(`[bridge] failed to start codex app-server: ${error.message}`);
});

appServer.on("exit", (code) => {
  console.error(`[bridge] codex app-server exited with code ${String(code)}`);
});

const appServerLines = readline.createInterface({
  input: appServer.stdout
});

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

let activeClient: WebSocket | null = null;

const sendBridge = (ws: WebSocket, message: BridgeControlMessage): void => {
  ws.send(JSON.stringify(message));
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
      }
      return;
    }

    appServer.stdin.write(`${JSON.stringify(parsed)}\n`);
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
