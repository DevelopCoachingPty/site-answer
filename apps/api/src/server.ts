import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { API_PREFIX } from "./config/constants.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";

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
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: [env.FRONTEND_URL],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

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

  // Webhook routes (signature verification, no JWT auth)
  await app.register(telephonyRoutes, { prefix: `${API_PREFIX}/webhooks/telephony` });
  await app.register(elevenlabsRoutes, { prefix: `${API_PREFIX}/webhooks/elevenlabs` });

  return app;
}
