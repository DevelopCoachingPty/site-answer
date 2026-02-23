/**
 * Stats Aggregation Worker
 *
 * Nightly pre-computation of call_daily_stats for analytics dashboards.
 * Aggregates calls from the previous day into a single stats row.
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { getQueue } from "../lib/queue.js";
import { supabaseAdmin } from "../lib/supabase.js";

async function processStatsAggregation(job: Job) {
  const log = logger.child({ jobId: job.id });
  log.info("Running stats aggregation");

  // Default to yesterday
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  const dateStr = targetDate.toISOString().split("T")[0]!;
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  // Get all orgs with calls
  const { data: orgs } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .eq("is_active", true);

  if (!orgs?.length) return { processed: 0 };

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
  return { processed, date: dateStr };
}

export function startStatsAggregationWorker() {
  const worker = new Worker(
    "stats-aggregation",
    processStatsAggregation,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1,
    },
  );

  // Nightly at 2am
  const queue = getQueue("stats-aggregation");
  queue.add("aggregate", {}, {
    repeat: { pattern: "0 2 * * *" },
    jobId: "nightly-stats",
  }).catch((err) => {
    logger.error({ err }, "Failed to set up stats aggregation schedule");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Stats aggregation completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Stats aggregation failed");
  });

  return worker;
}
