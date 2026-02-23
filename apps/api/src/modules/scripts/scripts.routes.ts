import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const scriptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /scripts - List conversation scripts
  fastify.get("/", async (request, reply) => {
    // TODO: List all scripts for the organisation
    return reply.send({ data: [] });
  });

  // PUT /scripts/:id - Update a script
  fastify.put("/:id", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        system_prompt: Type.Optional(Type.String({ minLength: 1 })),
        first_message: Type.Optional(Type.String()),
        is_active: Type.Optional(Type.Boolean()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Update script + trigger agent sync
      return reply.send({ data: null });
    },
  });
};

export default scriptRoutes;
