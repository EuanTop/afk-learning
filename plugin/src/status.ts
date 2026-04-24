import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "./runtime-api.js";
import type { ResolvedCapybaraLetterAccount } from "./types.js";

export const capybaraLetterStatus: ReturnType<
  typeof createComputedAccountStatusAdapter<ResolvedCapybaraLetterAccount>
> = createComputedAccountStatusAdapter<ResolvedCapybaraLetterAccount>({
  defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
  buildChannelSummary: ({ snapshot }) => ({
    endpoint: `ws://127.0.0.1:${snapshot.port ?? 18820}`,
  }),
  resolveAccountSnapshot: ({ account }) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    port: account.port,
    extra: {
      agentId: account.agentId,
    },
  }),
});
