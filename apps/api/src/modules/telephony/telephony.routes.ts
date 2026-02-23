import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import { claimWebhookEvent, markWebhookFailed } from "../../lib/webhook-events.js";
import * as orgService from "../organisations/org.service.js";
import * as callsService from "../calls/calls.service.js";
import * as ghlClient from "../ghl/ghl.client.js";
import * as scriptsService from "../scripts/scripts.service.js";
import * as whatsappService from "../whatsapp/whatsapp.service.js";
import { supabaseAdmin } from "../../lib/supabase.js";

const IncomingCallBody = Type.Object({
  CallSid: Type.String(),
  From: Type.String(),
  To: Type.String(),
  CallStatus: Type.String(),
  Direction: Type.Optional(Type.String()),
  CallerName: Type.Optional(Type.String()),
});

const StatusBody = Type.Object({
  CallSid: Type.String(),
  CallStatus: Type.String(),
  CallDuration: Type.Optional(Type.String()),
  RecordingUrl: Type.Optional(Type.String()),
  RecordingSid: Type.Optional(Type.String()),
});

const RecordingBody = Type.Object({
  CallSid: Type.String(),
  RecordingUrl: Type.String(),
  RecordingSid: Type.String(),
  RecordingDuration: Type.Optional(Type.String()),
});

/** Determine if current time is within business hours for the org */
function isBusinessHours(org: {
  timezone: string | null;
  business_hours: Record<string, unknown> | null;
}): boolean {
  if (!org.business_hours) return true; // Default: always open

  const tz = org.timezone ?? "Australia/Sydney";
  const now = new Date();

  // Get current day and time in org's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const dayName = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);

  const hours = org.business_hours as Record<string, { open?: string; close?: string; closed?: boolean }>;
  const todayHours = dayName ? hours[dayName] : null;

  if (!todayHours || todayHours.closed) return false;

  const openHour = parseInt(todayHours.open?.split(":")[0] ?? "9", 10);
  const closeHour = parseInt(todayHours.close?.split(":")[0] ?? "17", 10);

  return hour >= openHour && hour < closeHour;
}

/** Determine call flow type based on caller and time */
async function determineFlowType(
  org: Record<string, unknown>,
  callerNumber: string,
  withinBusinessHours: boolean,
): Promise<string> {
  if (!withinBusinessHours) return "after_hours";

  // Try to look up the caller in GHL
  if (org.ghl_location_id && org.ghl_access_token_encrypted) {
    try {
      const contact = await ghlClient.lookupContact(
        org.id as string,
        org.ghl_location_id as string,
        callerNumber,
      );
      if (contact) {
        // Check if they have payment-related tags
        const tags = (contact.tags as string[]) ?? [];
        if (tags.some((t: string) => t.includes("payment") || t.includes("invoice"))) {
          return "payment_query";
        }
        if (tags.some((t: string) => t.includes("supplier") || t.includes("subcontractor"))) {
          return "supplier_subcontractor";
        }
        return "existing_client";
      }
    } catch {
      // GHL lookup failed, default to new_inquiry
    }
  }

  return "new_inquiry";
}

const telephonyRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /webhooks/telephony/incoming - New inbound call
  fastify.post<{ Body: Static<typeof IncomingCallBody> }>("/incoming", {
    schema: { body: IncomingCallBody },
    handler: async (request, reply) => {
      const { CallSid, From, To, CallerName } = request.body;
      const log = logger.child({ callSid: CallSid });

      // Idempotency check
      const isNew = await claimWebhookEvent("twilio", CallSid, "incoming", request.body);
      if (!isNew) {
        return reply.send({ status: "duplicate" });
      }

      try {
        // TODO: Verify Twilio signature (X-Twilio-Signature header)

        // Identify organisation by called number
        const org = await orgService.getOrganisationByPhone(To);
        if (!org) {
          log.warn({ to: To }, "No organisation found for called number");
          await markWebhookFailed("twilio", CallSid, "No org found");
          // Return TwiML to play a message
          reply.header("Content-Type", "text/xml");
          return reply.send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, this number is not currently active.</Say><Hangup/></Response>`,
          );
        }

        // Check business hours
        const withinHours = isBusinessHours(org as unknown as { timezone: string | null; business_hours: Record<string, unknown> | null });

        // Determine call flow
        const flowType = await determineFlowType(org, From, withinHours);

        // Get the appropriate script (used for agent prompt override in future)
        const _script = await scriptsService.getActiveScript(org.id, flowType);

        // Create call record
        const call = await callsService.createCall({
          organisation_id: org.id,
          external_call_id: CallSid,
          direction: "inbound",
          caller_number: From,
          called_number: To,
          caller_name: CallerName,
          flow_type: flowType,
        });

        log.info(
          { callId: call.id, orgId: org.id, flowType, withinHours },
          "Incoming call processed",
        );

        // Return TwiML to connect to ElevenLabs via WebSocket stream
        // or redirect to the ElevenLabs agent phone number
        if (org.elevenlabs_agent_id) {
          reply.header("Content-Type", "text/xml");
          return reply.send(
            `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.hostname}/api/v1/webhooks/telephony/stream">
      <Parameter name="callId" value="${call.id}"/>
      <Parameter name="orgId" value="${org.id}"/>
      <Parameter name="agentId" value="${org.elevenlabs_agent_id}"/>
      <Parameter name="flowType" value="${flowType}"/>
    </Stream>
  </Connect>
</Response>`,
          );
        }

        // Fallback: voicemail
        reply.header("Content-Type", "text/xml");
        return reply.send(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello, you've reached ${org.name}. We're unable to take your call right now. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`,
        );
      } catch (err) {
        log.error({ err }, "Error processing incoming call");
        await markWebhookFailed("twilio", CallSid, String(err));
        reply.header("Content-Type", "text/xml");
        return reply.send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>`,
        );
      }
    },
  });

  // POST /webhooks/telephony/status - Call status updates
  fastify.post<{ Body: Static<typeof StatusBody> }>("/status", {
    schema: { body: StatusBody },
    handler: async (request, reply) => {
      const { CallSid, CallStatus, CallDuration, RecordingUrl } = request.body;
      const log = logger.child({ callSid: CallSid });

      log.info({ status: CallStatus }, "Call status update");

      // Find the call record
      const { data: call } = await supabaseAdmin
        .from("calls")
        .select("id")
        .eq("external_call_id", CallSid)
        .single();

      if (!call) {
        log.warn("No call record found for status update");
        return reply.send({ status: "ignored" });
      }

      const updates: Record<string, unknown> = {};

      switch (CallStatus) {
        case "completed":
          updates.status = "completed";
          updates.ended_at = new Date().toISOString();
          if (CallDuration) {
            updates.duration_seconds = parseInt(CallDuration, 10);
          }
          break;
        case "busy":
        case "no-answer":
          updates.status = "missed";
          updates.ended_at = new Date().toISOString();
          break;
        case "failed":
        case "canceled":
          updates.status = "failed";
          updates.ended_at = new Date().toISOString();
          break;
        case "in-progress":
          updates.status = "in_progress";
          break;
      }

      if (RecordingUrl) {
        updates.recording_url = RecordingUrl;
      }

      if (Object.keys(updates).length > 0) {
        await callsService.updateCall(call.id, updates);
      }

      return reply.send({ status: "received" });
    },
  });

  // POST /webhooks/telephony/recording - Recording ready
  fastify.post<{ Body: Static<typeof RecordingBody> }>("/recording", {
    schema: { body: RecordingBody },
    handler: async (request, reply) => {
      const { CallSid, RecordingUrl } = request.body;
      const log = logger.child({ callSid: CallSid });

      log.info("Recording ready");

      const { data: call } = await supabaseAdmin
        .from("calls")
        .select("id")
        .eq("external_call_id", CallSid)
        .single();

      if (call) {
        await callsService.updateCall(call.id, { recording_url: RecordingUrl });
      }

      return reply.send({ status: "received" });
    },
  });
  // POST /webhooks/telephony/whatsapp-status - WhatsApp message status
  fastify.post("/whatsapp-status", async (request, reply) => {
    const payload = request.body as Record<string, string>;
    const messageSid = payload.MessageSid;
    const messageStatus = payload.MessageStatus;

    if (messageSid && messageStatus) {
      logger.info({ messageSid, status: messageStatus }, "WhatsApp status update");
      await whatsappService.updateMessageStatus(
        messageSid,
        messageStatus,
        payload.ErrorMessage,
      );
    }

    return reply.send({ status: "received" });
  });
};

export default telephonyRoutes;
