import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setCapybaraLetterRuntime, getRuntime: getCapybaraLetterRuntime } =
  createPluginRuntimeStore<PluginRuntime>("capybara-letter channel runtime not initialized");

export { getCapybaraLetterRuntime, setCapybaraLetterRuntime };
