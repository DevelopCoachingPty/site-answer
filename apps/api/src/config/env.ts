import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_PHONE_NUMBER: z.string().startsWith("+").optional(),

  // GoHighLevel
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  GHL_REDIRECT_URI: z.string().url().optional(),

  // Xero
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),
  XERO_REDIRECT_URI: z.string().url().optional(),

  // QuickBooks
  QB_CLIENT_ID: z.string().optional(),
  QB_CLIENT_SECRET: z.string().optional(),
  QB_REDIRECT_URI: z.string().url().optional(),

  // Google Calendar
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Microsoft (Outlook Calendar)
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_REDIRECT_URI: z.string().url().optional(),

  // Encryption (required in production to protect OAuth tokens)
  ENCRYPTION_KEY: z.string().min(64, "ENCRYPTION_KEY must be a 32-byte hex string (64 chars)"),

  // Frontend URL
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // Pricing (per minute rates)
  ELEVENLABS_COST_PER_MIN: z.coerce.number().default(0.08),
  REBILL_RATE_PER_MIN: z.coerce.number().default(0.16),

  // Default timezone (used when org.timezone is not set)
  DEFAULT_TIMEZONE: z.string().default("Australia/Sydney"),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),

  // Alerts
  ALERT_EMAIL: z.string().email().optional(),
  COST_ALERT_THRESHOLD_MONTHLY: z.coerce.number().default(2000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
