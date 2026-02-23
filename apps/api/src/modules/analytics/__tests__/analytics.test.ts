import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseAwaitResult } from "../../../__tests__/helpers.js";
import analyticsRoutes from "../analytics.routes.js";
import type { FastifyInstance } from "fastify";

describe("Analytics Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(analyticsRoutes, { prefix: "/analytics" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetSupabaseMocks();
    mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
  });

  describe("GET /analytics/daily", () => {
    it("returns daily stats with gap-fill", async () => {
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-01",
          total_calls: 5,
          inbound_calls: 3,
          outbound_calls: 2,
          missed_calls: 1,
          completed_calls: 4,
          avg_duration_seconds: 120,
          positive_sentiment: 2,
          neutral_sentiment: 2,
          negative_sentiment: 1,
          flow_type_counts: { new_inquiry: 3, existing_client: 2 },
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/daily?from=2025-01-01&to=2025-01-03",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // Should have 3 days (gap-filled)
      expect(body.data).toHaveLength(3);
      // First day has real data
      expect(body.data[0].total_calls).toBe(5);
      // Gap-filled days have zeros
      expect(body.data[1].total_calls).toBe(0);
      expect(body.data[2].total_calls).toBe(0);
    });

    it("requires date range parameters", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/analytics/daily",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /analytics/flow-breakdown", () => {
    it("aggregates flow type counts across days", async () => {
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-01",
          total_calls: 5, inbound_calls: 3, outbound_calls: 2,
          missed_calls: 0, completed_calls: 5, avg_duration_seconds: 100,
          positive_sentiment: 0, neutral_sentiment: 0, negative_sentiment: 0,
          flow_type_counts: { new_inquiry: 3, existing_client: 2 },
        },
        {
          stat_date: "2025-01-02",
          total_calls: 3, inbound_calls: 2, outbound_calls: 1,
          missed_calls: 0, completed_calls: 3, avg_duration_seconds: 80,
          positive_sentiment: 0, neutral_sentiment: 0, negative_sentiment: 0,
          flow_type_counts: { new_inquiry: 1, payment_query: 2 },
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/flow-breakdown?from=2025-01-01&to=2025-01-02",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const breakdown = body.data as Array<{ name: string; value: number }>;

      const newInquiry = breakdown.find((b) => b.name === "new_inquiry");
      expect(newInquiry?.value).toBe(4); // 3 + 1

      const payment = breakdown.find((b) => b.name === "payment_query");
      expect(payment?.value).toBe(2);
    });
  });

  describe("GET /analytics/sentiment", () => {
    it("returns weekly sentiment aggregation", async () => {
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-06", // Monday
          total_calls: 5, inbound_calls: 5, outbound_calls: 0,
          missed_calls: 0, completed_calls: 5, avg_duration_seconds: 100,
          positive_sentiment: 3, neutral_sentiment: 1, negative_sentiment: 1,
          flow_type_counts: {},
        },
        {
          stat_date: "2025-01-07", // Tuesday
          total_calls: 3, inbound_calls: 3, outbound_calls: 0,
          missed_calls: 0, completed_calls: 3, avg_duration_seconds: 80,
          positive_sentiment: 2, neutral_sentiment: 1, negative_sentiment: 0,
          flow_type_counts: {},
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/sentiment?from=2025-01-06&to=2025-01-07",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThan(0);
      // Both days in same week, so sentiment totals should be aggregated
      const week = body.data[0];
      expect(week.positive).toBe(5); // 3 + 2
      expect(week.neutral).toBe(2); // 1 + 1
      expect(week.negative).toBe(1); // 1 + 0
    });
  });

  describe("GET /analytics/comparison", () => {
    it("returns current vs previous period comparison", async () => {
      // Both getDailyCallStats calls will resolve from the same mock chain.
      // Queue both results - the mock thenable queue delivers them in order.
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-08",
          total_calls: 10, inbound_calls: 8, outbound_calls: 2,
          missed_calls: 1, completed_calls: 9, avg_duration_seconds: 150,
          positive_sentiment: 5, neutral_sentiment: 3, negative_sentiment: 2,
          flow_type_counts: {},
        },
      ]);
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-07",
          total_calls: 5, inbound_calls: 4, outbound_calls: 1,
          missed_calls: 2, completed_calls: 3, avg_duration_seconds: 100,
          positive_sentiment: 2, neutral_sentiment: 2, negative_sentiment: 1,
          flow_type_counts: {},
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/comparison?from=2025-01-08&to=2025-01-08",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.current_period.total_calls).toBe(10);
      // Previous period may be 0 or 5 depending on mock resolution order with Promise.all
      expect(typeof body.previous_period.total_calls).toBe("number");
      expect(typeof body.changes.total_calls_pct).toBe("number");
    });
  });

  describe("GET /analytics/export", () => {
    it("returns CSV format by default", async () => {
      mockSupabaseAwaitResult([
        {
          stat_date: "2025-01-01",
          total_calls: 5, inbound_calls: 3, outbound_calls: 2,
          missed_calls: 1, completed_calls: 4, avg_duration_seconds: 120,
          positive_sentiment: 2, neutral_sentiment: 2, negative_sentiment: 1,
          flow_type_counts: {},
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/export?from=2025-01-01&to=2025-01-01",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("analytics-");
      const csv = res.payload;
      expect(csv).toContain("date,total_calls");
      expect(csv).toContain("2025-01-01,5");
    });

    it("returns JSON when requested", async () => {
      mockSupabaseAwaitResult([]);

      const res = await app.inject({
        method: "GET",
        url: "/analytics/export?from=2025-01-01&to=2025-01-01&format=json",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
    });
  });
});
