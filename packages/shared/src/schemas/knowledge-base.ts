import { z } from "zod";

export const kbCategorySchema = z.enum([
  "services",
  "pricing",
  "faq",
  "process",
  "team",
  "area_coverage",
  "policies",
]);

export const knowledgeBaseEntrySchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  category: kbCategorySchema,
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createKbEntrySchema = knowledgeBaseEntrySchema.pick({
  category: true,
  title: true,
  content: true,
  metadata: true,
  sort_order: true,
});

export const updateKbEntrySchema = createKbEntrySchema.partial();

export type KnowledgeBaseEntry = z.infer<typeof knowledgeBaseEntrySchema>;
export type KBCategory = z.infer<typeof kbCategorySchema>;
export type CreateKbEntry = z.infer<typeof createKbEntrySchema>;
export type UpdateKbEntry = z.infer<typeof updateKbEntrySchema>;
