import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listCapybaraLetterAccountIds,
  resolveDefaultCapybaraLetterAccountId,
  resolveCapybaraLetterAccount,
} from "./accounts.js";
import { capybaraLetterPluginConfigSchema } from "./config-schema.js";
import { startCapybaraLetterGatewayAccount } from "./gateway.js";
import { sendCapybaraLetterText } from "./outbound.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { capybaraLetterStatus } from "./status.js";
import type { CoreConfig, ResolvedCapybaraLetterAccount } from "./types.js";

const CHANNEL_ID = "capybara-letter" as const;
const meta = { ...getChatChannelMeta(CHANNEL_ID) };

export const capybaraLetterPlugin: ChannelPlugin<ResolvedCapybaraLetterAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["direct"],
    },
    reload: { configPrefixes: ["channels.capybara-letter"] },
    configSchema: capybaraLetterPluginConfigSchema,
    config: {
      listAccountIds: (cfg) => listCapybaraLetterAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveCapybaraLetterAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultCapybaraLetterAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveCapybaraLetterAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveCapybaraLetterAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo ?? undefined,
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
          from: `capybara-letter:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to: target,
          threadId: threadId ?? undefined,
        }),
    },
    status: capybaraLetterStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startCapybaraLetterGatewayAccount(CHANNEL_ID, meta.label, ctx);
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
        sendCapybaraLetterText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
        }),
    },
  },
});
