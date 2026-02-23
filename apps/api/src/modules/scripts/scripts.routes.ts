import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as scriptsService from "./scripts.service.js";

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
      // TODO: Queue agent sync to update ElevenLabs agent prompt
      return reply.send({ data: script });
    },
  });
};

export default scriptRoutes;
