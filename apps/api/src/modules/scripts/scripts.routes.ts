import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as scriptsService from "./scripts.service.js";
import { getQueue } from "../../lib/queue.js";
import { QUEUE_NAMES } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const UpdateScriptBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  system_prompt: Type.Optional(Type.String({ minLength: 1 })),
  first_message: Type.Optional(Type.String()),
  is_active: Type.Optional(Type.Boolean()),
});

const scriptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /scripts - List conversation scripts
  fastify.get("/", async (request, reply) => {
    const scripts = await scriptsService.listScripts(request.organisationId!);
    return reply.send({ data: scripts });
  });

  // GET /scripts/:id - Get a single script
  fastify.get<{ Params: Static<typeof IdParams> }>("/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const script = await scriptsService.getScript(
        request.organisationId!,
        request.params.id,
      );
      return reply.send({ data: script });
    },
  });

  // PUT /scripts/:id - Update a script
  fastify.put<{ Params: Static<typeof IdParams>; Body: Static<typeof UpdateScriptBody> }>("/:id", {
    schema: { params: IdParams, body: UpdateScriptBody },
    handler: async (request, reply) => {
      const script = await scriptsService.updateScript(
        request.organisationId!,
        request.params.id,
        request.body,
      );
      // Queue agent sync to update ElevenLabs agent prompt
      try {
        const queue = getQueue(QUEUE_NAMES.AGENT_SYNC);
        await queue.add(
          "sync",
          { organisationId: request.organisationId!, trigger: "script_updated" },
          {
            jobId: `agent-sync-${request.organisationId!}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            delay: 2000,
          },
        );
      } catch (err) {
        logger.warn({ err }, "Failed to queue agent sync");
      }
      return reply.send({ data: script });
    },
  });
};

export default scriptRoutes;
