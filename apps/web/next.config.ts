import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Extract origin from a URL (e.g. "https://example.com/path" → "https://example.com")
function originOf(url: string): string {
  try {
    const u = new URL(url.trim());
    return u.origin;
  } catch {
    return url.trim();
  }
}

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  transpilePackages: ["@site-answer/shared"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ? originOf(process.env.NEXT_PUBLIC_API_URL) : ""} ${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()}`,
            `img-src 'self' data: blob:`,
            "font-src 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
    })
  : nextConfig;
