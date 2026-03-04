import { createHmac } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { claimWebhookEvent, markWebhookFailed } from "../../lib/webhook-events.js";
import * as orgService from "../organisations/org.service.js";
import * as callsService from "../calls/calls.service.js";
import * as ghlClient from "../ghl/ghl.client.js";
import * as scriptsService from "../scripts/scripts.service.js";
import * as whatsappService from "../whatsapp/whatsapp.service.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import {
  findSessionByConferenceRoom,
  findSessionByBuilderCallSid,
  finalCleanup,
} from "./audio-bridge.js";
import { handleBuilderNoAnswer } from "./warm-transfer.service.js";

function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    if (env.NODE_ENV === "production") {
      logger.error("TWILIO_AUTH_TOKEN not set in production — rejecting webhook");
      return false;
    }
    logger.warn("TWILIO_AUTH_TOKEN not set, skipping signature verification (dev only)");
    return true;
  }
  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], "");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return expected === signature;
}

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
function isBusinessHours(org: Record<string, unknown>): boolean {
  if (!org.business_hours) return true;
  const tz = (org.timezone as string) ?? env.DEFAULT_TIMEZONE;
  const now = new Date();
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
  const hours = org.business_hours as Record<string, { open?: string; close?: string; closed?: boolean } | null>;
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
  if (org.ghl_location_id && org.ghl_access_token_encrypted) {
    try {
      const contact = await ghlClient.lookupContact(
        org.id as string,
        org.ghl_location_id as string,
        callerNumber,
      );
      if (contact) {
        const tags = (contact as Record<string, unknown>).tags as string[] ?? [];
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

      const isNew = await claimWebhookEvent("twilio", CallSid, "incoming", request.body as Record<string, unknown>);
      if (!isNew) {
        return reply.send({ status: "duplicate" });
      }

      try {
        const twilioSignature = request.headers["x-twilio-signature"] as string | undefined;
        if (twilioSignature) {
          const fullUrl = `${env.API_BASE_URL}/api/v1/webhooks/telephony/incoming`;
          const isValid = verifyTwilioSignature(fullUrl, request.body as unknown as Record<string, string>, twilioSignature);
          if (!isValid) {
            log.warn("Invalid Twilio signature");
            return reply.code(403).send({ error: "Invalid signature" });
          }
        }

        const org = await orgService.getOrganisationByPhone(To);
        if (!org) {
          log.warn({ to: To }, "No organisation found for called number");
          await markWebhookFailed("twilio", CallSid, "No org found");
          reply.header("Content-Type", "text/xml");
          return reply.send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, this number is not currently active.</Say><Hangup/></Response>`,
          );
        }

        const withinHours = isBusinessHours(org);
        const flowType = await determineFlowType(org, From, withinHours);
        const _script = await scriptsService.getActiveScript(org.id as string, flowType);

        const call = await callsService.createCall({
          organisation_id: org.id as string,
          external_call_id: CallSid,
          direction: "inbound",
          caller_number: From,
          called_number: To,
          caller_name: CallerName,
          flow_type: flowType,
        });

        log.info({ callId: call.id, orgId: org.id, flowType, withinHours }, "Incoming call processed");

        if (org.elevenlabs_agent_id) {
          reply.header("Content-Type", "text/xml");
          return reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.hostname}/api/v1/webhooks/telephony/stream">
      <Parameter name="callId" value="${call.id}"/>
      <Parameter name="orgId" value="${org.id}"/>
      <Parameter name="agentId" value="${org.elevenlabs_agent_id}"/>
      <Parameter name="flowType" value="${flowType}"/>
    </Stream>
  </Connect>
</Response>`);
        }

        reply.header("Content-Type", "text/xml");
        return reply.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello, you've reached ${org.name}. We're unable to take your call right now. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`);
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

  // POST /webhooks/telephony/conference-status - Twilio Conference events
  fastify.post("/conference-status", async (request, reply) => {
    const payload = request.body as Record<string, string>;
    const conferenceName = payload.FriendlyName;
    const event = payload.StatusCallbackEvent;
    const callSid = payload.CallSid;
    const log = logger.child({ conference: conferenceName, event, callSid });

    const session = conferenceName
      ? findSessionByConferenceRoom(conferenceName)
      : undefined;

    if (!session?.warmTransfer) {
      log.debug("No active warm transfer session for conference event");
      return reply.send({ status: "ignored" });
    }

    if (event === "participant-join" && callSid === session.warmTransfer.builderCallSid) {
      log.info("Builder joined conference");
      session.warmTransfer.builderJoined = true;
      session.warmTransfer.status = "builder_joined";
      if (session.warmTransfer.builderTimeoutId) {
        clearTimeout(session.warmTransfer.builderTimeoutId);
        session.warmTransfer.builderTimeoutId = null;
      }
      await callsService.updateCall(session.callId, {
        warm_transfer_status: "builder_joined",
      });
    }

    if (event === "conference-end") {
      log.info("Conference ended");
      session.warmTransfer.status = "completed";
      await callsService.updateCall(session.callId, {
        warm_transfer_status: "completed",
        status: "completed",
        ended_at: new Date().toISOString(),
      });
      finalCleanup(session.callId);
    }

    return reply.send({ status: "received" });
  });

  // POST /webhooks/telephony/builder-call-status - Builder outbound call status
  fastify.post("/builder-call-status", async (request, reply) => {
    const payload = request.body as Record<string, string>;
    const builderCallSid = payload.CallSid;
    const callStatus = payload.CallStatus;
    const log = logger.child({ builderCallSid, status: callStatus });

    const session = builderCallSid
      ? findSessionByBuilderCallSid(builderCallSid)
      : undefined;

    if (!session?.warmTransfer) {
      log.debug("No active warm transfer session for builder call status");
      return reply.send({ status: "ignored" });
    }

    if (
      callStatus === "no-answer" ||
      callStatus === "busy" ||
      callStatus === "failed"
    ) {
      log.warn({ callStatus }, "Builder did not answer transfer call");
      if (session.warmTransfer.builderTimeoutId) {
        clearTimeout(session.warmTransfer.builderTimeoutId);
        session.warmTransfer.builderTimeoutId = null;
      }

      const org = await orgService.getOrganisation(session.organisationId);
      await handleBuilderNoAnswer({
        callId: session.callId,
        callSid: session.callSid,
        organisationId: session.organisationId,
        orgPhoneNumber: (org as Record<string, unknown>)?.phone_number as string ?? "",
        builderPhone: session.warmTransfer.builderPhone,
        builderName: (org as Record<string, unknown>)?.builder_name as string ?? "the builder",
        callerName: session.warmTransfer.callerName,
        callerNumber: session.warmTransfer.callerNumber,
        reason: session.warmTransfer.reason,
        conferenceRoom: session.warmTransfer.conferenceRoom,
      });
    }

    return reply.send({ status: "received" });
  });

  // POST /webhooks/telephony/whatsapp-status - WhatsApp message status
  fastify.post("/whatsapp-status", async (request, reply) => {
    const signature = (request.headers["x-twilio-signature"] as string) ?? "";
    const fullUrl = `${env.API_BASE_URL}${request.url}`;
    const payload = request.body as Record<string, string>;

    if (!verifyTwilioSignature(fullUrl, payload, signature)) {
      logger.warn("WhatsApp status webhook signature verification failed");
      return reply.status(403).send({ error: "Invalid signature" });
    }

    const messageSid = payload.MessageSid;
    const messageStatus = payload.MessageStatus;
    if (messageSid && messageStatus) {
      logger.info({ messageSid, status: messageStatus }, "WhatsApp status update");
      await whatsappService.updateMessageStatus(messageSid, messageStatus, payload.ErrorMessage);
    }

    return reply.send({ status: "received" });
  });
};

export default telephonyRoutes;
