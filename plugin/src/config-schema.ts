import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const EduStoryAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    host: z.string().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.string().optional(),
    agentId: z.string().optional(),
  })
  .strict();

export const EduStoryConfigSchema = EduStoryAccountConfigSchema.extend({
  accounts: z.record(z.string(), EduStoryAccountConfigSchema.partial()).optional(),
  defaultAccount: z.string().optional(),
}).strict();

export const eduStoryPluginConfigSchema = buildChannelConfigSchema(EduStoryConfigSchema);
