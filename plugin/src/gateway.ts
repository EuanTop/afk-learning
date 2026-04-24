import { WebSocketServer, type WebSocket } from "ws";
import { handleCapybaraLetterInbound } from "./inbound.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import { parseAgeYears } from "./shared/types.js";
import { CapybaraLetterSessionStore } from "./tools/session-store.js";
import type { ClientFrame, CoreConfig, ResolvedCapybaraLetterAccount, ServerFrame } from "./types.js";
import { buildBootstrapWelcomeStory } from "./welcome-story.js";

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

function resolveBootstrapAge(age: string | number): number {
  if (typeof age === "number") {
    return age;
  }
  return parseAgeYears(age);
}

function isBootstrapOnlySnapshot(snapshot: Awaited<ReturnType<CapybaraLetterSessionStore["read"]>>) {
  if (!snapshot) {
    return false;
  }
  return (
    snapshot.currentStory?.kind === "welcome" &&
    snapshot.history.length <= 2 &&
    snapshot.wordBank.length <= 3
  );
}

function bootstrapSnapshotScore(snapshot: NonNullable<Awaited<ReturnType<CapybaraLetterSessionStore["read"]>>>) {
  let score = 0;
  if (snapshot.history.length > 0) {
    score += 1;
  }
  if (snapshot.history.length > 2) {
    score += 2;
  }
  if (snapshot.currentStory?.kind === "lesson") {
    score += 2;
  }
  if (snapshot.wordBank.length > 3) {
    score += 1;
  }
  return score;
}

async function resolveBootstrapSnapshot(params: {
  requestedSessionId?: string;
  store: CapybaraLetterSessionStore;
}) {
  const requestedSessionId = params.requestedSessionId?.trim();
  if (requestedSessionId) {
    const requestedSnapshot = await params.store.read(requestedSessionId);
    if (requestedSnapshot) {
      if (isBootstrapOnlySnapshot(requestedSnapshot)) {
        const latestSnapshot = await params.store.findLatestSnapshot();
        if (
          latestSnapshot &&
          latestSnapshot.sessionId !== requestedSnapshot.sessionId &&
          bootstrapSnapshotScore(latestSnapshot) > bootstrapSnapshotScore(requestedSnapshot)
        ) {
          return latestSnapshot;
        }
      }
      return requestedSnapshot;
    }
  }

  const latestSnapshot = await params.store.findLatestSnapshot();
  if (latestSnapshot) {
    return latestSnapshot;
  }

  if (!requestedSessionId) {
    return null;
  }

  return await params.store.ensure(requestedSessionId);
}

export async function startCapybaraLetterGatewayAccount(
  channelId: string,
  channelLabel: string,
  ctx: ChannelGatewayContext<ResolvedCapybaraLetterAccount>,
) {
  const account = ctx.account;
  const { port, host } = account;

  const sessionsRoot = `${process.env.HOME ?? process.env.USERPROFILE ?? "/tmp"}/.openclaw/capybara-letter/sessions`;
  const store = new CapybaraLetterSessionStore(sessionsRoot);

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
        const bootstrapSnapshot = await resolveBootstrapSnapshot({
          requestedSessionId: frame.sessionId,
          store,
        });
        clientSessionId = bootstrapSnapshot?.sessionId ?? frame.sessionId?.trim() ?? crypto.randomUUID();
        activeClients.set(clientSessionId, { ws, sessionId: clientSessionId });
        const existingSnapshot = bootstrapSnapshot ?? (await store.ensure(clientSessionId));
        const learnerProfile = {
          name: existingSnapshot.learnerProfile?.name ?? "孩子",
          age: resolveBootstrapAge(frame.age),
          englishLevel: frame.englishLevel,
          interests: existingSnapshot.learnerProfile?.interests ?? [],
        };
        let snapshot = await store.updateLearnerProfile({
          sessionId: clientSessionId,
          profile: learnerProfile,
        });
        if (!snapshot.currentStory && snapshot.history.length === 0) {
          snapshot = await store.saveDeliveredStory({
            sessionId: clientSessionId,
            story: buildBootstrapWelcomeStory({
              sessionId: clientSessionId,
              profile: learnerProfile,
            }),
          });
        }
        ws.send(
          JSON.stringify({ type: "connected", sessionId: clientSessionId } satisfies ServerFrame),
        );
        ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
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

      try {
        if (frame.type === "message") {
          await handleCapybaraLetterInbound({
            channelId,
            channelLabel,
            account,
            config: ctx.cfg as CoreConfig,
            sessionId: clientSessionId,
            store,
            text: frame.text,
            meta: frame.meta,
          });
        }

        if (frame.type === "review-word") {
          const snapshot = await store.applyWordReview({
            sessionId: clientSessionId,
            cardId: frame.cardId,
            rating: frame.rating,
          });
          ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
          ws.send(JSON.stringify({ type: "status", state: "idle" } satisfies ServerFrame));
        }

        if (frame.type === "update-profile") {
          const snapshot = await store.updateLearnerProfile({
            sessionId: clientSessionId,
            profile: frame.profile,
          });
          ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
          ws.send(JSON.stringify({ type: "status", state: "idle" } satisfies ServerFrame));
        }

        if (frame.type === "update-environment") {
          const snapshot = await store.updateEnvironment({
            sessionId: clientSessionId,
            environment: frame.environment as import("./shared/types.js").Environment,
          });
          ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
          ws.send(JSON.stringify({ type: "status", state: "idle" } satisfies ServerFrame));
        }

        if (frame.type === "update-preferences") {
          const snapshot = await store.updatePreferences({
            sessionId: clientSessionId,
            preferences: frame.preferences,
          });
          ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
          ws.send(JSON.stringify({ type: "status", state: "idle" } satisfies ServerFrame));
        }

        if (frame.type === "update-runtime") {
          const snapshot = await store.updateRuntime({
            sessionId: clientSessionId,
            runtime: frame.runtime,
          });
          ws.send(JSON.stringify({ type: "snapshot", payload: snapshot } satisfies ServerFrame));
          ws.send(JSON.stringify({ type: "status", state: "idle" } satisfies ServerFrame));
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Channel request failed",
          } satisfies ServerFrame),
        );
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
