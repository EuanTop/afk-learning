import { resolveEduStoryAccount } from "./accounts.js";
import { sendToClient } from "./gateway.js";
import type { CoreConfig, ServerFrame } from "./types.js";

export async function sendEduStoryText(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  to: string;
  text: string;
}) {
  const sessionId = params.to.replace(/^edu-story:/, "");
  const sent = sendToClient(sessionId, { type: "delta", text: params.text } satisfies ServerFrame);
  return {
    to: params.to,
    messageId: crypto.randomUUID(),
    delivered: sent,
  };
}
