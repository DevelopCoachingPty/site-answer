/**
 * GHL Sync Worker
 *
 * Handles all GoHighLevel API operations with rate limiting.
 * Separate worker to avoid blocking the main event loop and
 * to respect GHL's rate limits (100 req/10s per resource).
 *
 * Job types:
 * - create_contact: Create new contact in GHL
 * - update_contact: Update existing contact
 * - log_activity: Add note/activity to contact timeline
 * - send_sms: Send SMS via GHL
 * - create_opportunity: Create pipeline opportunity
 * - trigger_workflow: Trigger a GHL workflow
 */

import { logger } from "../lib/logger.js";
import { QUEUE_NAMES } from "../config/constants.js";

export interface GhlSyncJob {
  organisationId: string;
  callId: string;
  actions: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

// TODO: Implement BullMQ worker with rate limiting
// const worker = new Worker<GhlSyncJob>(QUEUE_NAMES.GHL_SYNC, async (job) => {
//   const log = logger.child({ jobId: job.id, orgId: job.data.organisationId });
//   log.info("Processing GHL sync job");
//   // ... implementation
// }, {
//   limiter: { max: 10, duration: 1000 }, // 10 jobs per second
// });

export default {};
