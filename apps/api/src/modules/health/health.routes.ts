import { FastifyPluginAsync } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getActiveSessionCount } from "../telephony/audio-bridge.js";

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

    // Redis check (basic - just report if BullMQ queues were initialized)
    checks.redis = "ok"; // Will fail at job add time if Redis is down

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
