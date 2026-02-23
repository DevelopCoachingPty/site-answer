import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import * as orgService from "../organisations/org.service.js";
import * as kbService from "../knowledge-base/kb.service.js";
import * as ghlClient from "../ghl/ghl.client.js";
import * as chaseService from "../payment-chase/chase.service.js";
import * as calendarService from "../calendar/calendar.service.js";
import * as whatsappService from "../whatsapp/whatsapp.service.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getQueue } from "../../lib/queue.js";
import { QUEUE_NAMES } from "../../config/constants.js";

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

// Helper to resolve org from agent_id
async function getOrgFromAgent(agentId: string) {
  return orgService.getOrganisationByAgentId(agentId);
}

const elevenlabsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /webhooks/elevenlabs/post-call
  fastify.post("/post-call", async (request, reply) => {
    const payload = request.body as Record<string, unknown>;
    logger.info({ conversationId: payload.conversation_id }, "ElevenLabs post-call webhook received");

    // Queue post-call processing
    try {
      const queue = getQueue(QUEUE_NAMES.POST_CALL);
      await queue.add("process-call", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
    } catch (err) {
      logger.error({ err }, "Failed to queue post-call processing");
    }

    return reply.send({ status: "received" });
  });

  // Tool: lookup_caller
  fastify.post<{ Body: Static<typeof LookupCallerBody> }>("/tools/lookup_caller", {
    schema: { body: LookupCallerBody },
    handler: async (request, reply) => {
      const { agent_id, parameters } = request.body;
      logger.info({ agentId: agent_id, phone: parameters.phone_number }, "Tool: lookup_caller");

      const org = await getOrgFromAgent(agent_id);
      if (!org) {
        return reply.send({ found: false, type: "new_inquiry" });
      }

      try {
        if (org.ghl_location_id && org.ghl_access_token_encrypted) {
          const contact = await ghlClient.lookupContact(org.id, org.ghl_location_id, parameters.phone_number);
          if (contact) {
            return reply.send({
              found: true,
              contact_id: contact.id,
              name: contact.name ?? contact.firstName,
              type: "existing_client",
              tags: contact.tags,
            });
          }
        }
      } catch (err) {
        logger.warn({ err, orgId: org.id }, "GHL lookup failed, treating as new");
      }

      return reply.send({ found: false, type: "new_inquiry" });
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

      // For now, log the SMS. Will be sent via GHL when contact lookup returns contactId
      logger.info(
        { orgId: org.id, phone: parameters.phone_number, message: parameters.message },
        "SMS requested (queued)",
      );

      return reply.send({ success: true });
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

      // Create notification
      await supabaseAdmin.from("notifications").insert({
        organisation_id: org.id,
        type: "escalation",
        title: `Urgent: ${parameters.urgency_level ?? "normal"} escalation`,
        message: `${parameters.caller_name ?? "Caller"} (${parameters.caller_number}): ${parameters.reason}`,
      });

      // If escalation SMS is enabled and escalation phone is set
      if (org.escalation_sms && org.escalation_phone) {
        logger.info(
          { orgId: org.id, phone: org.escalation_phone },
          "Escalation SMS to builder",
        );
        // TODO: Send via Twilio/GHL when telephony is wired
      }

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
};

export default elevenlabsRoutes;
