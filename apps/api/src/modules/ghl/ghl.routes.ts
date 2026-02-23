import { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

const ghlRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ghl/oauth/authorize - Start GHL OAuth flow
  fastify.get("/oauth/authorize", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      // TODO: Redirect to GHL OAuth authorization URL
      return reply.send({ message: "GHL OAuth not yet implemented" });
    },
  });

  // GET /ghl/oauth/callback - GHL OAuth callback
  fastify.get("/oauth/callback", {
    schema: {
      querystring: Type.Object({
        code: Type.String(),
        state: Type.Optional(Type.String()),
      }),
    },
    handler: async (request, reply) => {
      // TODO:
      // 1. Exchange authorization code for tokens
      // 2. Encrypt and store tokens
      // 3. Redirect back to settings page
      return reply.send({ message: "GHL OAuth callback not yet implemented" });
    },
  });

  // GET /ghl/status - Check GHL connection status
  fastify.get("/status", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      // TODO: Check if org has valid GHL tokens
      return reply.send({ connected: false });
    },
  });

  // DELETE /ghl/disconnect - Disconnect GHL
  fastify.delete("/disconnect", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      // TODO: Remove GHL tokens from organisation
      return reply.send({ message: "GHL disconnected" });
    },
  });
};

export default ghlRoutes;
