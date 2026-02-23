import { z } from "zod";

export const usageTrackingSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  total_calls: z.number().int().default(0),
  total_minutes: z.number().default(0),
  total_characters: z.number().int().default(0),
  inbound_calls: z.number().int().default(0),
  outbound_calls: z.number().int().default(0),
  missed_calls: z.number().int().default(0),
  new_contacts_created: z.number().int().default(0),
  appointments_booked: z.number().int().default(0),
  sms_sent: z.number().int().default(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type UsageTracking = z.infer<typeof usageTrackingSchema>;
