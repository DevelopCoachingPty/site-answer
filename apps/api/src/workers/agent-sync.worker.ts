/**
 * Agent Sync Worker
 *
 * Syncs knowledge base and script changes to ElevenLabs agents.
 * When a member updates their knowledge base or conversation scripts,
 * this worker rebuilds the agent's system prompt and updates the
 * ElevenLabs agent configuration via API.
 *
 * Debounced: if multiple KB entries change in quick succession,
 * only the final sync runs.
 */

import { logger } from "../lib/logger.js";
import { QUEUE_NAMES } from "../config/constants.js";

export interface AgentSyncJob {
  organisationId: string;
  trigger: "knowledge_base_updated" | "script_updated" | "settings_updated";
}

// TODO: Implement BullMQ worker
// const worker = new Worker<AgentSyncJob>(QUEUE_NAMES.AGENT_SYNC, async (job) => {
//   const log = logger.child({ jobId: job.id, orgId: job.data.organisationId });
//   log.info({ trigger: job.data.trigger }, "Syncing agent configuration");
//
//   // 1. Fetch organisation, knowledge base, and active scripts
//   // 2. Build dynamic system prompt
//   // 3. Update ElevenLabs agent via API
// }, {
//   // Debounce: only process the latest job per org
//   settings: { backoffStrategy: () => 5000 },
// });

export default {};
