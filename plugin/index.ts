import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";

function registerEduStoryTools(api: OpenClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: OpenClawPluginApi) => void>(import.meta.url, {
    specifier: "./api.js",
    exportName: "registerEduStoryTools",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "edu-story",
  name: "Capybara's Letter",
  description: "Bilingual educational channel for children",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./api.js",
    exportName: "eduStoryPlugin",
  },
  runtime: {
    specifier: "./api.js",
    exportName: "setEduStoryRuntime",
  },
  registerFull(api: OpenClawPluginApi) {
    registerEduStoryTools(api);
  },
});
