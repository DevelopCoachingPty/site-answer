/**
 * Agent Sync Worker
 *
 * Syncs knowledge base and script changes to ElevenLabs agents.
 * When a member updates their knowledge base or conversation scripts,
 * this worker rebuilds the agent's system prompt and updates the
 * ElevenLabs agent configuration via API.
 *
 * Uses job deduplication: if multiple changes happen quickly,
 * only the latest sync runs.
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import * as elevenlabsClient from "../modules/elevenlabs/elevenlabs.client.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AgentSyncJob {
  organisationId: string;
  trigger: "knowledge_base_updated" | "script_updated" | "settings_updated";
}

async function processAgentSync(job: Job<AgentSyncJob>) {
  const log = logger.child({ jobId: job.id, orgId: job.data.organisationId });
  log.info({ trigger: job.data.trigger }, "Syncing agent configuration");

  const { organisationId } = job.data;

  // Get org's ElevenLabs agent ID
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("elevenlabs_agent_id, name")
    .eq("id", organisationId)
    .single();

  if (!org) {
    log.warn("Organisation not found");
    return;
  }

  if (!org.elevenlabs_agent_id) {
    // Agent not provisioned yet - provision it
    log.info("No agent found, provisioning new agent");
    await elevenlabsClient.provisionAgent(organisationId);
    return;
  }

  // Update the agent's prompt with latest KB + scripts
  await elevenlabsClient.updateAgentPrompt(org.elevenlabs_agent_id, organisationId);

  log.info({ agentId: org.elevenlabs_agent_id }, "Agent prompt updated");
}

export function startAgentSyncWorker() {
  const worker = new Worker<AgentSyncJob>(
    QUEUE_NAMES.AGENT_SYNC,
    processAgentSync,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Agent sync job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Agent sync job failed");
  });

  return worker;
}
