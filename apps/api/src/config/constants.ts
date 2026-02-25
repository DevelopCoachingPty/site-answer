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

export const WARM_TRANSFER = {
  HANDOFF_DELAY_MS: 8_000,      // Time for agent to say goodbye before moving to conference
  BUILDER_TIMEOUT_MS: 25_000,   // Time to wait for builder to answer
  HOLD_MUSIC_URL: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
} as const;

export const QUEUE_NAMES = {
  POST_CALL: "post-call-processing",
  GHL_SYNC: "ghl-sync",
  AGENT_SYNC: "agent-sync",
  PAYMENT_CHASE: "payment-chase",
  INVOICE_SYNC: "invoice-sync",
} as const;
