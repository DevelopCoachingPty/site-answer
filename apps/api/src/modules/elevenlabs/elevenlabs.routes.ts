import { createHmac } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import * as orgService from "../organisations/org.service.js";
import * as kbService from "../knowledge-base/kb.service.js";
import * as ghlClient from "../ghl/ghl.client.js";
import * as chaseService from "../payment-chase/chase.service.js";
import * as calendarService from "../calendar/calendar.service.js";
import * as whatsappService from "../whatsapp/whatsapp.service.js";
import * as screeningService from "../screening/screening.service.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { processPostCall } from "../../services/post-call.service.js";
import { processGhlSync } from "../../services/ghl-sync.service.js";
import * as callsService from "../calls/calls.service.js";

// Tool call base schema
const ToolCallBase = Type.Object({
  conversation_id: Type.String(),
  agent_id: Type.String(),
});

const LookupCallerBody = Type.Intersect([
  ToolCallBase,
  Type.Object({ parameters: Type.Object({ phone_number: Type.String() }) }),
]);

const CreateContactBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      name: Type.String(),
      phone: Type.String(),
      email: Type.Optional(Type.String()),
      address: Type.Optional(Type.String()),
      inquiry_type: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
  }),
]);

const CheckCalendarBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      date_range: Type.Optional(Type.String()),
      duration: Type.Optional(Type.Integer()),
    }),
  }),
]);

const BookAppointmentBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      contact_id: Type.Optional(Type.String()),
      datetime: Type.String(),
      type: Type.String(),
      notes: Type.Optional(Type.String()),
    }),
  }),
]);

const SendSmsBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      phone_number: Type.String(),
      message: Type.String(),
    }),
  }),
]);

const EscalateBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      reason: Type.String(),
      caller_name: Type.Optional(Type.String()),
      caller_number: Type.String(),
      urgency_level: Type.Optional(Type.String()),
    }),
  }),
]);

const GetKnowledgeBody = Type.Intersect([
  ToolCallBase,
  Type.Object({ parameters: Type.Object({ query: Type.String() }) }),
]);

const LogMessageBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      caller_name: Type.String(),
      phone: Type.String(),
      message: Type.String(),
      callback_requested: Type.Optional(Type.Boolean()),
    }),
  }),
]);

const SendWhatsAppBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      phone_number: Type.String(),
      template_type: Type.String(),
      contact_name: Type.Optional(Type.String()),
      datetime: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
  }),
]);

const RecordPaymentOutcomeBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      chase_item_id: Type.String(),
      outcome: Type.String(), // paid, promised, disputed
      promise_date: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
  }),
]);

