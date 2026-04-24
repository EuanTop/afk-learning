import path from "node:path";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk/channel-entry-contract";
import {
  createWikipediaResearchTool,
  createReviewWordTool,
  createGetSessionTool,
  createComposeLessonTool,
  createWeatherTool,
} from "./src/tools/index.js";
import { CapybaraLetterSessionStore } from "./src/tools/session-store.js";

export * from "./src/accounts.js";
export * from "./src/channel.js";
export { setCapybaraLetterRuntime } from "./src/runtime.js";

export function registerCapybaraLetterTools(api: OpenClawPluginApi) {
  const sessionsRoot = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
    ".openclaw",
    "capybara-letter",
    "sessions",
  );
  const store = new CapybaraLetterSessionStore(sessionsRoot);

  api.registerTool(createWikipediaResearchTool() as unknown as AnyAgentTool);
  api.registerTool(createReviewWordTool(store) as unknown as AnyAgentTool);
  api.registerTool(createGetSessionTool(store) as unknown as AnyAgentTool);
  api.registerTool(createComposeLessonTool(store) as unknown as AnyAgentTool);
  api.registerTool(createWeatherTool() as unknown as AnyAgentTool);
}
