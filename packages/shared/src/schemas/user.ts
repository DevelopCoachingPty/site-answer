import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "member", "viewer"]);

export const userSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid().nullable(),
  role: userRoleSchema.default("member"),
  full_name: z.string().nullable(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  is_admin: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
