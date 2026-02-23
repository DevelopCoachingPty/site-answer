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

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),

  // GoHighLevel
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  GHL_REDIRECT_URI: z.string().url().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Twilio
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Frontend URL
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

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
