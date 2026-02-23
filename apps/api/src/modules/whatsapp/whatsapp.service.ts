/**
 * WhatsApp Service
 *
 * Send templated and freeform WhatsApp messages via Twilio.
 */

import { supabaseAdmin } from "../../lib/supabase.js";
import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../config/constants.js";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

// --- Twilio WhatsApp ---

async function twilioFetch(orgId: string, path: string, body: Record<string, string>) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new ExternalServiceError("Twilio", "Credentials not configured");
  }

  const response = await fetch(`${TWILIO_API}/Accounts/${accountSid}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ orgId, status: response.status, body: text }, "Twilio WhatsApp API error");
    throw new ExternalServiceError("Twilio", `API error (${response.status}): ${text}`);
  }

  return response.json();
}

// --- Template Management ---

export async function listTemplates(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("*")
    .eq("organisation_id", orgId)
    .order("template_type");

  if (error) throw new ExternalServiceError("Database", `Failed to list templates: ${error.message}`);
  return data ?? [];
}

export async function getTemplate(orgId: string, templateId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("id", templateId)
    .single();

  if (error) throw new ExternalServiceError("Database", `Failed to get template: ${error.message}`);
  return data;
}

export async function upsertTemplate(
  orgId: string,
  input: {
    name: string;
    template_type: string;
    body_template: string;
    is_active?: boolean;
  },
) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .upsert(
      {
        organisation_id: orgId,
        ...input,
      },
      { onConflict: "organisation_id,template_type" },
    )
    .select()
    .single();

  if (error) throw new ExternalServiceError("Database", `Failed to upsert template: ${error.message}`);
  return data;
}

export async function deleteTemplate(orgId: string, templateId: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_templates")
    .delete()
    .eq("organisation_id", orgId)
    .eq("id", templateId);

  if (error) throw new ExternalServiceError("Database", `Failed to delete template: ${error.message}`);
}

// --- Sending Messages ---

export async function sendTemplateMessage(
  orgId: string,
  to: string,
  templateType: string,
  variables: Record<string, string>,
  callId?: string,
) {
  // Look up template
  const { data: template } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("template_type", templateType)
    .eq("is_active", true)
    .single();

  if (!template) {
    logger.warn({ orgId, templateType }, "No active WhatsApp template found");
    return null;
  }

  // Render template
  let body = template.body_template;
  for (const [key, value] of Object.entries(variables)) {
    body = body.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }

  return sendMessage(orgId, to, body, template.id, callId);
}

export async function sendMessage(
  orgId: string,
  to: string,
  body: string,
  templateId?: string,
  callId?: string,
) {
  // Get org WhatsApp number
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("whatsapp_enabled, whatsapp_phone_number")
    .eq("id", orgId)
    .single();

  if (!org?.whatsapp_enabled || !org.whatsapp_phone_number) {
    logger.warn({ orgId }, "WhatsApp not enabled for this organisation");
    return null;
  }

  // Create message record
  const { data: message, error: insertError } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      organisation_id: orgId,
      call_id: callId ?? null,
      template_id: templateId ?? null,
      to_number: to,
      body,
      status: "queued",
    })
    .select()
    .single();

  if (insertError) throw new ExternalServiceError("Database", `Failed to create message: ${insertError.message}`);

  // Send via Twilio
  try {
    const from = `whatsapp:${org.whatsapp_phone_number}`;
    const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    const result = await twilioFetch(orgId, "/Messages.json", {
      From: from,
      To: toWhatsApp,
      Body: body,
    }) as { sid: string };

    // Update message with Twilio SID
    await supabaseAdmin
      .from("whatsapp_messages")
      .update({ twilio_sid: result.sid, status: "sent" })
      .eq("id", message!.id);

    logger.info({ orgId, messageId: message!.id, twilioSid: result.sid }, "WhatsApp message sent");
    return { ...message, twilio_sid: result.sid, status: "sent" };
  } catch (err) {
    // Update message with error
    await supabaseAdmin
      .from("whatsapp_messages")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", message!.id);

    logger.error({ err, orgId, messageId: message!.id }, "Failed to send WhatsApp message");
    return { ...message, status: "failed", error_message: String(err) };
  }
}

// --- Message History ---

export async function listMessages(
  orgId: string,
  filters?: { status?: string; page?: number; limit?: number },
) {
  const page = filters?.page ?? 1;
  const limit = Math.min(filters?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("whatsapp_messages")
    .select("*", { count: "exact" })
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query;
  if (error) throw new ExternalServiceError("Database", `Failed to list messages: ${error.message}`);

  return { data: data ?? [], total: count ?? 0, page, limit };
}

// --- Status Webhook ---

export async function updateMessageStatus(twilioSid: string, status: string, errorMessage?: string) {
  const statusMap: Record<string, string> = {
    queued: "queued",
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
    undelivered: "failed",
  };

  const mappedStatus = statusMap[status] ?? status;

  const updates: Record<string, unknown> = { status: mappedStatus };
  if (errorMessage) updates.error_message = errorMessage;

  await supabaseAdmin
    .from("whatsapp_messages")
    .update(updates)
    .eq("twilio_sid", twilioSid);
}
