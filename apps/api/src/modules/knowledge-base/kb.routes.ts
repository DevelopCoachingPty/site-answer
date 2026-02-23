import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as kbService from "./kb.service.js";
import { getQueue } from "../../lib/queue.js";
import { QUEUE_NAMES } from "../../config/constants.js";
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

async function queueAgentSync(orgId: string) {
  try {
    const queue = getQueue(QUEUE_NAMES.AGENT_SYNC);
    await queue.add(
      "sync",
      { organisationId: orgId, trigger: "knowledge_base_updated" },
      {
        jobId: `agent-sync-${orgId}`, // Deduplicates rapid changes
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        delay: 2000, // Wait 2s for batch changes
      },
    );
  } catch (err) {
    logger.warn({ err, orgId }, "Failed to queue agent sync (Redis may be unavailable)");
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
      await queueAgentSync(request.organisationId!);
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
      await queueAgentSync(request.organisationId!);
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
      await queueAgentSync(request.organisationId!);
      return reply.code(204).send();
    },
  });
};

export default kbRoutes;
