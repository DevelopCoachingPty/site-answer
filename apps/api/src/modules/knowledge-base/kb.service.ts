import { supabaseAdmin } from "../../lib/supabase.js";
import { NotFoundError } from "../../lib/errors.js";

export async function listKnowledgeBase(orgId: string, category?: string) {
  let query = supabaseAdmin
    .from("knowledge_base")
    .select("*")
    .eq("organisation_id", orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list knowledge base: ${error.message}`);
  }

  return data ?? [];
}

export async function getKnowledgeBaseEntry(orgId: string, entryId: string) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_base")
    .select("*")
    .eq("id", entryId)
    .eq("organisation_id", orgId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Knowledge base entry", entryId);
  }

  return data;
}

export async function createKnowledgeBaseEntry(orgId: string, input: {
  category: string;
  title: string;
  content: string;
  sort_order?: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_base")
    .insert({
      organisation_id: orgId,
      category: input.category,
      title: input.title,
      content: input.content,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create KB entry: ${error.message}`);
  }

  return data;
}

export async function updateKnowledgeBaseEntry(
  orgId: string,
  entryId: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_base")
    .update(updates)
    .eq("id", entryId)
    .eq("organisation_id", orgId)
    .select()
    .single();

  if (error) {
    throw new NotFoundError("Knowledge base entry", entryId);
  }

  return data;
}

export async function deleteKnowledgeBaseEntry(orgId: string, entryId: string) {
  const { error } = await supabaseAdmin
    .from("knowledge_base")
    .delete()
    .eq("id", entryId)
    .eq("organisation_id", orgId);

  if (error) {
    throw new Error(`Failed to delete KB entry: ${error.message}`);
  }
}

export async function getActiveKnowledgeBase(orgId: string) {
  const { data } = await supabaseAdmin
    .from("knowledge_base")
    .select("category, title, content")
    .eq("organisation_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return data ?? [];
}
