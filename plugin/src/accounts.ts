import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type { CoreConfig, CapybaraLetterAccountConfig, ResolvedCapybaraLetterAccount } from "./types.js";

const DEFAULT_PORT = 18820;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_AGENT_ID = "capybara";

const {
  listAccountIds: listCapybaraLetterAccountIds,
  resolveDefaultAccountId: resolveDefaultCapybaraLetterAccountId,
} = createAccountListHelpers("capybara-letter", { normalizeAccountId });

export { listCapybaraLetterAccountIds, resolveDefaultCapybaraLetterAccountId };

function resolveMergedCapybaraLetterAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): CapybaraLetterAccountConfig {
  return resolveMergedAccountConfig<CapybaraLetterAccountConfig>({
    channelConfig: cfg.channels?.["capybara-letter"] as CapybaraLetterAccountConfig | undefined,
    accounts: cfg.channels?.["capybara-letter"]?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveCapybaraLetterAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedCapybaraLetterAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedCapybaraLetterAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.["capybara-letter"]?.enabled !== false;
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
export type { ResolvedCapybaraLetterAccount } from "./types.js";
