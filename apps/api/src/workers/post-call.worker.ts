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

import { logger } from "../lib/logger.js";
import { QUEUE_NAMES } from "../config/constants.js";

export interface PostCallJob {
  callId: string;
  organisationId: string;
  conversationId: string;
  transcript: Array<{ role: string; content: string; timestamp: number }>;
  summary: string;
  toolCallResults: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  durationSeconds: number;
}

// TODO: Implement BullMQ worker
// const worker = new Worker<PostCallJob>(QUEUE_NAMES.POST_CALL, async (job) => {
//   const log = logger.child({ jobId: job.id, callId: job.data.callId });
//   log.info("Processing post-call job");
//   // ... implementation
// });

export default {};
