import { supabaseAdmin } from "../../lib/supabase.js";
import { NotFoundError } from "../../lib/errors.js";

export async function getOrganisation(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (error || !data) {
    throw new NotFoundError("Organisation", orgId);
  }

  // Strip encrypted fields before returning
  const { ghl_access_token_encrypted, ghl_refresh_token_encrypted, calendar_credentials_encrypted, accounting_credentials_encrypted, ...safe } = data;

  return {
    ...safe,
    ghl_connected: !!ghl_access_token_encrypted,
    calendar_connected: !!calendar_credentials_encrypted,
  };
}

export async function updateOrganisation(orgId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .update(updates)
    .eq("id", orgId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update organisation: ${error.message}`);
  }

  return data;
}

export async function getOrganisationByPhone(phoneNumber: string) {
  const { data } = await supabaseAdmin
    .from("organisations")
    .select("*")
    .eq("phone_number", phoneNumber)
    .eq("is_active", true)
    .single();

  return data;
}

export async function getOrganisationByAgentId(agentId: string) {
  const { data } = await supabaseAdmin
    .from("organisations")
    .select("*")
    .eq("elevenlabs_agent_id", agentId)
    .eq("is_active", true)
    .single();

  return data;
}

export async function listOrganisations(page: number, limit: number, status?: string) {
  let query = supabaseAdmin
    .from("organisations")
    .select("*, users!organisations_owner_user_id_fkey(email, full_name)", { count: "exact" });

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to list organisations: ${error.message}`);
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
  };
}

export async function createOrganisation(input: {
  name: string;
  ownerUserId: string;
  builderName?: string;
  phoneNumber?: string;
  ghlLocationId?: string;
}) {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .insert({
      name: input.name,
      slug: `${slug}-${Date.now().toString(36)}`,
      owner_user_id: input.ownerUserId,
      builder_name: input.builderName,
      phone_number: input.phoneNumber,
      ghl_location_id: input.ghlLocationId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create organisation: ${error.message}`);
  }

  return data;
}

export async function setOrganisationActive(orgId: string, isActive: boolean) {
  const updates: Record<string, unknown> = { is_active: isActive };

  if (isActive) {
    updates.activated_at = new Date().toISOString();
    updates.deactivated_at = null;
  } else {
    updates.deactivated_at = new Date().toISOString();
  }

  return updateOrganisation(orgId, updates);
}
