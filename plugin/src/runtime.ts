import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setEduStoryRuntime, getRuntime: getEduStoryRuntime } =
  createPluginRuntimeStore<PluginRuntime>("edu-story channel runtime not initialized");

export { getEduStoryRuntime, setEduStoryRuntime };
