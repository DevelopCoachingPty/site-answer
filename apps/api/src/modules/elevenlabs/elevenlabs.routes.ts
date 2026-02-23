import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import * as orgService from "../organisations/org.service.js";
import * as kbService from "../knowledge-base/kb.service.js";
import * as ghlClient from "../ghl/ghl.client.js";
import * as callsService from "../calls/calls.service.js";
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
    handler: async (_request, reply) => {
      // TODO: Wire to calendar API when calendar integration is built
      return reply.send({
        available_slots: [],
        message: "Calendar integration coming soon. Please offer to have the builder call back to arrange a time.",
      });
    },
  });

  // Tool: book_appointment
  fastify.post<{ Body: Static<typeof BookAppointmentBody> }>("/tools/book_appointment", {
    schema: { body: BookAppointmentBody },
    handler: async (_request, reply) => {
      // TODO: Wire to calendar API
      return reply.send({
        success: false,
        message: "Calendar booking coming soon. Please take their details and the builder will call back to arrange.",
      });
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
};

export default elevenlabsRoutes;
