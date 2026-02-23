import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";

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

const elevenlabsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /webhooks/elevenlabs/post-call
  fastify.post("/post-call", async (request, reply) => {
    request.log.info("ElevenLabs post-call webhook received");
    return reply.send({ status: "received" });
  });

  // Tool: lookup_caller
  fastify.post<{ Body: Static<typeof LookupCallerBody> }>("/tools/lookup_caller", {
    schema: { body: LookupCallerBody },
    handler: async (request, reply) => {
      request.log.info(
        { agentId: request.body.agent_id, phone: request.body.parameters.phone_number },
        "Tool: lookup_caller",
      );
      return reply.send({ found: false, type: "new_inquiry" });
    },
  });

  // Tool: create_new_contact
  fastify.post<{ Body: Static<typeof CreateContactBody> }>("/tools/create_new_contact", {
    schema: { body: CreateContactBody },
    handler: async (request, reply) => {
      request.log.info(
        { agentId: request.body.agent_id, name: request.body.parameters.name },
        "Tool: create_new_contact",
      );
      return reply.send({ success: true, contact_id: null });
    },
  });

  // Tool: check_calendar
  fastify.post<{ Body: Static<typeof CheckCalendarBody> }>("/tools/check_calendar", {
    schema: { body: CheckCalendarBody },
    handler: async (_request, reply) => {
      return reply.send({ available_slots: [] });
    },
  });

  // Tool: book_appointment
  fastify.post<{ Body: Static<typeof BookAppointmentBody> }>("/tools/book_appointment", {
    schema: { body: BookAppointmentBody },
    handler: async (_request, reply) => {
      return reply.send({ success: true, booking_id: null });
    },
  });

  // Tool: send_sms
  fastify.post<{ Body: Static<typeof SendSmsBody> }>("/tools/send_sms", {
    schema: { body: SendSmsBody },
    handler: async (_request, reply) => {
      return reply.send({ success: true });
    },
  });

  // Tool: escalate_to_builder
  fastify.post<{ Body: Static<typeof EscalateBody> }>("/tools/escalate_to_builder", {
    schema: { body: EscalateBody },
    handler: async (request, reply) => {
      request.log.warn(
        { agentId: request.body.agent_id, reason: request.body.parameters.reason },
        "Tool: escalate_to_builder",
      );
      return reply.send({ success: true, escalated: true });
    },
  });

  // Tool: get_knowledge
  fastify.post<{ Body: Static<typeof GetKnowledgeBody> }>("/tools/get_knowledge", {
    schema: { body: GetKnowledgeBody },
    handler: async (_request, reply) => {
      return reply.send({ results: [] });
    },
  });

  // Tool: log_message
  fastify.post<{ Body: Static<typeof LogMessageBody> }>("/tools/log_message", {
    schema: { body: LogMessageBody },
    handler: async (_request, reply) => {
      return reply.send({ success: true });
    },
  });
};

export default elevenlabsRoutes;
