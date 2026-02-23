import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { supabaseAdmin } from "../lib/supabase.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    organisationId: string | null;
    isAdmin: boolean;
    accessToken: string;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("organisationId", null);
  fastify.decorateRequest("isAdmin", false);
  fastify.decorateRequest("accessToken", "");

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, _reply: FastifyReply) {
      const authHeader = request.headers.authorization;

      if (!authHeader?.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing or invalid Authorization header");
      }

      const token = authHeader.slice(7);

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedError("Invalid or expired token");
      }

      // Get user profile with org info
      const { data: profile } = await supabaseAdmin
        .from("users")
        .select("organisation_id, is_admin, role")
        .eq("id", user.id)
        .single();

      request.userId = user.id;
      request.organisationId = profile?.organisation_id ?? null;
      request.isAdmin = profile?.is_admin ?? false;
      request.accessToken = token;
    },
  );

  fastify.decorate(
    "requireAdmin",
    async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.isAdmin) {
        throw new ForbiddenError("Admin access required");
      }
    },
  );

  fastify.decorate(
    "requireOrganisation",
    async function (request: FastifyRequest, _reply: FastifyReply) {
      if (!request.organisationId) {
        throw new ForbiddenError("Organisation membership required");
      }
    },
  );
};

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOrganisation: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: "auth" });
