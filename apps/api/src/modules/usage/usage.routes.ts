import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as usageService from "./usage.service.js";

const MonthsQuery = Type.Object({
  months: Type.Optional(Type.Integer({ minimum: 1, maximum: 24, default: 6 })),
});

const usageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /usage - Current month usage
  fastify.get("/", async (request, reply) => {
    const usage = await usageService.getOrCreateUsageRecord(request.organisationId!);
    return reply.send({ data: usage });
  });

  // GET /usage/history - Usage history
  fastify.get<{ Querystring: Static<typeof MonthsQuery> }>("/history", {
    schema: { querystring: MonthsQuery },
    handler: async (request, reply) => {
      const history = await usageService.getUsageHistory(
        request.organisationId!,
        request.query.months ?? 6,
      );
      return reply.send({ data: history });
    },
  });
};

export default usageRoutes;
