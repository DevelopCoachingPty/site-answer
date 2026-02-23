import { z } from "zod";

export const businessHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
}).nullable();

export const organisationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  owner_user_id: z.string().uuid(),
  elevenlabs_agent_id: z.string().nullable().optional(),
  elevenlabs_voice_id: z.string().nullable().optional(),
  ghl_location_id: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  business_type: z.string().default("construction"),
  timezone: z.string().default("Europe/London"),
  business_hours: z.object({
    mon: businessHoursSchema,
    tue: businessHoursSchema,
    wed: businessHoursSchema,
    thu: businessHoursSchema,
    fri: businessHoursSchema,
    sat: businessHoursSchema,
    sun: businessHoursSchema,
  }),
  after_hours_action: z.enum(["voicemail", "message", "emergency_only", "off"]).default("voicemail"),
  greeting_name: z.string().optional(),
  builder_name: z.string().optional(),
  escalation_phone: z.string().optional(),
  escalation_sms: z.boolean().default(true),
  calendar_type: z.enum(["google", "outlook", "calendly"]).nullable().optional(),
  monthly_minutes_limit: z.number().int().positive().default(500),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createOrganisationSchema = organisationSchema.pick({
  name: true,
  business_type: true,
  timezone: true,
}).extend({
  builder_name: z.string().min(1),
  phone_number: z.string().optional(),
});

export const updateOrganisationSchema = organisationSchema.partial().omit({
  id: true,
  owner_user_id: true,
  created_at: true,
  updated_at: true,
});

export type Organisation = z.infer<typeof organisationSchema>;
export type CreateOrganisation = z.infer<typeof createOrganisationSchema>;
export type UpdateOrganisation = z.infer<typeof updateOrganisationSchema>;
