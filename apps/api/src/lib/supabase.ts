import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service role client - bypasses RLS, for backend operations
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

// Create a user-scoped client from a JWT token (respects RLS)
export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
