import { FastifyPluginAsync } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getMetrics } from "../../lib/metrics.js";

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

    const hasErrors = Object.values(checks).some((v) => v === "error");
    const allOk = Object.values(checks).every((v) => v === "ok");

    return reply.code(hasErrors ? 503 : 200).send({
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      services: checks,
    });
  });

  // GET /health/metrics - Application metrics
  fastify.get("/metrics", async (_request, reply) => {
    return reply.send(getMetrics());
  });
};

export default healthRoutes;
