import { vi } from "vitest";

// Mock environment variables before any module loads
vi.stubEnv("SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("FRONTEND_URL", "http://localhost:3000");
vi.stubEnv("NODE_ENV", "development");
vi.stubEnv("LOG_LEVEL", "fatal");
vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

// Mock Supabase admin client
vi.mock("../lib/supabase.js", () => {
  // Default result when a query chain is awaited directly (no .single())
  let _awaitResult: { data: unknown; error: unknown; count?: number } = {
    data: null,
    error: null,
  };
  // Stack for mockResolvedValueOnce-style behaviour on raw await
  const _awaitResultQueue: Array<{ data: unknown; error: unknown; count?: number }> = [];

  const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockRange = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });

  // Build chainable object that is also thenable (for queries that don't end with .single())
  const chainable: Record<string, unknown> = {};

  const chainMethods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "gte", "lte", "ilike",
    "order", "limit",
  ];

  for (const method of chainMethods) {
    chainable[method] = vi.fn(() => chainable);
  }

  // Terminal methods that return Promises
  chainable.single = mockSingle;
  chainable.range = mockRange;

  // Make chainable thenable - when `await query` is used without .single()
  chainable.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
    const result = _awaitResultQueue.length > 0 ? _awaitResultQueue.shift()! : _awaitResult;
    return Promise.resolve(result).then(resolve, reject);
  };

  const mockFrom = vi.fn(() => chainable);

  const supabaseAdmin = {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        generateLink: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    },
    _mockFrom: mockFrom,
    _mockChainable: chainable,
    _setAwaitResult: (result: { data: unknown; error: unknown; count?: number }) => {
      _awaitResult = result;
    },
    _queueAwaitResult: (result: { data: unknown; error: unknown; count?: number }) => {
      _awaitResultQueue.push(result);
    },
    _resetAwaitResults: () => {
      _awaitResult = { data: null, error: null };
      _awaitResultQueue.length = 0;
    },
  };

  return { supabaseAdmin, createSupabaseUserClient: vi.fn(() => supabaseAdmin) };
});

// Mock BullMQ (direct import used in health routes)
vi.mock("bullmq", () => {
  const MockQueue = vi.fn().mockImplementation(() => ({
    client: Promise.resolve({}),
    close: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({ id: "test-job-id" }),
  }));
  const MockWorker = vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  }));
  return { Queue: MockQueue, Worker: MockWorker };
});

// Mock BullMQ queue helper
vi.mock("../lib/queue.js", () => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: "test-job-id" }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    createQueue: vi.fn(() => mockQueue),
    getQueue: vi.fn(() => mockQueue),
    getPostCallQueue: vi.fn(() => mockQueue),
    getGhlSyncQueue: vi.fn(() => mockQueue),
    getAgentSyncQueue: vi.fn(() => mockQueue),
    getPaymentChaseQueue: vi.fn(() => mockQueue),
    getInvoiceSyncQueue: vi.fn(() => mockQueue),
    closeQueues: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock audio bridge for health routes
vi.mock("../modules/telephony/audio-bridge.js", () => ({
  getActiveSessionCount: vi.fn(() => 0),
}));
