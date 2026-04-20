import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type { CoreConfig, EduStoryAccountConfig, ResolvedEduStoryAccount } from "./types.js";

const DEFAULT_PORT = 18820;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_AGENT_ID = "capybara";

const {
  listAccountIds: listEduStoryAccountIds,
  resolveDefaultAccountId: resolveDefaultEduStoryAccountId,
} = createAccountListHelpers("edu-story", { normalizeAccountId });

export { listEduStoryAccountIds, resolveDefaultEduStoryAccountId };

function resolveMergedEduStoryAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): EduStoryAccountConfig {
  return resolveMergedAccountConfig<EduStoryAccountConfig>({
    channelConfig: cfg.channels?.["edu-story"] as EduStoryAccountConfig | undefined,
    accounts: cfg.channels?.["edu-story"]?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveEduStoryAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedEduStoryAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedEduStoryAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.["edu-story"]?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const port = merged.port ?? DEFAULT_PORT;
  const host = merged.host?.trim() || DEFAULT_HOST;
  const agentId = merged.agentId?.trim() || DEFAULT_AGENT_ID;
  return {
    accountId,
    enabled,
    configured: true,
    name: normalizeOptionalString(merged.name),
    port,
    host,
    agentId,
    config: {
      ...merged,
      allowFrom: merged.allowFrom ?? ["*"],
    },
  };
}

export { DEFAULT_ACCOUNT_ID };
export type { ResolvedEduStoryAccount } from "./types.js";
