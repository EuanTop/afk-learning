import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";

function registerCapybaraLetterTools(api: OpenClawPluginApi) {
  const register = loadBundledEntryExportSync<(api: OpenClawPluginApi) => void>(import.meta.url, {
    specifier: "./api.js",
    exportName: "registerCapybaraLetterTools",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "capybara-letter",
  name: "Capybara's Letter",
  description: "Bilingual educational channel for children",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./api.js",
    exportName: "capybaraLetterPlugin",
  },
  runtime: {
    specifier: "./api.js",
    exportName: "setCapybaraLetterRuntime",
  },
  registerFull(api: OpenClawPluginApi) {
    registerCapybaraLetterTools(api);
  },
});