const TagCallOutcomeBody = Type.Intersect([
  ToolCallBase,
  Type.Object({
    parameters: Type.Object({
      outcome: Type.String(), // transferred, handled, callback_booked, message_taken, sales_blocked, recruiter_blocked, vip_transferred
      contact_id: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
  }),
]);

// Helper to resolve org from agent_id — validates the org exists and is active.
// These endpoints are called by ElevenLabs (not users), so agent_id is the auth.
async function getOrgFromAgent(agentId: string) {
  const org = await orgService.getOrganisationByAgentId(agentId);
  if (org && !org.is_active) {
    logger.warn({ agentId, orgId: org.id }, "Tool call rejected: organisation is inactive");
    return null;
  }
  return org;
}

const elevenlabsRoutes: FastifyPluginAsync = async (fastify) => {
  // Stricter rate limit for webhook/tool endpoints (30 req/min per IP)
  await fastify.register(import("@fastify/rate-limit"), {
    max: 30,
    timeWindow: "1 minute",
  });
  // POST /webhooks/elevenlabs/post-call
  fastify.post("/post-call", async (request, reply) => {
    // Verify ElevenLabs webhook signature if secret is configured
    if (env.ELEVENLABS_WEBHOOK_SECRET) {
      const signature = request.headers["elevenlabs-signature"] as string | undefined;
      if (!signature) {
        logger.warn("ElevenLabs post-call webhook missing signature header");
        return reply.code(401).send({ error: "Missing signature" });
      }

      const rawBody = JSON.stringify(request.body);
      const expected = createHmac("sha256", env.ELEVENLABS_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      // ElevenLabs signature format: "v0=<hex>"
      const sigValue = signature.startsWith("v0=") ? signature.slice(3) : signature;
      if (sigValue !== expected) {
        logger.warn("ElevenLabs post-call webhook signature mismatch");
        return reply.code(401).send({ error: "Invalid signature" });
      }
    }

    const payload = request.body as Record<string, unknown>;
    logger.info({ conversationId: payload.conversation_id }, "ElevenLabs post-call webhook received");

    // Process post-call inline
    try {
      await processPostCall(payload as unknown as Parameters<typeof processPostCall>[0]);
    } catch (err) {
      logger.error({ err }, "Post-call processing failed");
    }

    return reply.send({ status: "received" });
  });

  // Tool: lookup_caller (enriched with screening data)
  fastify.post<{ Body: Static<typeof LookupCallerBody> }>("/tools/lookup_caller", {
    schema: { body: LookupCallerBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, phone: parameters.phone_number }, "Tool: lookup_caller");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ found: false, type: "new_inquiry", screening: { is_vip: false, is_blocked: false, classification: "unknown", recommendation: "take_message" } });
      }

      let contact: Record<string, unknown> | null = null;

      try {
        if (org.ghl_location_id && org.ghl_access_token_encrypted) {
          contact = await ghlClient.lookupContact(org.id, org.ghl_location_id, parameters.phone_number);
        }
      } catch (err) {
        logger.warn({ err, orgId: org.id }, "GHL lookup failed, treating as new");
      }

      // Run screening classification
      const screening = await screeningService.classifyCaller(
        org.id,
        contact as { id?: string; name?: string; firstName?: string; tags?: string[] } | null,
        parameters.phone_number,
      );

      if (contact) {
        return reply.send({
          found: true,
          contact_id: contact.id,
          name: contact.name ?? contact.firstName,
          type: screening.classification === "vip" ? "vip" : "existing_client",
          tags: contact.tags,
          screening: {
            is_vip: screening.is_vip,
            is_blocked: screening.is_blocked,
            classification: screening.classification,
            recommendation: screening.recommendation,
            vip_note: screening.vip_note,
            blocked_reason: screening.blocked_reason,
          },
        });
      }

      return reply.send({
        found: false,
        type: "new_inquiry",
        screening: {
          is_vip: screening.is_vip,
          is_blocked: screening.is_blocked,
          classification: screening.classification,
          recommendation: screening.recommendation,
          blocked_reason: screening.blocked_reason,
        },
      });
    },
  });

  // Tool: create_new_contact
  fastify.post<{ Body: Static<typeof CreateContactBody> }>("/tools/create_new_contact", {
    schema: { body: CreateContactBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, name: parameters.name }, "Tool: create_new_contact");

      const org = await getOrgFromAgent(agent_id);
      if (!org?.ghl_location_id || !org.ghl_access_token_encrypted) {
        return reply.send({ success: false, reason: "CRM not connected" });
      }

      try {
        const contact = await ghlClient.createContact(org.id, org.ghl_location_id, {
          name: parameters.name,
          phone: parameters.phone,
          email: parameters.email,
          address1: parameters.address,
          tags: parameters.inquiry_type ? [`inquiry-${parameters.inquiry_type}`] : [],
        });

        if (parameters.notes && contact?.id) {
          await ghlClient.addContactNote(org.id, contact.id as string, parameters.notes);
        }

        return reply.send({ success: true, contact_id: contact?.id ?? null });
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Failed to create contact");
        return reply.send({ success: false, reason: "CRM error" });
      }
    },
  });

  // Tool: check_calendar
  fastify.post<{ Body: Static<typeof CheckCalendarBody> }>("/tools/check_calendar", {
    schema: { body: CheckCalendarBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id }, "Tool: check_calendar");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ available_slots: [], message: "Organisation not found" });
      }

      try {
        // Parse date range into start/end (default: next 7 days)
        const now = new Date();
        const start = now.toISOString();
        const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const slots = await calendarService.getAvailableSlots(
          org.id,
          start,
          end,
          parameters.duration ?? 60,
        );

        return reply.send({
          available_slots: slots.slice(0, 10).map((s) => ({
            start: s.start,
            end: s.end,
            display: new Date(s.start).toLocaleString("en-AU", {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          })),
          message: slots.length > 0
            ? `Found ${slots.length} available slots in the next week.`
            : "No available slots found. Please offer to have the builder call back to arrange a time.",
        });
      } catch (err) {
        logger.warn({ err, orgId: org.id }, "Calendar check failed");
        return reply.send({
          available_slots: [],
          message: "Calendar not available. Please offer to have the builder call back to arrange a time.",
        });
      }
    },
  });

  // Tool: book_appointment
  fastify.post<{ Body: Static<typeof BookAppointmentBody> }>("/tools/book_appointment", {
    schema: { body: BookAppointmentBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, datetime: parameters.datetime }, "Tool: book_appointment");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false, message: "Organisation not found" });
      }

      try {
        // Calculate end time (default 1 hour appointments)
        const startTime = new Date(parameters.datetime);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

        const appointment = await calendarService.bookAppointment(org.id, {
          contactName: parameters.contact_id ?? "Caller",
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          title: `${parameters.type} appointment`,
          notes: parameters.notes,
        });

        return reply.send({
          success: true,
          appointment_id: appointment.id,
          message: `Appointment booked for ${startTime.toLocaleString("en-AU", {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`,
        });
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Booking failed");
        return reply.send({
          success: false,
          message: "Could not book the appointment. Please take their details and the builder will call back to arrange.",
        });
      }
    },
  });

  // Tool: send_sms
  fastify.post<{ Body: Static<typeof SendSmsBody> }>("/tools/send_sms", {
    schema: { body: SendSmsBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id }, "Tool: send_sms");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false, reason: "Organisation not found" });
      }

      // Send via GHL if CRM is connected
      if (org.ghl_location_id && org.ghl_access_token_encrypted) {
        try {
          // Look up contact by phone number to get contactId
          const contact = await ghlClient.lookupContact(org.id, org.ghl_location_id, parameters.phone_number);
          if (contact?.id) {
            await ghlClient.sendSms(org.id, contact.id as string, parameters.message);
            logger.info({ orgId: org.id, contactId: contact.id }, "SMS sent via GHL");
            return reply.send({ success: true, message: "SMS sent" });
          }
          logger.info({ orgId: org.id, phone: parameters.phone_number }, "SMS: contact not found in CRM, noted only");
          return reply.send({ success: true, message: "SMS noted but contact not found in CRM" });
        } catch (err) {
          logger.warn({ err, orgId: org.id }, "SMS via GHL failed, logging only");
        }
      }

      logger.info(
        { orgId: org.id, phone: parameters.phone_number, message: parameters.message },
        "SMS noted (CRM not connected)",
      );
      return reply.send({ success: true, message: "SMS noted but CRM not connected" });
    },
  });

  // Tool: escalate_to_builder
  fastify.post<{ Body: Static<typeof EscalateBody> }>("/tools/escalate_to_builder", {
    schema: { body: EscalateBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.warn({ agentId: agent_id, reason: parameters.reason }, "Tool: escalate_to_builder");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false });
      }

      // Create in-app notification for the builder
      await supabaseAdmin.from("notifications").insert({
        organisation_id: org.id,
        type: "escalation",
        title: `Urgent: ${parameters.urgency_level ?? "normal"} escalation`,
        message: `${parameters.caller_name ?? "Caller"} (${parameters.caller_number}): ${parameters.reason}`,
      });

      logger.info(
        { orgId: org.id, reason: parameters.reason, urgency: parameters.urgency_level },
        "Escalation notification created",
      );

      return reply.send({ success: true, escalated: true });
    },
  });

  // Tool: get_knowledge
  fastify.post<{ Body: Static<typeof GetKnowledgeBody> }>("/tools/get_knowledge", {
    schema: { body: GetKnowledgeBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ results: [] });
      }

      const entries = await kbService.getActiveKnowledgeBase(org.id);
      const query = parameters.query.toLowerCase();

      // Simple keyword search across KB entries
      const matches = entries.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.content.toLowerCase().includes(query) ||
          e.category.toLowerCase().includes(query),
      );

      return reply.send({
        results: matches.slice(0, 5).map((e) => ({
          category: e.category,
          title: e.title,
          content: e.content,
        })),
      });
    },
  });

  // Tool: log_message
  fastify.post<{ Body: Static<typeof LogMessageBody> }>("/tools/log_message", {
    schema: { body: LogMessageBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false });
      }

      // Create notification for the builder
      await supabaseAdmin.from("notifications").insert({
        organisation_id: org.id,
        type: "message",
        title: `Message from ${parameters.caller_name}`,
        message: `${parameters.message}\nPhone: ${parameters.phone}${parameters.callback_requested ? "\nCallback requested" : ""}`,
      });

      return reply.send({ success: true });
    },
  });

  // Tool: send_whatsapp
  fastify.post<{ Body: Static<typeof SendWhatsAppBody> }>("/tools/send_whatsapp", {
    schema: { body: SendWhatsAppBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, templateType: parameters.template_type }, "Tool: send_whatsapp");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false, reason: "Organisation not found" });
      }

      try {
        const { data: orgDetails } = await supabaseAdmin
          .from("organisations")
          .select("name")
          .eq("id", org.id)
          .single();

        const result = await whatsappService.sendTemplateMessage(
          org.id,
          parameters.phone_number,
          parameters.template_type,
          {
            contact_name: parameters.contact_name ?? "there",
            company_name: orgDetails?.name ?? "our team",
            datetime: parameters.datetime ?? "",
            notes: parameters.notes ?? "",
          },
        );

        return reply.send({ success: !!result, message_id: result?.id ?? null });
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Failed to send WhatsApp");
        return reply.send({ success: false, reason: "Failed to send message" });
      }
    },
  });

  // Tool: record_payment_outcome (used by outbound chase calls)
  fastify.post<{ Body: Static<typeof RecordPaymentOutcomeBody> }>("/tools/record_payment_outcome", {
    schema: { body: RecordPaymentOutcomeBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, outcome: parameters.outcome }, "Tool: record_payment_outcome");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false, reason: "Organisation not found" });
      }

      try {
        const updates: Record<string, unknown> = {
          status: parameters.outcome,
          notes: parameters.notes,
        };

        if (parameters.outcome === "promised" && parameters.promise_date) {
          updates.promise_date = parameters.promise_date;
        }

        await chaseService.updateChaseItem(
          org.id,
          parameters.chase_item_id,
          updates,
        );

        return reply.send({ success: true, outcome: parameters.outcome });
      } catch (err) {
        logger.error({ err, chaseItemId: parameters.chase_item_id }, "Failed to record payment outcome");
        return reply.send({ success: false, reason: "Failed to update chase item" });
      }
    },
  });

  // Tool: tag_call_outcome (screening outcome tagging)
  fastify.post<{ Body: Static<typeof TagCallOutcomeBody> }>("/tools/tag_call_outcome", {
    schema: { body: TagCallOutcomeBody },
    handler: async (request, reply) => {
      const { agent_id, conversation_id, parameters } = request.body;
      logger.info({ agentId: agent_id, outcome: parameters.outcome }, "Tool: tag_call_outcome");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ success: false, reason: "Organisation not found" });
      }

      const validOutcomes = [
        "transferred", "handled", "callback_booked", "message_taken",
        "sales_blocked", "recruiter_blocked", "vip_transferred",
      ];

      if (!validOutcomes.includes(parameters.outcome)) {
        return reply.send({ success: false, reason: `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}` });
      }

      // Map outcome to GHL tag
      const GHL_TAG_MAP: Record<string, string> = {
        transferred: "siteanswer-transferred",
        handled: "siteanswer-handled",
        callback_booked: "siteanswer-callback-booked",
        message_taken: "siteanswer-message-taken",
        sales_blocked: "siteanswer-sales-blocked",
        recruiter_blocked: "siteanswer-recruiter-blocked",
        vip_transferred: "siteanswer-vip",
      };

      try {
        // Find the call record by conversation_id
        const { data: callRecord } = await supabaseAdmin
          .from("calls")
          .select("id")
          .eq("external_call_id", conversation_id)
          .single();
        const callId = callRecord?.id;

        if (callId) {
          // Update call record with screening outcome
          await callsService.updateCall(callId, {
            screening_outcome: parameters.outcome,
          });

          // Log the action
          await callsService.createCallAction({
            call_id: callId,
            organisation_id: org.id,
            action_type: "tag_call_outcome",
            payload: {
              outcome: parameters.outcome,
              contact_id: parameters.contact_id,
              notes: parameters.notes,
              ghl_tag: GHL_TAG_MAP[parameters.outcome],
            },
          });
        }

        // Sync GHL tag directly if contact_id is provided
        if (parameters.contact_id && org.ghl_access_token_encrypted) {
          try {
            await processGhlSync({
              organisationId: org.id,
              callId: callId ?? "",
              actions: [{
                type: "tag_contact",
                data: {
                  contact_id: parameters.contact_id,
                  tag: GHL_TAG_MAP[parameters.outcome] ?? `siteanswer-${parameters.outcome}`,
                  notes: parameters.notes,
                },
              }],
            });
          } catch (err) {
            logger.warn({ err, orgId: org.id }, "GHL tag sync failed (non-critical)");
          }
        }

        return reply.send({
          success: true,
          outcome: parameters.outcome,
          tag_applied: GHL_TAG_MAP[parameters.outcome],
        });
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Failed to tag call outcome");
        return reply.send({ success: false, reason: "Failed to tag outcome" });
      }
    },
  });
};

export default elevenlabsRoutes;
