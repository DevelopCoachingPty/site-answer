import { vi } from "vitest";
import Fastify from "fastify";
import errorHandlerPlugin from "../plugins/error-handler.js";
import authPlugin from "../plugins/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

type MockFn = ReturnType<typeof vi.fn>;

interface MockAdmin {
  auth: {
    getUser: MockFn;
    admin: { getUserById: MockFn; createUser: MockFn };
  };
  _mockFrom: MockFn;
  _mockChainable: {
    single: MockFn;
    range: MockFn;
    limit: MockFn;
    [key: string]: MockFn;
  };
  _setAwaitResult: (result: { data: unknown; error: unknown; count?: number }) => void;
  _queueAwaitResult: (result: { data: unknown; error: unknown; count?: number }) => void;
  _resetAwaitResults: () => void;
}

function getMockAdmin(): MockAdmin {
  return supabaseAdmin as unknown as MockAdmin;
}

/**
 * Build a minimal test server with auth + error handling plugins.
 */
export async function buildTestServer() {
  const app = Fastify({ logger: false });

  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  return app;
}

/**
 * Mock the auth plugin to inject a fake user context.
 */
export function mockAuthenticatedUser(opts: {
  userId?: string;
  organisationId?: string | null;
  isAdmin?: boolean;
}) {
  const userId = opts.userId ?? "test-user-id";
  const organisationId = opts.organisationId !== undefined ? opts.organisationId : "test-org-id";
  const isAdmin = opts.isAdmin ?? false;

  const admin = getMockAdmin();

  admin.auth.getUser.mockResolvedValue({
    data: { user: { id: userId, email: "test@example.com" } },
    error: null,
  });

  // Auth plugin's profile lookup consumes one single() call
  admin._mockChainable.single.mockResolvedValueOnce({
    data: {
      id: userId,
      organisation_id: organisationId,
      is_admin: isAdmin,
      role: isAdmin ? "admin" : "owner",
    },
    error: null,
  });
}

/**
 * Reset all Supabase mock return values to defaults.
 */
export function resetSupabaseMocks() {
  const admin = getMockAdmin();
  const chain = admin._mockChainable;

  admin.auth.getUser.mockReset();
  admin.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  admin.auth.admin.getUserById.mockReset();
  admin.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: null });

  // Reset terminal methods
  chain.single.mockReset();
  chain.single.mockResolvedValue({ data: null, error: null });
  chain.range.mockReset();
  chain.range.mockResolvedValue({ data: [], error: null, count: 0 });
  chain.limit.mockReset();
  chain.limit.mockResolvedValue({ data: [], error: null });

  // Reset chain methods to return chainable
  const chainMethodNames = ["select", "insert", "update", "delete", "upsert", "eq", "neq", "in", "gte", "lte", "ilike", "order"];
  for (const name of chainMethodNames) {
    const fn = chain[name]!;
    fn.mockReset();
    fn.mockReturnValue(chain);
  }

  // Reset the raw await results
  admin._resetAwaitResults();
}

/**
 * Queue a mockResolvedValueOnce for the next single() call.
 */
export function mockSupabaseQueryResult(data: unknown, error: unknown = null) {
  getMockAdmin()._mockChainable.single.mockResolvedValueOnce({ data, error });
}

/**
 * Queue a mock result for a query that ends with range().
 */
export function mockSupabaseRangeResult(data: unknown[], error: unknown = null, count: number | null = null) {
  getMockAdmin()._mockChainable.range.mockResolvedValueOnce({ data, error, count: count ?? data.length });
}

/**
 * Queue a mock result for a query that is awaited directly (no terminal like .single()).
 */
export function mockSupabaseAwaitResult(data: unknown, error: unknown = null) {
  getMockAdmin()._queueAwaitResult({ data, error });
}

/**
 * Queue a mock result for limit() terminal calls.
 */
export function mockSupabaseLimitResult(data: unknown[], error: unknown = null) {
  getMockAdmin()._mockChainable.limit.mockResolvedValueOnce({ data, error });
}
