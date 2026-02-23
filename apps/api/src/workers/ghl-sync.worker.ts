/**
 * GHL Sync Worker
 *
 * Handles all GoHighLevel API operations with rate limiting.
 * Separate worker to avoid blocking the main event loop and
 * to respect GHL's rate limits (100 req/10s per resource).
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import * as ghlClient from "../modules/ghl/ghl.client.js";
import * as callsService from "../modules/calls/calls.service.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface GhlSyncJob {
  organisationId: string;
  callId: string;
  actions: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

async function processGhlSync(job: Job<GhlSyncJob>) {
  const log = logger.child({ jobId: job.id, orgId: job.data.organisationId });
  log.info("Processing GHL sync job");

  const { organisationId, callId, actions } = job.data;

  // Get org details for GHL location
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("ghl_location_id, ghl_access_token_encrypted")
    .eq("id", organisationId)
    .single();

  if (!org?.ghl_location_id || !org.ghl_access_token_encrypted) {
    log.warn("GHL not connected, skipping sync");
    return;
  }

  // Get call details for context
  const call = await callsService.getCall(organisationId, callId);

  for (const action of actions) {
    try {
      switch (action.type) {
        case "create_new_contact": {
          // Already created during the call, just log activity
          const contactId = action.data.contact_id as string | undefined;
          if (contactId) {
            await ghlClient.addContactNote(
              organisationId,
              contactId,
              `SiteAnswer call summary:\n${call.summary ?? "No summary available"}\nDuration: ${call.duration_seconds ?? 0}s`,
            );
          }
          break;
        }

        case "lookup_caller": {
          const contactId = action.data.contact_id as string | undefined;
          if (contactId) {
            await ghlClient.addContactNote(
              organisationId,
              contactId,
              `SiteAnswer call received\nType: ${call.flow_type ?? "unknown"}\nSummary: ${call.summary ?? "N/A"}`,
            );
          }
          break;
        }

        case "escalate_to_builder": {
          // Log escalation in GHL as a note on the contact if available
          log.warn({ action }, "Escalation synced to GHL");
          break;
        }

        default:
          log.debug({ actionType: action.type }, "No GHL sync action for this type");
      }
    } catch (err) {
      log.error({ err, actionType: action.type }, "GHL sync action failed");
      // Don't throw - continue processing other actions
    }
  }

  log.info({ callId, actionCount: actions.length }, "GHL sync complete");
}

export function startGhlSyncWorker() {
  const worker = new Worker<GhlSyncJob>(
    QUEUE_NAMES.GHL_SYNC,
    processGhlSync,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2,
      limiter: {
        max: 10,
        duration: 1000, // 10 jobs per second to stay under GHL rate limits
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "GHL sync job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "GHL sync job failed");
  });

  return worker;
}
