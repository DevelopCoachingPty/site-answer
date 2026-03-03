/**
 * Cron Routes
 *
 * Protected endpoints called by Vercel Cron Jobs.
 * Vercel automatically sets the CRON_SECRET header for verification.
 */

import { FastifyPluginAsync } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";

const cronRoutes: FastifyPluginAsync = async (fastify) => {
  // Verify cron secret header (Vercel sets this automatically)
  fastify.addHook("preHandler", async (request, reply) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.headers["authorization"] !== `Bearer ${cronSecret}`) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  // POST /cron/stats - Nightly stats aggregation
  fastify.post("/stats", async (_request, reply) => {
    const log = logger.child({ cron: "stats-aggregation" });
    log.info("Running stats aggregation");

    // Default to yesterday
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    const dateStr = targetDate.toISOString().split("T")[0]!;
    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd = `${dateStr}T23:59:59.999Z`;

    // Get all active orgs
    const { data: orgs } = await supabaseAdmin
      .from("organisations")
      .select("id")
      .eq("is_active", true);

    if (!orgs?.length) {
      return reply.send({ processed: 0 });
    }

    let processed = 0;

    for (const org of orgs) {
      const { data: calls } = await supabaseAdmin
        .from("calls")
        .select("direction, status, duration_seconds, sentiment, flow_type")
        .eq("organisation_id", org.id)
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd);

      if (!calls?.length) continue;

      const flowCounts: Record<string, number> = {};
      let totalDuration = 0;
      let durationCount = 0;

      for (const call of calls) {
        if (call.flow_type) {
          flowCounts[call.flow_type] = (flowCounts[call.flow_type] ?? 0) + 1;
        }
        if (call.duration_seconds) {
          totalDuration += call.duration_seconds;
          durationCount++;
        }
      }

      await supabaseAdmin
        .from("call_daily_stats")
        .upsert({
          organisation_id: org.id,
          stat_date: dateStr,
          total_calls: calls.length,
          inbound_calls: calls.filter((c) => c.direction === "inbound").length,
          outbound_calls: calls.filter((c) => c.direction === "outbound").length,
          missed_calls: calls.filter((c) => c.status === "missed").length,
          completed_calls: calls.filter((c) => c.status === "completed").length,
          avg_duration_seconds: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
          positive_sentiment: calls.filter((c) => c.sentiment === "positive").length,
          neutral_sentiment: calls.filter((c) => c.sentiment === "neutral").length,
          negative_sentiment: calls.filter((c) => c.sentiment === "negative").length,
          flow_type_counts: flowCounts,
        }, { onConflict: "organisation_id,stat_date" });

      processed++;
    }

    log.info({ processed, date: dateStr }, "Stats aggregation complete");
    return reply.send({ processed, date: dateStr });
  });
};

export default cronRoutes;
