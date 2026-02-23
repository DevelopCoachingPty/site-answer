import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
  mockSupabaseRangeResult,
} from "../../../__tests__/helpers.js";
import callRoutes from "../calls.routes.js";

describe("Calls Routes", () => {
  let app: FastifyInstance;
  const AUTH_HEADER = "Bearer test-jwt-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(callRoutes, { prefix: "/calls" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("GET /calls", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/calls",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 without organisation", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const response = await app.inject({
        method: "GET",
        url: "/calls",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns paginated call list when authenticated", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      mockSupabaseRangeResult(
        [
          {
            id: "call-1",
            organisation_id: "org-1",
            caller_number: "+61400000000",
            status: "completed",
            flow_type: "new_inquiry",
            duration_seconds: 120,
            created_at: "2025-01-15T10:00:00Z",
          },
        ],
        null,
        1,
      );

      const response = await app.inject({
        method: "GET",
        url: "/calls?page=1&limit=10",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
    });
  });

  describe("GET /calls/stats", () => {
    it("returns call statistics", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      // getCallStats makes two range queries (today + this week)
      mockSupabaseRangeResult([], null, 5);
      mockSupabaseRangeResult([], null, 15);

      const response = await app.inject({
        method: "GET",
        url: "/calls/stats",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /calls/:id", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/calls/00000000-0000-0000-0000-000000000001",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns call detail when found", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      mockSupabaseQueryResult({
        id: "00000000-0000-0000-0000-000000000001",
        organisation_id: "org-1",
        caller_number: "+61400000000",
        status: "completed",
        flow_type: "new_inquiry",
        duration_seconds: 120,
        call_actions: [],
      });

      const response = await app.inject({
        method: "GET",
        url: "/calls/00000000-0000-0000-0000-000000000001",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveProperty("id");
    });
  });
});
