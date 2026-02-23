import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseQueryResult, mockSupabaseAwaitResult } from "../../../__tests__/helpers.js";
import usageRoutes from "../usage.routes.js";
import type { FastifyInstance } from "fastify";

describe("Usage Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(usageRoutes, { prefix: "/usage" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetSupabaseMocks();
    mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
  });

  describe("GET /usage", () => {
    it("returns existing usage record", async () => {
      mockSupabaseQueryResult({
        id: "usage-1",
        organisation_id: "org-1",
        period_start: "2025-01-01",
        period_end: "2025-01-31",
        total_calls: 42,
        total_minutes: 120.5,
        inbound_calls: 30,
        outbound_calls: 12,
      });

      const res = await app.inject({
        method: "GET",
        url: "/usage",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.total_calls).toBe(42);
    });

    it("creates new usage record when none exists", async () => {
      // First single() returns null (not found)
      mockSupabaseQueryResult(null);
      // Second single() returns the newly created record
      mockSupabaseQueryResult({
        id: "usage-new",
        organisation_id: "org-1",
        total_calls: 0,
        total_minutes: 0,
      });

      const res = await app.inject({
        method: "GET",
        url: "/usage",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.total_calls).toBe(0);
    });
  });

  describe("GET /usage/history", () => {
    it("returns usage history", async () => {
      mockSupabaseAwaitResult([
        { id: "u1", period_start: "2025-01-01", total_calls: 10 },
        { id: "u2", period_start: "2025-02-01", total_calls: 20 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/usage/history",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
    });

    it("accepts months parameter", async () => {
      mockSupabaseAwaitResult([]);

      const res = await app.inject({
        method: "GET",
        url: "/usage/history?months=3",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(0);
    });
  });
});
