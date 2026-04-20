import path from "node:path";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk/channel-entry-contract";
import {
  createWikipediaResearchTool,
  createReviewWordTool,
  createGetSessionTool,
} from "./src/tools/index.js";
import { EduStorySessionStore } from "./src/tools/session-store.js";

export * from "./src/accounts.js";
export * from "./src/channel.js";
export { setEduStoryRuntime } from "./src/runtime.js";

export function registerEduStoryTools(api: OpenClawPluginApi) {
  const sessionsRoot = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
    ".openclaw",
    "edu-story",
    "sessions",
  );
  const store = new EduStorySessionStore(sessionsRoot);

  api.registerTool(createWikipediaResearchTool() as unknown as AnyAgentTool);
  api.registerTool(createReviewWordTool(store) as unknown as AnyAgentTool);
  api.registerTool(createGetSessionTool(store) as unknown as AnyAgentTool);
}
