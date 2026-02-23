import { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getActiveSessionCount } from "../telephony/audio-bridge.js";
import { env } from "../../config/env.js";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_request, reply) => {
    const checks: Record<string, string> = {};

    // Database check
    try {
      const { error } = await supabaseAdmin.from("organisations").select("id").limit(1);
      checks.database = error ? "error" : "ok";
    } catch {
      checks.database = "error";
    }

    // Redis check via BullMQ connection
    try {
      const probe = new Queue("health-probe", {
        connection: { url: env.REDIS_URL } as never,
      });
      await probe.client;
      await probe.close();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      services: checks,
      activeCalls: getActiveSessionCount(),
    });
  });
};

export default healthRoutes;
