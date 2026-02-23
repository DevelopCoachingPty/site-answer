import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const orgRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /organisations - Get current user's organisation
  fastify.get("/", {
    preHandler: [fastify.requireOrganisation],
    handler: async (request, reply) => {
      // TODO: Fetch and return the user's organisation
      return reply.send({ data: null });
    },
  });

  // PATCH /organisations - Update current user's organisation
  fastify.patch("/", {
    preHandler: [fastify.requireOrganisation],
    schema: {
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        builder_name: Type.Optional(Type.String()),
        greeting_name: Type.Optional(Type.String()),
        phone_number: Type.Optional(Type.String()),
        timezone: Type.Optional(Type.String()),
        business_hours: Type.Optional(Type.Any()),
        after_hours_action: Type.Optional(Type.String()),
        escalation_phone: Type.Optional(Type.String()),
        escalation_sms: Type.Optional(Type.Boolean()),
        calendar_type: Type.Optional(Type.String()),
        monthly_minutes_limit: Type.Optional(Type.Integer({ minimum: 100 })),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Update organisation settings
      return reply.send({ data: null });
    },
  });

  // POST /organisations/test-call - Trigger a test call
  fastify.post("/test-call", {
    preHandler: [fastify.requireOrganisation],
    schema: {
      body: Type.Object({
        phone_number: Type.String({ minLength: 1 }),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Trigger test call to builder's phone
      return reply.send({ message: "Test call initiated" });
    },
  });
};

export default orgRoutes;
