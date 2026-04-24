import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { capybaraLetterPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(capybaraLetterPlugin);
