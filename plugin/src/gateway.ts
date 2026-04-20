import { WebSocketServer, type WebSocket } from "ws";
import { handleEduStoryInbound } from "./inbound.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import type { ClientFrame, CoreConfig, ResolvedEduStoryAccount, ServerFrame } from "./types.js";

type ConnectedClient = {
  ws: WebSocket;
  sessionId: string;
};

const activeClients = new Map<string, ConnectedClient>();

export function getActiveClient(sessionId: string): ConnectedClient | undefined {
  return activeClients.get(sessionId);
}

export function sendToClient(sessionId: string, frame: ServerFrame): boolean {
  const client = activeClients.get(sessionId);
  if (!client || client.ws.readyState !== client.ws.OPEN) {
    return false;
  }
  client.ws.send(JSON.stringify(frame));
  return true;
}

export async function startEduStoryGatewayAccount(
  channelId: string,
  channelLabel: string,
  ctx: ChannelGatewayContext<ResolvedEduStoryAccount>,
) {
  const account = ctx.account;
  const { port, host } = account;

  const wss = new WebSocketServer({ port, host });

  ctx.setStatus({
    accountId: account.accountId,
    running: true,
    configured: true,
    enabled: account.enabled,
    port,
  });

  wss.on("connection", (ws) => {
    let clientSessionId: string | null = null;

    ws.on("message", async (raw) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(raw.toString()) as ClientFrame;
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" } satisfies ServerFrame));
        return;
      }

      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" } satisfies ServerFrame));
        return;
      }

      if (frame.type === "bootstrap") {
        clientSessionId = frame.sessionId ?? crypto.randomUUID();
        activeClients.set(clientSessionId, { ws, sessionId: clientSessionId });
        ws.send(
          JSON.stringify({ type: "connected", sessionId: clientSessionId } satisfies ServerFrame),
        );
        return;
      }

      if (!clientSessionId) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Send a bootstrap frame first",
          } satisfies ServerFrame),
        );
        return;
      }

      if (frame.type === "message") {
        await handleEduStoryInbound({
          channelId,
          channelLabel,
          account,
          config: ctx.cfg as CoreConfig,
          sessionId: clientSessionId,
          text: frame.text,
          meta: frame.meta,
        });
      }

      if (frame.type === "review-word") {
        await handleEduStoryInbound({
          channelId,
          channelLabel,
          account,
          config: ctx.cfg as CoreConfig,
          sessionId: clientSessionId,
          text: `[word-review] cardId=${frame.cardId} rating=${frame.rating}`,
        });
      }
    });

    ws.on("close", () => {
      if (clientSessionId) {
        activeClients.delete(clientSessionId);
      }
    });
  });

  ctx.abortSignal.addEventListener("abort", () => {
    wss.close();
    activeClients.clear();
  });

  await new Promise<void>((resolve) => {
    ctx.abortSignal.addEventListener("abort", () => resolve());
  });

  ctx.setStatus({
    accountId: account.accountId,
    running: false,
  });
}
