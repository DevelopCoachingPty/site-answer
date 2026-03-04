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
  HOLD_MUSIC_URL: "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical",
  BUILDER_TIMEOUT_MS: 20_000, // 20 seconds to answer
  HANDOFF_DELAY_MS: 8_000, // 8 seconds for agent to say goodbye
};
