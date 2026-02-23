import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as callsService from "./calls.service.js";

const CallQuerystring = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  flow_type: Type.Optional(Type.String()),
  date_from: Type.Optional(Type.String({ format: "date-time" })),
  date_to: Type.Optional(Type.String({ format: "date-time" })),
  search: Type.Optional(Type.String()),
});

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const callRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /calls - List calls with pagination and filters
  fastify.get<{ Querystring: Static<typeof CallQuerystring> }>("/", {
    schema: { querystring: CallQuerystring },
    handler: async (request, reply) => {
      const result = await callsService.listCalls(
        request.organisationId!,
        {
          page: request.query.page ?? 1,
          limit: request.query.limit ?? 20,
          status: request.query.status,
          flow_type: request.query.flow_type,
          date_from: request.query.date_from,
          date_to: request.query.date_to,
          search: request.query.search,
        },
      );
      return reply.send(result);
    },
  });

  // GET /calls/stats - Dashboard statistics
  fastify.get("/stats", async (request, reply) => {
    const stats = await callsService.getCallStats(request.organisationId!);
    return reply.send(stats);
  });

  // GET /calls/:id - Full call detail
  fastify.get<{ Params: Static<typeof IdParams> }>("/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const call = await callsService.getCall(
        request.organisationId!,
        request.params.id,
      );
      return reply.send({ data: call });
    },
  });
};

export default callRoutes;
