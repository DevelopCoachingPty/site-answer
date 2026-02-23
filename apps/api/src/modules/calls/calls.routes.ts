import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const callRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication + organisation membership
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /calls - List calls with pagination and filters
  fastify.get("/", {
    schema: {
      querystring: Type.Object({
        page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
        status: Type.Optional(Type.String()),
        flow_type: Type.Optional(Type.String()),
        date_from: Type.Optional(Type.String({ format: "date-time" })),
        date_to: Type.Optional(Type.String({ format: "date-time" })),
        search: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      // TODO: Implement call listing with filters
      return reply.send({ data: [], total: 0, page: 1, limit: 20, total_pages: 0 });
    },
  });

  // GET /calls/stats - Dashboard statistics
  fastify.get("/stats", async (request, reply) => {
    // TODO: Implement call statistics
    return reply.send({
      today: { total: 0, answered: 0, missed: 0, escalated: 0 },
      this_week: { leads_captured: 0, appointments_booked: 0 },
      average_duration_seconds: 0,
    });
  });

  // GET /calls/:id - Full call detail
  fastify.get("/:id", {
    schema: {
      params: Type.Object({ id: Type.String({ format: "uuid" }) }),
    },
    handler: async (request, reply) => {
      // TODO: Implement call detail with transcript and actions
      return reply.code(404).send({ error: "NOT_FOUND", message: "Call not found" });
    },
  });
};

export default callRoutes;
