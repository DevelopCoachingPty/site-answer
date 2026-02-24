/**
 * Lightweight in-process request metrics.
 * No external dependencies — exposes counters and histograms
 * via the /health/metrics endpoint.
 */

interface RouteMetrics {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

const routeMetrics = new Map<string, RouteMetrics>();
let startedAt = Date.now();

export function recordRequest(method: string, path: string, statusCode: number, durationMs: number) {
  // Normalise path: collapse UUIDs and numeric IDs
  const normPath = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");

  const key = `${method} ${normPath}`;
  const existing = routeMetrics.get(key) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };

  existing.count++;
  if (statusCode >= 400) existing.errors++;
  existing.totalMs += durationMs;
  if (durationMs > existing.maxMs) existing.maxMs = durationMs;

  routeMetrics.set(key, existing);
}

export function getMetrics() {
  const routes: Record<string, { count: number; errors: number; avgMs: number; maxMs: number }> = {};

  for (const [key, m] of routeMetrics) {
    routes[key] = {
      count: m.count,
      errors: m.errors,
      avgMs: m.count > 0 ? Math.round(m.totalMs / m.count) : 0,
      maxMs: Math.round(m.maxMs),
    };
  }

  return {
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    routes,
  };
}

export function resetMetrics() {
  routeMetrics.clear();
  startedAt = Date.now();
}
