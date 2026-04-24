import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import { sendToClient } from "./gateway.js";
import { getCapybaraLetterRuntime } from "./runtime.js";
import { ageBandFromAge } from "./shared/types.js";
import type { CapybaraLetterSessionStore } from "./tools/session-store.js";
import type { CoreConfig, ResolvedCapybaraLetterAccount, ServerFrame } from "./types.js";

export async function handleCapybaraLetterInbound(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedCapybaraLetterAccount;
  config: CoreConfig;
  sessionId: string;
  store: CapybaraLetterSessionStore;
  text: string;
  meta?: { age?: number; englishLevel?: string };
}) {
  const runtime = getCapybaraLetterRuntime();
  const target = `capybara-letter:${params.sessionId}`;
  const senderId = `learner:${params.sessionId}`;
  const route = {
    agentId: params.account.agentId,
    ...buildChannelOutboundSessionRoute({
      cfg: params.config as OpenClawConfig,
      agentId: params.account.agentId,
      channel: params.channelId,
      accountId: params.account.accountId,
      peer: { kind: "direct", id: target },
      chatType: "direct",
      from: senderId,
      to: target,
    }),
  };

  const storePath = runtime.channel.session.resolveStorePath(params.config.session?.store, {
    agentId: route.agentId,
  });

  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sessionSnapshot = await params.store.setStatus({
    sessionId: params.sessionId,
    status: "adventuring",
    userEntry: {
      id: `${params.sessionId}-user-${now}`,
      role: "user",
      text: params.text,
      time: nowIso,
    },
  });
  const learnerAge = sessionSnapshot.learnerProfile?.age ?? params.meta?.age ?? 8;
  const ageBand = ageBandFromAge(learnerAge);
  const composeKind = sessionSnapshot.currentStory ? "lesson" : "welcome";
  const preferredDeliveryTime = sessionSnapshot.preferences?.deliveryTime ?? "20:30";
  const toolWorkflow = [
    "Turn workflow for this session:",
    `- sessionId: ${params.sessionId}`,
    `- ageBand for compose_lesson: ${ageBand}`,
    `- preferred compose_lesson.kind: ${composeKind}`,
    `- learner's configured daily delivery time: ${preferredDeliveryTime}`,
    "- The child already knows your name is 卡皮巴拉. Never ask the child to rename you.",
    "- If the child's message already contains a topic, do not ask for a second topic-selection turn first.",
    "- Before ending this turn, call get_learner_session, gather context, research the topic, and call compose_lesson.",
    "- For research, prefer one short English noun phrase even if the child's original message is Chinese.",
    "- Use at most 2 distinct research queries. If no reliable source is found, continue to compose_lesson with research omitted/null instead of looping.",
    "- compose_lesson.draft must be a JSON object, not a string.",
    "- compose_lesson.draft.scene must include palette objects shaped like { id, value }. layers and actors may be empty arrays.",
    "- compose_lesson.draft.task must include vocabulary and exactly 3 choices.",
    "- Every vocabularyCards[i].word must appear verbatim in the visible lesson content.",
    "- Every vocabularyCards[i].example must be copied from the visible lesson content, not invented as an extra sentence.",
    "- compose_lesson.draft.suggestedReply should be one concrete next-topic sentence the child can directly send if they want a recommendation.",
    "- After compose_lesson succeeds, reply with one short in-character line that asks what tomorrow's theme should be. If the child may not know, offer one concrete recommendation based on weather, parent note, event, or learner interests.",
  ].join("\n");
  const learnerContext = [
    sessionSnapshot.learnerProfile
      ? `Learner profile:\n- name: ${sessionSnapshot.learnerProfile.name}\n- age: ${sessionSnapshot.learnerProfile.age}\n- englishLevel: ${sessionSnapshot.learnerProfile.englishLevel}\n- interests: ${sessionSnapshot.learnerProfile.interests.join(", ") || "none"}`
      : null,
    sessionSnapshot.environment?.parentNote
      ? `Parent note:\n- ${sessionSnapshot.environment.parentNote}`
      : null,
    sessionSnapshot.currentStory
      ? `Latest delivered story:\n- title: ${sessionSnapshot.currentStory.title}\n- topic: ${sessionSnapshot.currentStory.plan.topic}`
      : null,
    sessionSnapshot.preferences
      ? `Delivery preference:\n- dailyDeliveryTime: ${sessionSnapshot.preferences.deliveryTime}`
      : null,
    params.meta?.age ? `Current turn age hint: ${params.meta.age}` : null,
    params.meta?.englishLevel ? `Current turn englishLevel hint: ${params.meta.englishLevel}` : null,
    toolWorkflow,
  ]
    .filter(Boolean)
    .join("\n\n");
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
    BodyForAgent: learnerContext ? `${learnerContext}\n\nUser says:\n${params.text}` : params.text,
    RawBody: params.text,
    CommandBody: params.text,
    From: senderId,
    To: target,
    SessionKey: route.sessionKey,
    AccountId: params.account.accountId,
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

  sendToClient(params.sessionId, { type: "snapshot", payload: sessionSnapshot } satisfies ServerFrame);
  sendToClient(params.sessionId, { type: "status", state: "thinking" } satisfies ServerFrame);

  let streamedText = "";
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
      streamedText += text;
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

  const latestSnapshot = await params.store.read(params.sessionId);
  if (
    streamedText.trim() &&
    latestSnapshot &&
    latestSnapshot.updatedAt === sessionSnapshot.updatedAt
  ) {
    const replySnapshot = await params.store.appendHistoryEntry({
      sessionId: params.sessionId,
      entry: {
        id: `${params.sessionId}-capybara-${Date.now()}`,
        role: "capybara",
        text: streamedText.trim(),
        time: new Date().toISOString(),
      },
    });
    sendToClient(params.sessionId, { type: "snapshot", payload: replySnapshot } satisfies ServerFrame);
  }

  sendToClient(params.sessionId, { type: "status", state: "idle" } satisfies ServerFrame);
}
