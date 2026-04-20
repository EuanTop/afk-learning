import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import { sendToClient } from "./gateway.js";
import { getEduStoryRuntime } from "./runtime.js";
import type { CoreConfig, ResolvedEduStoryAccount, ServerFrame } from "./types.js";

export async function handleEduStoryInbound(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedEduStoryAccount;
  config: CoreConfig;
  sessionId: string;
  text: string;
  meta?: { age?: number; englishLevel?: string };
}) {
  const runtime = getEduStoryRuntime();
  const target = `edu-story:${params.sessionId}`;
  const senderId = `learner:${params.sessionId}`;

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: params.config as OpenClawConfig,
    channel: params.channelId,
    accountId: params.account.accountId,
    peer: { kind: "direct", id: target },
  });

  const storePath = runtime.channel.session.resolveStorePath(params.config.session?.store, {
    agentId: route.agentId,
  });

  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: params.channelLabel,
    from: senderId,
    timestamp: now,
    previousTimestamp,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(params.config as OpenClawConfig),
    body: params.text,
  });

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: params.text,
    RawBody: params.text,
    CommandBody: params.text,
    From: senderId,
    To: target,
    SessionKey: route.sessionKey,
    AccountId: route.accountId ?? params.account.accountId,
    ChatType: "direct",
    ConversationLabel: `Capybara's Letter - ${params.sessionId}`,
    SenderName: "Learner",
    SenderId: senderId,
    Provider: params.channelId,
    Surface: params.channelId,
    MessageSid: crypto.randomUUID(),
    MessageSidFull: crypto.randomUUID(),
    Timestamp: nowIso,
    OriginatingChannel: params.channelId,
    OriginatingTo: target,
    CommandAuthorized: true,
  });

  sendToClient(params.sessionId, { type: "status", state: "thinking" } satisfies ServerFrame);

  await dispatchInboundReplyWithBase({
    cfg: params.config as OpenClawConfig,
    channel: params.channelId,
    accountId: params.account.accountId,
    route,
    storePath,
    ctxPayload,
    core: runtime,
    deliver: async (payload) => {
      const text =
        payload && typeof payload === "object" && "text" in payload
          ? ((payload as { text?: string }).text ?? "")
          : "";
      if (!text.trim()) {
        return;
      }
      sendToClient(params.sessionId, { type: "delta", text } satisfies ServerFrame);
    },
    onRecordError: (error) => {
      sendToClient(params.sessionId, {
        type: "error",
        message: error instanceof Error ? error.message : "Session record failed",
      });
    },
    onDispatchError: (error) => {
      sendToClient(params.sessionId, {
        type: "error",
        message: error instanceof Error ? error.message : "Dispatch failed",
      });
    },
  });

  sendToClient(params.sessionId, { type: "status", state: "idle" } satisfies ServerFrame);
}
