import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { env } from "./config/env.js";
import { API_PREFIX } from "./config/constants.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import { recordRequest } from "./lib/metrics.js";
import {
  createSession,
  handleTwilioMessage,
  cleanupSession,
  type BridgeSession,
} from "./modules/telephony/audio-bridge.js";

// Module routes
import healthRoutes from "./modules/health/health.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import callRoutes from "./modules/calls/calls.routes.js";
import kbRoutes from "./modules/knowledge-base/kb.routes.js";
import orgRoutes from "./modules/organisations/org.routes.js";
import scriptRoutes from "./modules/scripts/scripts.routes.js";
import usageRoutes from "./modules/usage/usage.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import telephonyRoutes from "./modules/telephony/telephony.routes.js";
import elevenlabsRoutes from "./modules/elevenlabs/elevenlabs.routes.js";
import ghlRoutes from "./modules/ghl/ghl.routes.js";
import chaseRoutes from "./modules/payment-chase/chase.routes.js";
import accountingRoutes from "./modules/accounting/accounting.routes.js";
import calendarRoutes from "./modules/calendar/calendar.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import whatsappRoutes from "./modules/whatsapp/whatsapp.routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576, // 1 MB
  });

  // --- Plugins ---
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP handled by Next.js frontend
  });

  await app.register(cors, {
    origin: [env.FRONTEND_URL],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(websocket);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // Request metrics hook
  app.addHook("onResponse", (request, reply, done) => {
    const duration = reply.elapsedTime;
    recordRequest(request.method, request.url.split("?")[0]!, reply.statusCode, duration);
    done();
  });

  // --- Routes ---
  // Health check (no auth)
  await app.register(healthRoutes, { prefix: "/health" });

  // Auth routes (JWT required but no org membership needed)
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });

  // API routes (auth + org membership required)
  await app.register(callRoutes, { prefix: `${API_PREFIX}/calls` });
  await app.register(kbRoutes, { prefix: `${API_PREFIX}/knowledge-base` });
  await app.register(orgRoutes, { prefix: `${API_PREFIX}/organisations` });
  await app.register(scriptRoutes, { prefix: `${API_PREFIX}/scripts` });
  await app.register(usageRoutes, { prefix: `${API_PREFIX}/usage` });
  await app.register(adminRoutes, { prefix: `${API_PREFIX}/admin` });
  await app.register(ghlRoutes, { prefix: `${API_PREFIX}/ghl` });
  await app.register(chaseRoutes, { prefix: `${API_PREFIX}/payment-chase` });
  await app.register(accountingRoutes, { prefix: `${API_PREFIX}/accounting` });
  await app.register(calendarRoutes, { prefix: `${API_PREFIX}/calendar` });
  await app.register(analyticsRoutes, { prefix: `${API_PREFIX}/analytics` });
  await app.register(whatsappRoutes, { prefix: `${API_PREFIX}/whatsapp` });

  // Webhook routes (signature verification, no JWT auth)
  await app.register(telephonyRoutes, { prefix: `${API_PREFIX}/webhooks/telephony` });
  await app.register(elevenlabsRoutes, { prefix: `${API_PREFIX}/webhooks/elevenlabs` });

  // WebSocket route for Twilio Media Streams (audio bridge)
  app.register(async function streamRoute(instance) {
    instance.get(`${API_PREFIX}/webhooks/telephony/stream`, { websocket: true }, (socket) => {
      let session: BridgeSession | null = null;

      socket.on("message", (raw: Buffer) => {
        const msg = raw.toString();

        try {
          const data = JSON.parse(msg);

          // Create session on the "start" event (carries custom parameters)
          if (data.event === "start" && !session) {
            const params = data.start?.customParameters ?? {};
            session = createSession({
              callId: params.callId ?? "",
              callSid: data.start?.callSid ?? "",
              organisationId: params.orgId ?? "",
              agentId: params.agentId ?? "",
              flowType: params.flowType ?? "unknown",
            });
            session.twilioWs = socket;
          }

          if (session) {
            handleTwilioMessage(session, msg);
          }
        } catch {
          // Ignore parse errors on the stream
        }
      });

      socket.on("close", () => {
        if (session) {
          cleanupSession(session.callId);
        }
      });
    });
  });

  return app;
}
