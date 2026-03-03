import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as kbService from "./kb.service.js";
import { syncAgent } from "../../services/agent-sync.service.js";
import { logger } from "../../lib/logger.js";

const CreateKbBody = Type.Object({
  category: Type.String(),
  title: Type.String({ minLength: 1 }),
  content: Type.String({ minLength: 1 }),
  sort_order: Type.Optional(Type.Integer({ default: 0 })),
});

const UpdateKbBody = Type.Object({
  category: Type.Optional(Type.String()),
  title: Type.Optional(Type.String({ minLength: 1 })),
  content: Type.Optional(Type.String({ minLength: 1 })),
  sort_order: Type.Optional(Type.Integer()),
  is_active: Type.Optional(Type.Boolean()),
});

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

async function triggerAgentSync(orgId: string) {
  try {
    await syncAgent(orgId, "knowledge_base_updated");
  } catch (err) {
    logger.warn({ err, orgId }, "Agent sync failed (non-critical)");
  }
}

const kbRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /knowledge-base
  fastify.get<{ Querystring: { category?: string } }>("/", {
    schema: {
      querystring: Type.Object({ category: Type.Optional(Type.String()) }),
    },
    handler: async (request, reply) => {
      const entries = await kbService.listKnowledgeBase(
        request.organisationId!,
        request.query.category,
      );
      return reply.send({ data: entries });
    },
  });

  // POST /knowledge-base
  fastify.post<{ Body: Static<typeof CreateKbBody> }>("/", {
    schema: { body: CreateKbBody },
    handler: async (request, reply) => {
      const entry = await kbService.createKnowledgeBaseEntry(
        request.organisationId!,
        request.body,
      );
      await triggerAgentSync(request.organisationId!);
      return reply.code(201).send({ data: entry });
    },
  });

  // PUT /knowledge-base/:id
  fastify.put<{ Params: Static<typeof IdParams>; Body: Static<typeof UpdateKbBody> }>("/:id", {
    schema: { params: IdParams, body: UpdateKbBody },
    handler: async (request, reply) => {
      const entry = await kbService.updateKnowledgeBaseEntry(
        request.organisationId!,
        request.params.id,
        request.body,
      );
      await triggerAgentSync(request.organisationId!);
      return reply.send({ data: entry });
    },
  });

  // DELETE /knowledge-base/:id
  fastify.delete<{ Params: Static<typeof IdParams> }>("/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      await kbService.deleteKnowledgeBaseEntry(
        request.organisationId!,
        request.params.id,
      );
      await triggerAgentSync(request.organisationId!);
      return reply.code(204).send();
    },
  });
};

export default kbRoutes;
