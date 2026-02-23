import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as xeroClient from "./xero.client.js";
import * as qbClient from "./quickbooks.client.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getQueue } from "../../lib/queue.js";
import { QUEUE_NAMES } from "../../config/constants.js";
import { logger } from "../../lib/logger.js";

const ProviderQuery = Type.Object({
  provider: Type.Union([Type.Literal("xero"), Type.Literal("quickbooks")]),
});

const OAuthCallbackQuery = Type.Object({
  code: Type.String(),
  state: Type.String(),
  realmId: Type.Optional(Type.String()),
});

const accountingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /accounting/oauth/authorize?provider=xero|quickbooks
  fastify.get<{ Querystring: Static<typeof ProviderQuery> }>("/oauth/authorize", {
    schema: { querystring: ProviderQuery },
    handler: async (request, reply) => {
      const { provider } = request.query;
      const orgId = request.organisationId!;

      const url = provider === "xero"
        ? xeroClient.getOAuthAuthorizeUrl(orgId)
        : qbClient.getOAuthAuthorizeUrl(orgId);

      return reply.send({ url });
    },
  });

  // GET /accounting/oauth/callback
  fastify.get<{ Querystring: Static<typeof OAuthCallbackQuery> }>("/oauth/callback", {
    schema: { querystring: OAuthCallbackQuery },
    handler: async (request, reply) => {
      const { code, state, realmId } = request.query;

      // state format: "provider:orgId"
      const [provider, orgId] = state.split(":");

      if (!orgId || (provider !== "xero" && provider !== "quickbooks")) {
        return reply.code(400).send({ error: "Invalid OAuth state" });
      }

      try {
        if (provider === "xero") {
          const tokens = await xeroClient.exchangeCodeForTokens(code);
          await xeroClient.storeTokens(orgId, tokens);
        } else {
          const tokens = await qbClient.exchangeCodeForTokens(code, realmId ?? "");
          await qbClient.storeTokens(orgId, tokens);
        }

        return reply.send({ success: true, provider });
      } catch (err) {
        logger.error({ err, provider }, "OAuth callback failed");
        return reply.code(500).send({ error: "Failed to connect accounting provider" });
      }
    },
  });

  // GET /accounting/status
  fastify.get("/status", async (request, reply) => {
    const orgId = request.organisationId!;

    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("accounting_type, accounting_token_expires_at, accounting_tenant_id")
      .eq("id", orgId)
      .single();

    if (!org?.accounting_type) {
      return reply.send({ connected: false });
    }

    // Get last sync info
    const { data: lastSync } = await supabaseAdmin
      .from("accounting_sync_log")
      .select("status, invoices_found, invoices_synced, completed_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1);

    return reply.send({
      connected: true,
      provider: org.accounting_type,
      tenant_id: org.accounting_tenant_id,
      token_expires_at: org.accounting_token_expires_at,
      last_sync: lastSync?.[0] ?? null,
    });
  });

  // POST /accounting/sync - Manual trigger
  fastify.post("/sync", async (request, reply) => {
    const orgId = request.organisationId!;

    const queue = getQueue(QUEUE_NAMES.INVOICE_SYNC);
    await queue.add("manual-sync", {
      organisationId: orgId,
      syncType: "manual",
    }, {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    });

    return reply.send({ status: "queued" });
  });

  // GET /accounting/sync/history
  fastify.get("/sync/history", async (request, reply) => {
    const orgId = request.organisationId!;

    const { data, error } = await supabaseAdmin
      .from("accounting_sync_log")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return reply.code(500).send({ error: "Failed to load sync history" });
    }

    return reply.send({ data: data ?? [] });
  });

  // DELETE /accounting/disconnect
  fastify.delete("/disconnect", async (request, reply) => {
    const orgId = request.organisationId!;

    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("accounting_type")
      .eq("id", orgId)
      .single();

    if (org?.accounting_type === "xero") {
      await xeroClient.disconnect(orgId);
    } else if (org?.accounting_type === "quickbooks") {
      await qbClient.disconnect(orgId);
    }

    return reply.code(204).send();
  });
};

export default accountingRoutes;
