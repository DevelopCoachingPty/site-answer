import { z } from "zod";

export const callStatusSchema = z.enum([
  "ringing",
  "in_progress",
  "completed",
  "failed",
  "missed",
  "voicemail",
]);

export const callDirectionSchema = z.enum(["inbound", "outbound"]);

export const callFlowTypeSchema = z.enum([
  "new_inquiry",
  "existing_client",
  "payment_query",
  "after_hours",
  "supplier_subcontractor",
  "unknown",
]);

export const sentimentSchema = z.enum(["positive", "neutral", "negative"]);

export const transcriptEntrySchema = z.object({
  role: z.enum(["agent", "caller"]),
  content: z.string(),
  timestamp: z.number(),
});

export const callSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  external_call_id: z.string().nullable().optional(),
  elevenlabs_conversation_id: z.string().nullable().optional(),
  direction: callDirectionSchema.default("inbound"),
  status: callStatusSchema.default("ringing"),
  flow_type: callFlowTypeSchema.default("unknown"),
  caller_number: z.string().nullable(),
  called_number: z.string().nullable(),
  caller_name: z.string().nullable(),
  ghl_contact_id: z.string().nullable().optional(),
  is_new_contact: z.boolean().default(false),
  started_at: z.string().datetime(),
  answered_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  duration_seconds: z.number().int().nullable().optional(),
  transcript: z.array(transcriptEntrySchema).nullable().optional(),
  summary: z.string().nullable().optional(),
  sentiment: sentimentSchema.nullable().optional(),
  recording_url: z.string().url().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const callActionTypeSchema = z.enum([
  "create_contact",
  "update_contact",
  "book_appointment",
  "send_sms",
  "send_email",
  "create_task",
  "log_note",
  "escalate",
]);

export const callActionStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "skipped",
]);

export const callActionSchema = z.object({
  id: z.string().uuid(),
  call_id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  action_type: callActionTypeSchema,
  status: callActionStatusSchema.default("pending"),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).nullable().optional(),
  error_message: z.string().nullable().optional(),
  attempted_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  retry_count: z.number().int().default(0),
  max_retries: z.number().int().default(3),
  created_at: z.string().datetime(),
});

export type Call = z.infer<typeof callSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
export type CallDirection = z.infer<typeof callDirectionSchema>;
export type CallFlowType = z.infer<typeof callFlowTypeSchema>;
export type Sentiment = z.infer<typeof sentimentSchema>;
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type CallAction = z.infer<typeof callActionSchema>;
export type CallActionType = z.infer<typeof callActionTypeSchema>;
