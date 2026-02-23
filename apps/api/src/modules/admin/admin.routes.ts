import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require authentication + admin role
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireAdmin);

  // GET /admin/organisations - List all member organisations
  fastify.get("/organisations", {
    schema: {
      querystring: Type.Object({
        page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
        status: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: List all organisations with usage data
      return reply.send({ data: [], total: 0, page: 1, limit: 20, total_pages: 0 });
    },
  });

  // GET /admin/organisations/:id - Full org detail
  fastify.get("/organisations/:id", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
    },
    handler: async (request, reply) => {
      // TODO: Get full organisation detail with usage stats
      return reply.code(404).send({ error: "NOT_FOUND", message: "Organisation not found" });
    },
  });

  // POST /admin/organisations - Onboard new member
  fastify.post("/organisations", {
    schema: {
      body: Type.Object({
        name: Type.String({ minLength: 1 }),
        builder_name: Type.String({ minLength: 1 }),
        email: Type.String({ format: "email" }),
        phone_number: Type.Optional(Type.String()),
        ghl_location_id: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Create organisation + user + provision ElevenLabs agent
      return reply.code(201).send({ data: null });
    },
  });

  // PUT /admin/organisations/:id/status - Activate/deactivate
  fastify.put("/organisations/:id/status", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      body: Type.Object({
        is_active: Type.Boolean(),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Activate/deactivate organisation + ElevenLabs agent
      return reply.send({ data: null });
    },
  });

  // GET /admin/usage - Global usage dashboard
  fastify.get("/usage", async (request, reply) => {
    // TODO: Aggregate usage across all organisations
    return reply.send({
      total_minutes: 0,
      total_calls: 0,
      elevenlabs_cost: 0,
      estimated_revenue: 0,
      net_margin: 0,
    });
  });

  // GET /admin/usage/:org_id - Per-member usage
  fastify.get("/usage/:org_id", {
    schema: {
      params: Type.Object({ org_id: Type.String({ format: "uuid" }) }),
    },
    handler: async (request, reply) => {
      // TODO: Get per-member usage breakdown
      return reply.send({ data: null });
    },
  });

  // GET /admin/alerts - Cost alerts
  fastify.get("/alerts", async (request, reply) => {
    // TODO: Return active cost alerts
    return reply.send({ data: [] });
  });
};

export default adminRoutes;
