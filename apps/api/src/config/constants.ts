export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const MAX_CALL_DURATION_SECONDS = 600;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const GHL_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 10_000, // 10 seconds
  dailyMax: 200_000,
};

export const QUEUE_NAMES = {
  POST_CALL: "post-call-processing",
  GHL_SYNC: "ghl-sync",
  AGENT_SYNC: "agent-sync",
} as const;
