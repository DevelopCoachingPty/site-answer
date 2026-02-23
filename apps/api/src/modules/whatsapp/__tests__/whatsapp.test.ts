import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseQueryResult, mockSupabaseRangeResult, mockSupabaseAwaitResult } from "../../../__tests__/helpers.js";
import whatsappRoutes from "../whatsapp.routes.js";
import type { FastifyInstance } from "fastify";

describe("WhatsApp Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(whatsappRoutes, { prefix: "/whatsapp" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetSupabaseMocks();
    mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
  });

  describe("GET /whatsapp/templates", () => {
    it("lists templates for the organisation", async () => {
      mockSupabaseAwaitResult([
        {
          id: "tmpl-1",
          organisation_id: "org-1",
          name: "Booking Confirmation",
          template_type: "booking_confirmation",
          body_template: "Hi {contact_name}, your appointment is confirmed for {datetime}.",
          is_active: true,
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/whatsapp/templates",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Booking Confirmation");
    });
  });

  describe("POST /whatsapp/templates", () => {
    it("creates a new template", async () => {
      mockSupabaseQueryResult({
        id: "tmpl-new",
        organisation_id: "org-1",
        name: "Payment Reminder",
        template_type: "payment_reminder",
        body_template: "Hi {contact_name}, a reminder about invoice {invoice_ref}.",
        is_active: true,
      });

      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/templates",
        headers: { authorization: "Bearer test-token" },
        payload: {
          name: "Payment Reminder",
          template_type: "payment_reminder",
          body_template: "Hi {contact_name}, a reminder about invoice {invoice_ref}.",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("Payment Reminder");
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/templates",
        headers: { authorization: "Bearer test-token" },
        payload: { name: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /whatsapp/templates/:id", () => {
    it("deletes a template", async () => {
      mockSupabaseAwaitResult(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/whatsapp/templates/12345678-1234-1234-1234-123456789abc",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(204);
    });
  });

  describe("GET /whatsapp/messages", () => {
    it("returns message history with pagination", async () => {
      mockSupabaseRangeResult(
        [
          {
            id: "msg-1",
            organisation_id: "org-1",
            to_number: "+61412345678",
            body: "Test message",
            status: "delivered",
            error_message: null,
            created_at: "2025-01-01T10:00:00Z",
          },
        ],
        null,
        1,
      );

      const res = await app.inject({
        method: "GET",
        url: "/whatsapp/messages",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
    });

    it("accepts pagination parameters", async () => {
      mockSupabaseRangeResult([], null, 0);

      const res = await app.inject({
        method: "GET",
        url: "/whatsapp/messages?page=2&limit=10",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
    });
  });

  describe("POST /whatsapp/send", () => {
    it("sends a freeform message", async () => {
      // Mock org lookup for whatsapp settings
      mockSupabaseQueryResult({
        whatsapp_enabled: true,
        whatsapp_phone_number: "+61400000000",
      });

      // Mock message insert
      mockSupabaseQueryResult({
        id: "msg-new",
        organisation_id: "org-1",
        to_number: "+61412345678",
        body: "Hello from SiteAnswer",
        status: "queued",
      });

      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/send",
        headers: { authorization: "Bearer test-token" },
        payload: {
          to: "+61412345678",
          body: "Hello from SiteAnswer",
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/send",
        headers: { authorization: "Bearer test-token" },
        payload: { to: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /whatsapp/test", () => {
    it("sends a test message with [TEST] prefix", async () => {
      mockSupabaseQueryResult({
        whatsapp_enabled: true,
        whatsapp_phone_number: "+61400000000",
      });
      mockSupabaseQueryResult({
        id: "msg-test",
        organisation_id: "org-1",
        to_number: "+61412345678",
        body: "[TEST] Hello",
        status: "queued",
      });

      const res = await app.inject({
        method: "POST",
        url: "/whatsapp/test",
        headers: { authorization: "Bearer test-token" },
        payload: {
          to: "+61412345678",
          body: "Hello",
        },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
