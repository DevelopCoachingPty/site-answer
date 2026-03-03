import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/**
 * Handles Supabase auth callbacks (email confirmation, password reset, magic links).
 * Supabase redirects here with a code that we exchange for a session.
 * After email confirmation, sets up the user profile + organisation via the API.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Get user info to set up profile after email confirmation
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();

      let isNewSignup = false;

      if (user && session) {
        const fullName = user.user_metadata?.full_name;
        const companyName = user.user_metadata?.company_name;

        // Only call setup-profile if we have the metadata (i.e. this is a signup confirmation)
        if (fullName && companyName) {
          isNewSignup = true;
          try {
            await fetch(`${API_BASE_URL}/auth/setup-profile`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                full_name: fullName,
                company_name: companyName,
              }),
            });
          } catch {
            // Profile setup failed but user is authenticated — they can retry from dashboard
          }
        }
      }

      // New signups go to onboarding, returning users go to dashboard
      const redirectTo = isNewSignup ? "/dashboard/onboarding" : next;
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
