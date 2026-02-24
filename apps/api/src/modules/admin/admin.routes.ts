import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { logger } from "../../lib/logger.js";
import * as orgService from "../organisations/org.service.js";
import * as usageService from "../usage/usage.service.js";
import * as scriptsService from "../scripts/scripts.service.js";
import { provisionAgent } from "../elevenlabs/elevenlabs.client.js";

const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
});

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });
const OrgIdParams = Type.Object({ org_id: Type.String({ format: "uuid" }) });

const OnboardBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  builder_name: Type.String({ minLength: 1 }),
  email: Type.String({ format: "email" }),
  phone_number: Type.Optional(Type.String()),
  ghl_location_id: Type.Optional(Type.String()),
});

const StatusBody = Type.Object({
  is_active: Type.Boolean(),
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireAdmin);

  // GET /admin/organisations - List all member organisations
  fastify.get<{ Querystring: Static<typeof PaginationQuery> }>("/organisations", {
    schema: { querystring: PaginationQuery },
    handler: async (request, reply) => {
      const result = await orgService.listOrganisations(
        request.query.page ?? 1,
        request.query.limit ?? 20,
        request.query.status,
      );
      return reply.send(result);
    },
  });

  // GET /admin/organisations/:id - Full org detail
  fastify.get<{ Params: Static<typeof IdParams> }>("/organisations/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const org = await orgService.getOrganisation(request.params.id);
      return reply.send({ data: org });
    },
  });

  // POST /admin/organisations - Onboard new member
  fastify.post<{ Body: Static<typeof OnboardBody> }>("/organisations", {
    schema: { body: OnboardBody },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const { name, builder_name, email, phone_number, ghl_location_id } = request.body;

      // Create auth user via Supabase Admin API
      const { data: authUser, error: authError } = await (await import("../../lib/supabase.js")).supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: builder_name, company_name: name },
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      // Create organisation
      const org = await orgService.createOrganisation({
        name,
        ownerUserId: authUser.user.id,
        builderName: builder_name,
        phoneNumber: phone_number,
        ghlLocationId: ghl_location_id,
      });

      // Seed default conversation scripts
      await scriptsService.seedDefaultScripts(org.id);

      // Provision ElevenLabs agent (non-blocking — log error but don't fail org creation)
      try {
        await provisionAgent(org.id);
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Failed to provision ElevenLabs agent");
      }

      // Send welcome invite email so user can set their password
      try {
        const { supabaseAdmin: supa } = await import("../../lib/supabase.js");
        const { env: appEnv } = await import("../../config/env.js");
        const { error: linkError } = await supa.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: `${appEnv.FRONTEND_URL}/login` },
        });
        if (linkError) {
          logger.warn({ err: linkError, email }, "Failed to generate invite link");
        }
      } catch (err) {
        logger.warn({ err, email }, "Failed to send welcome email");
      }

      return reply.code(201).send({ data: org });
    },
  });

  // PUT /admin/organisations/:id/status - Activate/deactivate
  fastify.put<{ Params: Static<typeof IdParams>; Body: Static<typeof StatusBody> }>("/organisations/:id/status", {
    schema: { params: IdParams, body: StatusBody },
    handler: async (request, reply) => {
      const org = await orgService.setOrganisationActive(
        request.params.id,
        request.body.is_active,
      );
      // ElevenLabs agent stays provisioned but is effectively disabled:
      // telephony.routes.ts and elevenlabs.routes.ts both filter by is_active=true
      return reply.send({ data: org });
    },
  });

  // GET /admin/usage - Global usage dashboard
  fastify.get("/usage", async (_request, reply) => {
    try {
      const usage = await usageService.getGlobalUsage();
      return reply.send(usage);
    } catch (err) {
      logger.error({ err }, "Failed to get global usage");
      return reply.code(500).send({ error: "Failed to load usage data" });
    }
  });

  // GET /admin/usage/:org_id - Per-member usage
  fastify.get<{ Params: Static<typeof OrgIdParams> }>("/usage/:org_id", {
    schema: { params: OrgIdParams },
    handler: async (request, reply) => {
      try {
        const usage = await usageService.getUsageHistory(request.params.org_id);
        return reply.send({ data: usage });
      } catch (err) {
        logger.error({ err, orgId: request.params.org_id }, "Failed to get org usage");
        return reply.code(500).send({ error: "Failed to load usage data" });
      }
    },
  });

  // GET /admin/alerts - Cost alerts
  fastify.get("/alerts", async (_request, reply) => {
    try {
      const { supabaseAdmin } = await import("../../lib/supabase.js");
      const { data, error } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .in("type", ["usage_limit_warning", "usage_limit_exceeded"])
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ err: error }, "Failed to query alerts");
        return reply.code(500).send({ error: "Failed to load alerts" });
      }

      return reply.send({ data: data ?? [] });
    } catch (err) {
      logger.error({ err }, "Failed to get alerts");
      return reply.code(500).send({ error: "Failed to load alerts" });
    }
  });
};

export default adminRoutes;
