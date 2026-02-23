import { z } from "zod";
import { callFlowTypeSchema } from "./call.js";

export const conversationScriptSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  flow_type: callFlowTypeSchema,
  name: z.string().min(1).max(255),
  system_prompt: z.string().min(1),
  first_message: z.string().nullable().optional(),
  tool_config: z.record(z.unknown()).optional(),
  is_active: z.boolean().default(true),
  version: z.number().int().default(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createScriptSchema = conversationScriptSchema.pick({
  flow_type: true,
  name: true,
  system_prompt: true,
  first_message: true,
  tool_config: true,
});

export const updateScriptSchema = createScriptSchema.partial();

export type ConversationScript = z.infer<typeof conversationScriptSchema>;
export type CreateScript = z.infer<typeof createScriptSchema>;
export type UpdateScript = z.infer<typeof updateScriptSchema>;
