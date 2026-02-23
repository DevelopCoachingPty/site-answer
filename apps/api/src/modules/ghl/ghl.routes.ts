import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as ghlClient from "./ghl.client.js";
import { env } from "../../config/env.js";

const CallbackQuery = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

const ghlRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ghl/oauth/authorize - Start GHL OAuth flow
  fastify.get("/oauth/authorize", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      const url = ghlClient.getOAuthAuthorizeUrl(request.organisationId!);
      return reply.redirect(url);
    },
  });

  // GET /ghl/oauth/callback - GHL OAuth callback
  fastify.get<{ Querystring: Static<typeof CallbackQuery> }>("/oauth/callback", {
    schema: { querystring: CallbackQuery },
    handler: async (request, reply) => {
      const { code, state: orgId } = request.query;

      if (!orgId) {
        return reply.code(400).send({ error: "Missing state parameter" });
      }

      const tokens = await ghlClient.exchangeCodeForTokens(code);

      // Store encrypted tokens and location ID
      await ghlClient.storeTokens(orgId, tokens.access_token, tokens.refresh_token);

      // Update location ID if returned
      if (tokens.locationId) {
        const { supabaseAdmin } = await import("../../lib/supabase.js");
        await supabaseAdmin
          .from("organisations")
          .update({ ghl_location_id: tokens.locationId })
          .eq("id", orgId);
      }

      // Redirect back to settings page
      return reply.redirect(`${env.FRONTEND_URL}/dashboard/settings?ghl=connected`);
    },
  });

  // GET /ghl/status - Check GHL connection status
  fastify.get("/status", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      const connected = await ghlClient.checkConnection(request.organisationId!);
      return reply.send({ connected });
    },
  });

  // DELETE /ghl/disconnect - Disconnect GHL
  fastify.delete("/disconnect", {
    preHandler: [fastify.authenticate, fastify.requireOrganisation],
    handler: async (request, reply) => {
      await ghlClient.clearTokens(request.organisationId!);
      return reply.send({ message: "GoHighLevel disconnected" });
    },
  });
};

export default ghlRoutes;
