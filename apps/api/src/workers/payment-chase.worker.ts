/**
 * Payment Chase Worker
 *
 * Two job types:
 * 1. "chase-scheduler" (repeatable) - Polls for items due for chasing, enqueues individual chase jobs
 * 2. "chase-call" - Initiates an outbound AI call for a specific chase item
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import { getQueue } from "../lib/queue.js";
import * as chaseService from "../modules/payment-chase/chase.service.js";
import * as callsService from "../modules/calls/calls.service.js";
import * as usageService from "../modules/usage/usage.service.js";
import { initiateOutboundCall } from "../modules/elevenlabs/elevenlabs.client.js";

export interface ChaseCallJob {
  chaseItemId: string;
  organisationId: string;
}

async function processChaseJob(job: Job<ChaseCallJob | Record<string, never>>) {
  const log = logger.child({ jobId: job.id, jobName: job.name });

  if (job.name === "chase-scheduler") {
    log.info("Running chase scheduler");

    const dueItems = await chaseService.getItemsDueForChasing();
    log.info({ count: dueItems.length }, "Found items due for chasing");

    const chaseQueue = getQueue(QUEUE_NAMES.PAYMENT_CHASE);
    for (const item of dueItems) {
      await chaseQueue.add("chase-call", {
        chaseItemId: item.id,
        organisationId: item.organisation_id,
      } as ChaseCallJob, {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        jobId: `chase-${item.id}-${Date.now()}`,
      });
    }

    return { scheduled: dueItems.length };
  }

  if (job.name === "chase-call") {
    const data = job.data as ChaseCallJob;
    log.info({ chaseItemId: data.chaseItemId }, "Processing chase call");

    // Load chase item
    const item = await chaseService.getChaseItem(data.organisationId, data.chaseItemId);

    // Verify eligible: not paid/disputed/escalated, under max chases
    if (["paid", "disputed", "escalated"].includes(item.status)) {
      log.info({ status: item.status }, "Chase item no longer eligible");
      return { skipped: true, reason: `status: ${item.status}` };
    }

    if (item.chase_count >= item.max_chases) {
      log.info("Max chases reached, escalating");
      await chaseService.updateChaseItem(data.organisationId, data.chaseItemId, {
        status: "escalated",
      });
      return { skipped: true, reason: "max_chases_reached" };
    }

    // Create outbound call record
    const call = await callsService.createCall({
      organisation_id: data.organisationId,
      direction: "outbound",
      caller_number: item.contact_phone,
      caller_name: item.contact_name,
      flow_type: "payment_query",
      ghl_contact_id: item.ghl_contact_id,
    });

    // Link call to chase item
    const { supabaseAdmin } = await import("../lib/supabase.js");
    await supabaseAdmin
      .from("calls")
      .update({ chase_queue_id: data.chaseItemId })
      .eq("id", call.id);

    // Initiate outbound call via ElevenLabs + Twilio
    try {
      await initiateOutboundCall(data.organisationId, {
        phoneNumber: item.contact_phone,
        contactName: item.contact_name,
        invoiceReference: item.invoice_reference,
        amountDue: item.amount_due,
        daysOverdue: item.days_overdue,
        chaseCount: item.chase_count,
        callId: call.id,
        chaseItemId: data.chaseItemId,
      });
    } catch (err) {
      log.error({ err, callId: call.id }, "Failed to initiate outbound call");
      await callsService.updateCall(call.id, { status: "failed" });
      throw err;
    }

    // Record chase attempt
    await chaseService.recordChaseAttempt(
      data.chaseItemId,
      call.id,
      item.chase_count,
    );

    // Update usage
    await usageService.incrementUsage(data.organisationId, {
      calls: 1,
      outbound: 1,
    });

    log.info({ callId: call.id, chaseCount: item.chase_count + 1 }, "Chase call initiated");
    return { callId: call.id, chaseCount: item.chase_count + 1 };
  }

  log.warn({ jobName: job.name }, "Unknown job type");
}

export function startPaymentChaseWorker() {
  const worker = new Worker(
    QUEUE_NAMES.PAYMENT_CHASE,
    processChaseJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 3,
    },
  );

  // Set up repeatable scheduler job
  const chaseQueue = getQueue(QUEUE_NAMES.PAYMENT_CHASE);
  chaseQueue.add("chase-scheduler", {}, {
    repeat: {
      every: env.CHASE_SCHEDULER_INTERVAL_MS,
    },
    jobId: "chase-scheduler-repeatable",
  }).catch((err) => {
    logger.error({ err }, "Failed to set up chase scheduler");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "Chase job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, "Chase job failed");
  });

  return worker;
}
