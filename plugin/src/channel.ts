import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listEduStoryAccountIds,
  resolveDefaultEduStoryAccountId,
  resolveEduStoryAccount,
} from "./accounts.js";
import { eduStoryPluginConfigSchema } from "./config-schema.js";
import { startEduStoryGatewayAccount } from "./gateway.js";
import { sendEduStoryText } from "./outbound.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { eduStoryStatus } from "./status.js";
import type { CoreConfig, ResolvedEduStoryAccount } from "./types.js";

const CHANNEL_ID = "edu-story" as const;
const meta = { ...getChatChannelMeta(CHANNEL_ID) };

export const eduStoryPlugin: ChannelPlugin<ResolvedEduStoryAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["direct"],
    },
    reload: { configPrefixes: ["channels.edu-story"] },
    configSchema: eduStoryPluginConfigSchema,
    config: {
      listAccountIds: (cfg) => listEduStoryAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveEduStoryAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultEduStoryAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveEduStoryAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveEduStoryAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo ?? undefined,
    },
    messaging: {
      normalizeTarget: (raw) => raw.trim().toLowerCase(),
      parseExplicitTarget: ({ raw }) => ({
        to: raw.trim(),
        chatType: "direct" as const,
      }),
      inferTargetChatType: () => "direct" as const,
      targetResolver: {
        looksLikeId: (raw) => raw.trim().length > 0,
        hint: "<session-id>",
      },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target, threadId }) =>
        buildChannelOutboundSessionRoute({
          cfg,
          agentId,
          channel: CHANNEL_ID,
          accountId,
          peer: { kind: "direct", id: target },
          chatType: "direct",
          from: `edu-story:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to: target,
          threadId: threadId ?? undefined,
        }),
    },
    status: eduStoryStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startEduStoryGatewayAccount(CHANNEL_ID, meta.label, ctx);
      },
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
    },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ cfg, to, text, accountId }) =>
        sendEduStoryText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
        }),
    },
  },
});
