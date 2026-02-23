/**
 * Post-Call Processing Worker
 *
 * Processes completed calls:
 * 1. Save transcript and summary to call record
 * 2. Process tool call results into call_actions
 * 3. Queue GHL sync (separate queue for rate limiting)
 * 4. Update usage tracking
 * 5. Send notifications if needed
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import * as callsService from "../modules/calls/calls.service.js";
import * as usageService from "../modules/usage/usage.service.js";
import * as orgService from "../modules/organisations/org.service.js";
import * as whatsappService from "../modules/whatsapp/whatsapp.service.js";
import { getQueue } from "../lib/queue.js";

export interface PostCallJob {
  conversation_id: string;
  agent_id: string;
  transcript?: Array<{ role: string; message: string; timestamp?: number }>;
  summary?: string;
  tool_calls?: Array<{
    tool_name: string;
    parameters: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
}

async function processPostCall(job: Job<PostCallJob>) {
  const log = logger.child({ jobId: job.id, conversationId: job.data.conversation_id });
  log.info("Processing post-call job");

  const { agent_id, conversation_id, transcript, summary, tool_calls, duration_seconds } = job.data;

  // Resolve organisation from agent_id
  const org = await orgService.getOrganisationByAgentId(agent_id);
  if (!org) {
    log.warn({ agentId: agent_id }, "No organisation found for agent");
    return;
  }

  // Find the call record by conversation_id
  const { supabaseAdmin } = await import("../lib/supabase.js");
  const { data: call } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("external_call_id", conversation_id)
    .single();

  if (!call) {
    log.warn({ conversationId: conversation_id }, "No call record found");
    return;
  }

  // 1. Update call record with transcript and summary
  const updates: Record<string, unknown> = {
    status: "completed",
    ended_at: new Date().toISOString(),
  };

  if (transcript) {
    updates.transcript = transcript.map((t) => ({
      role: t.role,
      content: t.message,
      timestamp: t.timestamp,
    }));
  }

  if (summary) {
    updates.summary = summary;
  }

  if (duration_seconds) {
    updates.duration_seconds = duration_seconds;
  }

  await callsService.updateCall(call.id, updates);

  // 2. Process tool calls into call_actions
  if (tool_calls) {
    for (const tc of tool_calls) {
      await callsService.createCallAction({
        call_id: call.id,
        organisation_id: org.id,
        action_type: tc.tool_name,
        payload: { parameters: tc.parameters, result: tc.result },
        status: "completed",
      });
    }
  }

  // 3. Queue GHL sync if applicable
  if (org.ghl_access_token_encrypted && tool_calls?.length) {
    try {
      const ghlQueue = getQueue(QUEUE_NAMES.GHL_SYNC);
      await ghlQueue.add("sync-call", {
        organisationId: org.id,
        callId: call.id,
        actions: tool_calls.map((tc) => ({
          type: tc.tool_name,
          data: { ...tc.parameters, ...tc.result },
        })),
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
    } catch (err) {
      log.error({ err }, "Failed to queue GHL sync");
    }
  }

  // 4. Update usage tracking
  const isNewContact = tool_calls?.some((tc) => tc.tool_name === "create_new_contact");
  const bookedAppointment = tool_calls?.some((tc) => tc.tool_name === "book_appointment");

  await usageService.incrementUsage(org.id, {
    calls: 1,
    minutes: duration_seconds ? duration_seconds / 60 : 0,
    inbound: 1,
    new_contacts: isNewContact ? 1 : 0,
    appointments: bookedAppointment ? 1 : 0,
  });

  // 5. Send WhatsApp confirmation if enabled
  try {
    const { data: orgDetails } = await supabaseAdmin
      .from("organisations")
      .select("whatsapp_enabled, name")
      .eq("id", org.id)
      .single();

    if (orgDetails?.whatsapp_enabled) {
      const callerNumber = await getCallerNumber(call.id);
      if (callerNumber) {
        if (bookedAppointment) {
          const appointmentAction = tool_calls?.find((tc) => tc.tool_name === "book_appointment");
          await whatsappService.sendTemplateMessage(org.id, callerNumber, "booking_confirmation", {
            company_name: orgDetails.name ?? "our team",
            datetime: (appointmentAction?.result as Record<string, string>)?.message ?? "as discussed",
            contact_name: (appointmentAction?.parameters as Record<string, string>)?.contact_id ?? "there",
          }, call.id);
        } else {
          await whatsappService.sendTemplateMessage(org.id, callerNumber, "inquiry_summary", {
            company_name: orgDetails.name ?? "our team",
            contact_name: "there",
          }, call.id);
        }
      }
    }
  } catch (err) {
    log.warn({ err }, "WhatsApp post-call message failed (non-critical)");
  }

  log.info({ callId: call.id, orgId: org.id }, "Post-call processing complete");
}

async function getCallerNumber(callId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("../lib/supabase.js");
  const { data } = await supabaseAdmin
    .from("calls")
    .select("caller_number")
    .eq("id", callId)
    .single();
  return data?.caller_number ?? null;
}

export function startPostCallWorker() {
  const worker = new Worker<PostCallJob>(
    QUEUE_NAMES.POST_CALL,
    processPostCall,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Post-call job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Post-call job failed");
  });

  return worker;
}
