import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as scriptsService from "./scripts.service.js";
import { syncAgent } from "../../services/agent-sync.service.js";
import { logger } from "../../lib/logger.js";

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const UpdateScriptBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  system_prompt: Type.Optional(Type.String({ minLength: 1 })),
  first_message: Type.Optional(Type.String()),
  is_active: Type.Optional(Type.Boolean()),
});

const CreateVersionBody = Type.Object({
  flow_type: Type.String(),
  name: Type.String({ minLength: 1 }),
  system_prompt: Type.String({ minLength: 1 }),
  first_message: Type.Optional(Type.String()),
  change_notes: Type.Optional(Type.String()),
});

const VersionHistoryQuery = Type.Object({
  flow_type: Type.String(),
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
      // Sync agent to update ElevenLabs agent prompt
      try {
        await syncAgent(request.organisationId!, "script_updated");
      } catch (err) {
        logger.warn({ err }, "Agent sync failed (non-critical)");
      }
      return reply.send({ data: script });
    },
  });

  // GET /scripts/versions?flow_type=... - Version history
  fastify.get<{ Querystring: Static<typeof VersionHistoryQuery> }>("/versions", {
    schema: { querystring: VersionHistoryQuery },
    handler: async (request, reply) => {
      const versions = await scriptsService.getScriptVersionHistory(
        request.organisationId!,
        request.query.flow_type,
      );
      return reply.send({ data: versions });
    },
  });

  // POST /scripts/new-version - Create draft version
  fastify.post<{ Body: Static<typeof CreateVersionBody> }>("/new-version", {
    schema: { body: CreateVersionBody },
    handler: async (request, reply) => {
      const script = await scriptsService.createScriptVersion(
        request.organisationId!,
        request.body,
      );
      return reply.code(201).send({ data: script });
    },
  });

  // POST /scripts/:id/publish - Publish a version
  fastify.post<{ Params: Static<typeof IdParams> }>("/:id/publish", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const script = await scriptsService.publishScript(
        request.organisationId!,
        request.params.id,
        request.userId!,
      );
      return reply.send({ data: script });
    },
  });

  // POST /scripts/:id/preview - Render full prompt preview
  fastify.post<{ Params: Static<typeof IdParams> }>("/:id/preview", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const preview = await scriptsService.previewScript(
        request.organisationId!,
        request.params.id,
      );
      return reply.send(preview);
    },
  });
};

export default scriptRoutes;
