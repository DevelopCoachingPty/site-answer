import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as analyticsService from "./analytics.service.js";

const DateRangeQuery = Type.Object({
  from: Type.String({ format: "date" }),
  to: Type.String({ format: "date" }),
});

const ExportQuery = Type.Object({
  from: Type.String({ format: "date" }),
  to: Type.String({ format: "date" }),
  format: Type.Optional(Type.Union([Type.Literal("csv"), Type.Literal("json")])),
});

const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /analytics/daily - Daily call stats
  fastify.get<{ Querystring: Static<typeof DateRangeQuery> }>("/daily", {
    schema: { querystring: DateRangeQuery },
    handler: async (request, reply) => {
      const data = await analyticsService.getDailyCallStats(
        request.organisationId!,
        request.query.from,
        request.query.to,
      );
      return reply.send({ data });
    },
  });

  // GET /analytics/flow-breakdown - Pie chart data
  fastify.get<{ Querystring: Static<typeof DateRangeQuery> }>("/flow-breakdown", {
    schema: { querystring: DateRangeQuery },
    handler: async (request, reply) => {
      const data = await analyticsService.getFlowTypeBreakdown(
        request.organisationId!,
        request.query.from,
        request.query.to,
      );
      return reply.send({ data });
    },
  });

  // GET /analytics/sentiment - Weekly sentiment trend
  fastify.get<{ Querystring: Static<typeof DateRangeQuery> }>("/sentiment", {
    schema: { querystring: DateRangeQuery },
    handler: async (request, reply) => {
      const data = await analyticsService.getSentimentTrend(
        request.organisationId!,
        request.query.from,
        request.query.to,
      );
      return reply.send({ data });
    },
  });

  // GET /analytics/comparison - Current vs previous period
  fastify.get<{ Querystring: Static<typeof DateRangeQuery> }>("/comparison", {
    schema: { querystring: DateRangeQuery },
    handler: async (request, reply) => {
      const data = await analyticsService.getComparisonStats(
        request.organisationId!,
        request.query.from,
        request.query.to,
      );
      return reply.send(data);
    },
  });

  // GET /analytics/export - CSV/JSON download
  fastify.get<{ Querystring: Static<typeof ExportQuery> }>("/export", {
    schema: { querystring: ExportQuery },
    handler: async (request, reply) => {
      const format = request.query.format ?? "csv";
      const data = await analyticsService.exportAnalytics(
        request.organisationId!,
        request.query.from,
        request.query.to,
        format,
      );

      const contentType = format === "csv" ? "text/csv" : "application/json";
      const filename = `analytics-${request.query.from}-${request.query.to}.${format}`;

      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(data);
    },
  });
};

export default analyticsRoutes;
