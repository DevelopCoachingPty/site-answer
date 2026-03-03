"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Verify email domain can receive mail (MX record check)
      try {
        const checkRes = await fetch(`${API_BASE_URL}/auth/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (checkRes.status === 422) {
          const body = await checkRes.json().catch(() => ({}));
          setError(body.message || "This email domain cannot receive mail. Please use a valid email address.");
          setLoading(false);
          return;
        }
        // Any other status (200, network error caught below) → proceed
      } catch {
        // Network error → fail-open, let signup continue
      }

      const supabase = createClient();

      // 2. Create auth user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            company_name: companyName,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // 3. If email confirmation is required, no session is returned
      if (!data.session) {
        setEmailSent(true);
        setLoading(false);
        return;
      }

      // 4. Setup user profile and organisation via API
      const profileRes = await fetch(`${API_BASE_URL}/auth/setup-profile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          company_name: companyName,
        }),
      });

      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => ({}));
        setError(errBody.message || "Account created but profile setup failed. Please contact support.");
        setLoading(false);
        return;
      }

      router.push("/dashboard/onboarding");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold">SiteAnswer</h1>
          <div className="mt-6 rounded-lg border border-[var(--input)] bg-[var(--background)] p-6">
            <h2 className="text-lg font-semibold">Check your email</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Click the link in the email to activate your account.
            </p>
          </div>
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Didn&apos;t receive the email? Check your spam folder or{" "}
            <button
              onClick={() => setEmailSent(false)}
              className="text-[var(--primary)] hover:underline"
            >
              try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">SiteAnswer</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[var(--destructive)] bg-red-50 p-3 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-1">
              Your Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Dave Smith"
            />
          </div>

          <div>
            <label htmlFor="companyName" className="block text-sm font-medium mb-1">
              Company Name
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Smith Brothers Construction"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Minimum 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--primary)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
