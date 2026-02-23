import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as orgService from "./org.service.js";
import { createTestCall } from "../elevenlabs/elevenlabs.client.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { env } from "../../config/env.js";

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
      const orgId = request.organisationId!;

      const { data: org } = await supabaseAdmin
        .from("organisations")
        .select("elevenlabs_agent_id, name, phone_number")
        .eq("id", orgId)
        .single();

      if (!org?.elevenlabs_agent_id) {
        return reply.code(400).send({
          error: "AGENT_NOT_PROVISIONED",
          message: "No AI agent provisioned. Please contact support.",
        });
      }

      const result = await createTestCall(org.elevenlabs_agent_id, {
        toNumber: request.body.phone_number,
        fromNumber: org.phone_number ?? env.TWILIO_PHONE_NUMBER ?? "",
        orgName: org.name,
      });

      request.log.info(
        { orgId, phone: request.body.phone_number, conversationId: result.conversation_id },
        "Test call initiated",
      );
      return reply.send({ message: "Test call initiated", conversation_id: result.conversation_id });
    },
  });
};

export default orgRoutes;
