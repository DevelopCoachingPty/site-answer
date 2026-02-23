import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as orgService from "./org.service.js";

const UpdateOrgBody = Type.Object({
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
});

const orgRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /organisations - Get current user's organisation
  fastify.get("/", {
    preHandler: [fastify.requireOrganisation],
    handler: async (request, reply) => {
      const org = await orgService.getOrganisation(request.organisationId!);
      return reply.send({ data: org });
    },
  });

  // PATCH /organisations - Update current user's organisation
  fastify.patch<{ Body: Static<typeof UpdateOrgBody> }>("/", {
    preHandler: [fastify.requireOrganisation],
    schema: { body: UpdateOrgBody },
    handler: async (request, reply) => {
      const org = await orgService.updateOrganisation(
        request.organisationId!,
        request.body,
      );
      return reply.send({ data: org });
    },
  });

  // POST /organisations/test-call - Trigger a test call
  fastify.post<{ Body: { phone_number: string } }>("/test-call", {
    preHandler: [fastify.requireOrganisation],
    schema: {
      body: Type.Object({ phone_number: Type.String({ minLength: 1 }) }),
    },
    handler: async (request, reply) => {
      // TODO: Trigger actual test call via ElevenLabs/Twilio
      request.log.info(
        { orgId: request.organisationId, phone: request.body.phone_number },
        "Test call requested",
      );
      return reply.send({ message: "Test call initiated" });
    },
  });
};

export default orgRoutes;
