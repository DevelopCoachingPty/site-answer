import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import { logger } from "./logger.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
let connection: { quit: () => Promise<string> } | null = null;
let connectionUrl: string = "";

export async function getRedisConnection(): Promise<ConnectionOptions> {
  // BullMQ accepts a connection URL string directly
  return env.REDIS_URL as unknown as ConnectionOptions;
}

export function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: { url: env.REDIS_URL } as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

// Queue instances (lazy - only created when first accessed)
let _postCallQueue: Queue | null = null;
let _ghlSyncQueue: Queue | null = null;
let _agentSyncQueue: Queue | null = null;

export function getPostCallQueue(): Queue {
  if (!_postCallQueue) _postCallQueue = createQueue(QUEUE_NAMES.POST_CALL);
  return _postCallQueue;
}

export function getGhlSyncQueue(): Queue {
  if (!_ghlSyncQueue) _ghlSyncQueue = createQueue(QUEUE_NAMES.GHL_SYNC);
  return _ghlSyncQueue;
}

export function getAgentSyncQueue(): Queue {
  if (!_agentSyncQueue) _agentSyncQueue = createQueue(QUEUE_NAMES.AGENT_SYNC);
  return _agentSyncQueue;
}

export async function closeQueues(): Promise<void> {
  const queues = [_postCallQueue, _ghlSyncQueue, _agentSyncQueue].filter(Boolean);
  await Promise.all(queues.map((q) => q!.close()));
  _postCallQueue = null;
  _ghlSyncQueue = null;
  _agentSyncQueue = null;
}
