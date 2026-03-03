import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { supabaseAdmin } from "../../lib/supabase.js";

const ListQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
  unread_only: Type.Optional(Type.Boolean({ default: false })),
});

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require auth + org
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /notifications — list notifications for current org
  fastify.get<{ Querystring: Static<typeof ListQuery> }>("/", {
    schema: { querystring: ListQuery },
    handler: async (request, reply) => {
      const orgId = request.organisationId!;
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (request.query.unread_only) {
        query = query.eq("is_read", false);
      }

      const { data, error, count } = await query;

      if (error) {
        return reply.code(500).send({ error: "DB_ERROR", message: error.message });
      }

      return reply.send({
        data: data ?? [],
        pagination: {
          page,
          limit,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / limit),
        },
      });
    },
  });

  // GET /notifications/unread-count
  fastify.get("/unread-count", async (request, reply) => {
    const orgId = request.organisationId!;

    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("is_read", false);

    if (error) {
      return reply.code(500).send({ error: "DB_ERROR", message: error.message });
    }

    return reply.send({ unread_count: count ?? 0 });
  });

  // PATCH /notifications/:id/read — mark single notification as read
  fastify.patch<{ Params: { id: string } }>("/:id/read", async (request, reply) => {
    const orgId = request.organisationId!;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", request.params.id)
      .eq("organisation_id", orgId);

    if (error) {
      return reply.code(500).send({ error: "DB_ERROR", message: error.message });
    }

    return reply.send({ success: true });
  });

  // POST /notifications/read-all — mark all as read
  fastify.post("/read-all", async (request, reply) => {
    const orgId = request.organisationId!;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("organisation_id", orgId)
      .eq("is_read", false);

    if (error) {
      return reply.code(500).send({ error: "DB_ERROR", message: error.message });
    }

    return reply.send({ success: true });
  });
};

export default notificationsRoutes;
