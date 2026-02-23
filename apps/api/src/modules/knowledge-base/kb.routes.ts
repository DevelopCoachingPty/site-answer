import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const kbRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /knowledge-base - List all entries
  fastify.get("/", {
    schema: {
      querystring: Type.Object({
        category: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Implement KB listing
      return reply.send({ data: [] });
    },
  });

  // POST /knowledge-base - Create entry
  fastify.post("/", {
    schema: {
      body: Type.Object({
        category: Type.String(),
        title: Type.String({ minLength: 1 }),
        content: Type.String({ minLength: 1 }),
        sort_order: Type.Optional(Type.Integer({ default: 0 })),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Implement KB creation + trigger agent sync
      return reply.code(201).send({ data: null });
    },
  });

  // PUT /knowledge-base/:id - Update entry
  fastify.put("/:id", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      body: Type.Object({
        category: Type.Optional(Type.String()),
        title: Type.Optional(Type.String({ minLength: 1 })),
        content: Type.Optional(Type.String({ minLength: 1 })),
        sort_order: Type.Optional(Type.Integer()),
        is_active: Type.Optional(Type.Boolean()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Implement KB update + trigger agent sync
      return reply.send({ data: null });
    },
  });

  // DELETE /knowledge-base/:id - Delete entry
  fastify.delete("/:id", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
    },
    handler: async (request, reply) => {
      // TODO: Implement KB deletion + trigger agent sync
      return reply.code(204).send();
    },
  });
};

export default kbRoutes;
