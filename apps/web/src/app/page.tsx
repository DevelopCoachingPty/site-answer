import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          SiteAnswer
        </h1>
        <p className="mb-2 text-xl text-[var(--muted-foreground)]">
          AI-Powered Call Handler for Construction Businesses
        </p>
        <p className="mb-8 text-[var(--muted-foreground)]">
          Every call answered professionally. Every lead captured. Every client
          interaction logged. All without picking up the phone.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-[var(--primary)] px-6 py-3 text-[var(--primary-foreground)] font-medium hover:opacity-90 transition-opacity"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--accent)] transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
