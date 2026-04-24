import { resolveCapybaraLetterAccount } from "./accounts.js";
import { sendToClient } from "./gateway.js";
import type { CoreConfig, ServerFrame } from "./types.js";

export async function sendCapybaraLetterText(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  to: string;
  text: string;
}) {
  const sessionId = params.to.replace(/^capybara-letter:/, "");
  const sent = sendToClient(sessionId, { type: "delta", text: params.text } satisfies ServerFrame);
  return {
    to: params.to,
    messageId: crypto.randomUUID(),
    delivered: sent,
  };
}
