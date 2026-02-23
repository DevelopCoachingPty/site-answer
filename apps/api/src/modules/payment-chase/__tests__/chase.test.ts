import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseRangeResult, mockSupabaseQueryResult, mockSupabaseAwaitResult } from "../../../__tests__/helpers.js";
import chaseRoutes from "../chase.routes.js";
import { calculateNextChaseDate } from "../chase.service.js";

let app: FastifyInstance;

const CHASE_PREFIX = "/api/v1/payment-chase";

beforeAll(async () => {
  app = await buildTestServer();
  await app.register(chaseRoutes, { prefix: CHASE_PREFIX });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetSupabaseMocks();
});

describe("Payment Chase Routes", () => {
  describe("GET /payment-chase", () => {
    it("returns paginated chase items", async () => {
      mockAuthenticatedUser({});
      mockSupabaseRangeResult(
        [
          {
            id: "chase-1",
            organisation_id: "test-org-id",
            contact_name: "John Doe",
            contact_phone: "+61400000001",
            invoice_reference: "INV-001",
            amount_due: 1500.0,
            status: "pending",
            chase_count: 0,
          },
        ],
        null,
        1,
      );

      const res = await app.inject({
        method: "GET",
        url: CHASE_PREFIX,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].contact_name).toBe("John Doe");
      expect(body.total).toBe(1);
    });

    it("filters by status", async () => {
      mockAuthenticatedUser({});
      mockSupabaseRangeResult([], null, 0);

      const res = await app.inject({
        method: "GET",
        url: `${CHASE_PREFIX}?status=promised`,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });
  });

  describe("GET /payment-chase/stats", () => {
    it("returns chase statistics", async () => {
      mockAuthenticatedUser({});
      mockSupabaseAwaitResult([
        { status: "pending", amount_due: 1000 },
        { status: "pending", amount_due: 500 },
        { status: "promised", amount_due: 2000 },
        { status: "paid", amount_due: 800 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${CHASE_PREFIX}/stats`,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pending).toBe(2);
      expect(body.promised).toBe(1);
      expect(body.paid).toBe(1);
      expect(body.outstanding_value).toBe(3500);
      expect(body.recovered_value).toBe(800);
    });
  });

  describe("GET /payment-chase/:id", () => {
    it("returns chase item with call history", async () => {
      mockAuthenticatedUser({});
      // Chase item lookup
      mockSupabaseQueryResult({
        id: "chase-1",
        organisation_id: "test-org-id",
        contact_name: "Jane Smith",
        contact_phone: "+61400000002",
        status: "in_progress",
        chase_count: 2,
      });
      // Linked calls lookup
      mockSupabaseAwaitResult([
        { id: "call-1", status: "completed", direction: "outbound" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${CHASE_PREFIX}/00000000-0000-0000-0000-000000000001`,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.contact_name).toBe("Jane Smith");
      expect(body.data.calls).toHaveLength(1);
    });

    it("returns 404 for missing item", async () => {
      mockAuthenticatedUser({});
      mockSupabaseQueryResult(null, { message: "not found", code: "PGRST116" });

      const res = await app.inject({
        method: "GET",
        url: `${CHASE_PREFIX}/00000000-0000-0000-0000-000000000099`,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /payment-chase", () => {
    it("creates a chase item", async () => {
      mockAuthenticatedUser({});
      mockSupabaseQueryResult({
        id: "chase-new",
        organisation_id: "test-org-id",
        contact_name: "New Contact",
        contact_phone: "+61400000003",
        status: "pending",
        chase_count: 0,
      });

      const res = await app.inject({
        method: "POST",
        url: CHASE_PREFIX,
        headers: { authorization: "Bearer test-token" },
        payload: {
          contact_name: "New Contact",
          contact_phone: "+61400000003",
          invoice_reference: "INV-099",
          amount_due: 2500,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.contact_name).toBe("New Contact");
    });

    it("rejects missing required fields", async () => {
      mockAuthenticatedUser({});

      const res = await app.inject({
        method: "POST",
        url: CHASE_PREFIX,
        headers: { authorization: "Bearer test-token" },
        payload: { contact_name: "No Phone" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /payment-chase/bulk", () => {
    it("bulk creates chase items", async () => {
      mockAuthenticatedUser({});
      mockSupabaseAwaitResult([
        { id: "bulk-1", contact_name: "Contact A" },
        { id: "bulk-2", contact_name: "Contact B" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: `${CHASE_PREFIX}/bulk`,
        headers: { authorization: "Bearer test-token" },
        payload: {
          items: [
            { contact_name: "Contact A", contact_phone: "+61400000004" },
            { contact_name: "Contact B", contact_phone: "+61400000005" },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().count).toBe(2);
    });
  });

  describe("PATCH /payment-chase/:id", () => {
    it("updates chase item status", async () => {
      mockAuthenticatedUser({});
      // Ownership check
      mockSupabaseQueryResult({ id: "chase-1" });
      // Updated result
      mockSupabaseQueryResult({
        id: "chase-1",
        status: "promised",
        promise_date: "2026-03-01",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `${CHASE_PREFIX}/00000000-0000-0000-0000-000000000001`,
        headers: { authorization: "Bearer test-token" },
        payload: { status: "promised", promise_date: "2026-03-01" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe("promised");
    });
  });

  describe("DELETE /payment-chase/:id", () => {
    it("deletes a chase item", async () => {
      mockAuthenticatedUser({});

      const res = await app.inject({
        method: "DELETE",
        url: `${CHASE_PREFIX}/00000000-0000-0000-0000-000000000001`,
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(204);
    });
  });
});

describe("calculateNextChaseDate", () => {
  it("escalates: day 1, 3, 7, 14, 30", () => {
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    const date0 = calculateNextChaseDate(0);
    expect(date0.getTime()).toBeGreaterThanOrEqual(now + 1 * MS_PER_DAY - 1000);
    expect(date0.getTime()).toBeLessThanOrEqual(now + 1 * MS_PER_DAY + 1000);

    const date1 = calculateNextChaseDate(1);
    expect(date1.getTime()).toBeGreaterThanOrEqual(now + 3 * MS_PER_DAY - 1000);

    const date2 = calculateNextChaseDate(2);
    expect(date2.getTime()).toBeGreaterThanOrEqual(now + 7 * MS_PER_DAY - 1000);

    const date3 = calculateNextChaseDate(3);
    expect(date3.getTime()).toBeGreaterThanOrEqual(now + 14 * MS_PER_DAY - 1000);

    const date4 = calculateNextChaseDate(4);
    expect(date4.getTime()).toBeGreaterThanOrEqual(now + 30 * MS_PER_DAY - 1000);
  });

  it("caps at 30 days for high chase counts", () => {
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    const date10 = calculateNextChaseDate(10);
    expect(date10.getTime()).toBeGreaterThanOrEqual(now + 30 * MS_PER_DAY - 1000);
    expect(date10.getTime()).toBeLessThanOrEqual(now + 30 * MS_PER_DAY + 1000);
  });
});
