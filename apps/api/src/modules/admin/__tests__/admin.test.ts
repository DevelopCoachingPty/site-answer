import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseQueryResult, mockSupabaseRangeResult, mockSupabaseAwaitResult, mockSupabaseLimitResult } from "../../../__tests__/helpers.js";
import adminRoutes from "../admin.routes.js";
import type { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../../../lib/supabase.js";

// Mock ElevenLabs client to prevent real API calls
vi.mock("../../elevenlabs/elevenlabs.client.js", () => ({
  provisionAgent: vi.fn().mockResolvedValue("agent-123"),
  createAgent: vi.fn().mockResolvedValue("agent-123"),
  updateAgentPrompt: vi.fn().mockResolvedValue(undefined),
}));

describe("Admin Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(adminRoutes, { prefix: "/admin" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetSupabaseMocks();
  });

  describe("Auth Guards", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin/organisations",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1", isAdmin: false });

      const res = await app.inject({
        method: "GET",
        url: "/admin/organisations",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /admin/organisations", () => {
    it("returns paginated list of organisations", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseRangeResult(
        [
          { id: "org-1", name: "Test Org 1", is_active: true },
          { id: "org-2", name: "Test Org 2", is_active: false },
        ],
        null,
        2,
      );

      const res = await app.inject({
        method: "GET",
        url: "/admin/organisations",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });
  });

  describe("GET /admin/organisations/:id", () => {
    it("returns organisation details", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Test Org",
        builder_name: "John",
        is_active: true,
        phone_number: "+61400000000",
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin/organisations/12345678-1234-1234-1234-123456789abc",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("Test Org");
    });

    it("rejects invalid UUID format", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });

      const res = await app.inject({
        method: "GET",
        url: "/admin/organisations/not-a-uuid",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /admin/organisations", () => {
    it("creates a new organisation", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });

      // Mock auth.admin.createUser to return a valid user
      const mockAdmin = supabaseAdmin as unknown as {
        auth: { admin: { createUser: ReturnType<typeof vi.fn>; generateLink: ReturnType<typeof vi.fn> } };
      };
      mockAdmin.auth.admin.createUser.mockResolvedValueOnce({
        data: { user: { id: "new-user-id", email: "jane@builder.com" } },
        error: null,
      });

      // Mock generateLink for invite email (dynamic import)
      if (!mockAdmin.auth.admin.generateLink) {
        mockAdmin.auth.admin.generateLink = vi.fn();
      }
      mockAdmin.auth.admin.generateLink.mockResolvedValueOnce({
        data: { properties: { hashed_token: "test-token" } },
        error: null,
      });

      // Mock createOrganisation result
      mockSupabaseQueryResult({
        id: "org-new",
        name: "New Builder Co",
        builder_name: "Jane",
        is_active: true,
        slug: "new-builder-co",
      });

      const res = await app.inject({
        method: "POST",
        url: "/admin/organisations",
        headers: { authorization: "Bearer test-token" },
        payload: {
          name: "New Builder Co",
          builder_name: "Jane",
          email: "jane@builder.com",
          phone_number: "+61400000001",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("New Builder Co");
    });

    it("validates required fields", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });

      const res = await app.inject({
        method: "POST",
        url: "/admin/organisations",
        headers: { authorization: "Bearer test-token" },
        payload: { name: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /admin/organisations/:id/status", () => {
    it("activates an organisation", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Test Org",
        is_active: true,
        activated_at: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "PUT",
        url: "/admin/organisations/12345678-1234-1234-1234-123456789abc/status",
        headers: { authorization: "Bearer test-token" },
        payload: { is_active: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.is_active).toBe(true);
    });

    it("deactivates an organisation", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Test Org",
        is_active: false,
        deactivated_at: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "PUT",
        url: "/admin/organisations/12345678-1234-1234-1234-123456789abc/status",
        headers: { authorization: "Bearer test-token" },
        payload: { is_active: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.is_active).toBe(false);
    });
  });

  describe("GET /admin/usage", () => {
    it("returns global usage stats", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseAwaitResult([
        { total_calls: 50, total_minutes: "200.5", new_contacts_created: 10 },
        { total_calls: 30, total_minutes: "100.0", new_contacts_created: 5 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/admin/usage",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total_calls).toBe(80);
      expect(body.member_count).toBe(2);
      expect(typeof body.elevenlabs_cost).toBe("number");
    });
  });

  describe("GET /admin/alerts", () => {
    it("returns unresolved alerts", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseLimitResult([
        { id: "alert-1", type: "usage_limit_warning", message: "Org nearing limit", is_read: false },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/admin/alerts",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
    });

    it("returns empty array when no alerts", async () => {
      mockAuthenticatedUser({ userId: "admin-1", organisationId: "org-1", isAdmin: true });
      mockSupabaseLimitResult([]);

      const res = await app.inject({
        method: "GET",
        url: "/admin/alerts",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(0);
    });
  });
});
