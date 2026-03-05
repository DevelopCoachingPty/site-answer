/**
 * Post-Call Processing Service
 *
 * Processes completed calls inline (no queue):
 * 1. Save transcript and summary to call record
 * 2. Process tool call results into call_actions
 * 3. Run GHL sync directly if connected
 * 4. Update usage tracking
 * 5. Send WhatsApp notifications if enabled
 */

import { logger } from "../lib/logger.js";
import * as callsService from "../modules/calls/calls.service.js";
import * as usageService from "../modules/usage/usage.service.js";
import * as orgService from "../modules/organisations/org.service.js";
import * as whatsappService from "../modules/whatsapp/whatsapp.service.js";
import { processGhlSync } from "./ghl-sync.service.js";

export interface PostCallData {
  conversation_id: string;
  agent_id: string;
  transcript?: Array<{ role: string; message: string; timestamp?: number }>;
  summary?: string;
  tool_calls?: Array<{
    tool_name: string;
    parameters: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
}

export async function processPostCall(data: PostCallData): Promise<void> {
  const log = logger.child({ conversationId: data.conversation_id });
  log.info("Processing post-call");

  const { agent_id, conversation_id, transcript, summary, tool_calls, duration_seconds } = data;

  // Resolve organisation from agent_id
  const org = await orgService.getOrganisationByAgentId(agent_id);
  if (!org) {
    log.warn({ agentId: agent_id }, "No organisation found for agent");
    return;
  }

  // Find or create the call record by conversation_id
  const { supabaseAdmin } = await import("../lib/supabase.js");
  let { data: call } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("external_call_id", conversation_id)
    .single();

  // If no call record exists (e.g. ElevenLabs phone number, no Twilio webhook), create one
  if (!call) {
    log.info({ conversationId: conversation_id, orgId: org.id }, "No call record found, creating from post-call data");

    const callerNumber = extractCallerNumber(data);

    call = await callsService.createCall({
      organisation_id: org.id,
      external_call_id: conversation_id,
      direction: "inbound",
      caller_number: callerNumber ?? undefined,
      flow_type: "new_inquiry",
    });
  }

  // Safety check — should never happen after create, but satisfies TypeScript
  if (!call) {
    log.error("Failed to find or create call record");
    return;
  }

  // 1. Update call record with transcript and summary
  const updates: Record<string, unknown> = {
    status: "completed",
    ended_at: new Date().toISOString(),
  };

  if (transcript) {
    updates.transcript = transcript.map((t) => ({
      role: t.role,
      content: t.message,
      timestamp: t.timestamp,
    }));
  }

  if (summary) {
    updates.summary = summary;
  }

  if (duration_seconds) {
    updates.duration_seconds = duration_seconds;
  }

  // Extract caller name from tool calls if not already on the record
  const callerName = extractCallerName(data);
  if (callerName) {
    updates.caller_name = callerName;
  }

  // Extract screening outcome from tool calls if present
  const screeningToolCall = tool_calls?.find((tc) => tc.tool_name === "tag_call_outcome");
  if (screeningToolCall) {
    updates.screening_outcome = screeningToolCall.parameters.outcome;
  }

  await callsService.updateCall(call.id, updates);

  // 2. Process tool calls into call_actions
  if (tool_calls) {
    for (const tc of tool_calls) {
      await callsService.createCallAction({
        call_id: call.id,
        organisation_id: org.id,
        action_type: tc.tool_name,
        payload: { parameters: tc.parameters, result: tc.result },
        status: "completed",
      });
    }
  }

  // 3. GHL sync directly if applicable
  if (org.ghl_access_token_encrypted && tool_calls?.length) {
    try {
      await processGhlSync({
        organisationId: org.id,
        callId: call.id,
        actions: tool_calls.map((tc) => ({
          type: tc.tool_name,
          data: { ...tc.parameters, ...tc.result },
        })),
      });
    } catch (err) {
      log.error({ err }, "GHL sync failed (non-critical)");
    }
  }

  // 4. Update usage tracking
  const isNewContact = tool_calls?.some((tc) => tc.tool_name === "create_new_contact");
  const bookedAppointment = tool_calls?.some((tc) => tc.tool_name === "book_appointment");

  await usageService.incrementUsage(org.id, {
    calls: 1,
    minutes: duration_seconds ? duration_seconds / 60 : 0,
    inbound: 1,
    new_contacts: isNewContact ? 1 : 0,
    appointments: bookedAppointment ? 1 : 0,
  });

  // 5. Send WhatsApp confirmation if enabled
  try {
    const { data: orgDetails } = await supabaseAdmin
      .from("organisations")
      .select("whatsapp_enabled, name")
      .eq("id", org.id)
      .single();

    if (orgDetails?.whatsapp_enabled) {
      const callerNumber = await getCallerNumber(call.id);
      if (callerNumber) {
        if (bookedAppointment) {
          const appointmentAction = tool_calls?.find((tc) => tc.tool_name === "book_appointment");
          await whatsappService.sendTemplateMessage(org.id, callerNumber, "booking_confirmation", {
            company_name: orgDetails.name ?? "our team",
            datetime: (appointmentAction?.result as Record<string, string>)?.message ?? "as discussed",
            contact_name: (appointmentAction?.parameters as Record<string, string>)?.contact_id ?? "there",
          }, call.id);
        } else {
          await whatsappService.sendTemplateMessage(org.id, callerNumber, "inquiry_summary", {
            company_name: orgDetails.name ?? "our team",
            contact_name: "there",
          }, call.id);
        }
      }
    }
  } catch (err) {
    log.warn({ err }, "WhatsApp post-call message failed (non-critical)");
  }

  // 6. Notify builder via SMS + in-app notification
  try {
    const { data: orgNotify } = await supabaseAdmin
      .from("organisations")
      .select("escalation_phone, escalation_sms_enabled, ghl_location_id, ghl_access_token_encrypted, name")
      .eq("id", org.id)
      .single();

    const callerNumber = await getCallerNumber(call.id);
    const shortSummary = summary
      ? summary.length > 120 ? summary.slice(0, 117) + "..." : summary
      : "No summary available";

    // Always create in-app notification
    await supabaseAdmin.from("notifications").insert({
      organisation_id: org.id,
      type: "call_completed",
      title: `Call from ${callerNumber ?? "unknown"}`,
      message: shortSummary,
      is_read: false,
    });

    // Send SMS to builder if enabled and GHL connected
    if (
      orgNotify?.escalation_sms_enabled &&
      orgNotify.escalation_phone &&
      orgNotify.ghl_access_token_encrypted &&
      orgNotify.ghl_location_id
    ) {
      const { lookupContact, createContact, sendSms: ghlSendSms } = await import("../modules/ghl/ghl.client.js");
      const smsMessage = `SiteAnswer: New call from ${callerNumber ?? "unknown"} — ${shortSummary}`;

      // Find or create the builder as a GHL contact to send SMS
      let builderContact = await lookupContact(org.id, orgNotify.ghl_location_id, orgNotify.escalation_phone);
      if (!builderContact) {
        builderContact = await createContact(org.id, orgNotify.ghl_location_id, {
          name: orgNotify.name ?? "Builder",
          phone: orgNotify.escalation_phone,
          tags: ["siteanswer-builder"],
        });
      }

      if (builderContact?.id) {
        await ghlSendSms(org.id, builderContact.id as string, smsMessage);
        log.info({ phone: orgNotify.escalation_phone }, "Post-call SMS sent to builder");
      }
    }
  } catch (err) {
    log.warn({ err }, "Builder notification failed (non-critical)");
  }

  log.info({ callId: call.id, orgId: org.id }, "Post-call processing complete");
}

/** Extract caller name from post-call data (tool calls) */
function extractCallerName(data: PostCallData): string | null {
  if (data.tool_calls) {
    for (const tc of data.tool_calls) {
      if (tc.tool_name === "create_new_contact" && tc.parameters.name) {
        return tc.parameters.name as string;
      }
      if (tc.tool_name === "lookup_caller" && tc.result?.name) {
        return tc.result.name as string;
      }
      if (tc.tool_name === "log_message" && tc.parameters.caller_name) {
        return tc.parameters.caller_name as string;
      }
    }
  }
  return null;
}

/** Extract caller phone number from post-call data (metadata or tool calls) */
function extractCallerNumber(data: PostCallData): string | null {
  // Check metadata first (e.g. outbound calls store it there)
  const meta = data.metadata as Record<string, unknown> | undefined;
  if (meta?.caller_number) return meta.caller_number as string;
  if (meta?.from) return meta.from as string;
  if (meta?.to) return meta.to as string;

  // Check tool calls — lookup_caller and create_new_contact contain the phone number
  if (data.tool_calls) {
    for (const tc of data.tool_calls) {
      if (tc.tool_name === "lookup_caller" && tc.parameters.phone_number) {
        return tc.parameters.phone_number as string;
      }
      if (tc.tool_name === "create_new_contact" && tc.parameters.phone) {
        return tc.parameters.phone as string;
      }
      if (tc.tool_name === "send_sms" && tc.parameters.phone_number) {
        return tc.parameters.phone_number as string;
      }
    }
  }

  return null;
}

async function getCallerNumber(callId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("../lib/supabase.js");
  const { data } = await supabaseAdmin
    .from("calls")
    .select("caller_number")
    .eq("id", callId)
    .single();
  return data?.caller_number ?? null;
}
