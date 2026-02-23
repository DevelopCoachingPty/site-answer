import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
} from "../../../__tests__/helpers.js";

// Mock ElevenLabs client to prevent real API calls
vi.mock("../../elevenlabs/elevenlabs.client.js", () => ({
  createTestCall: vi.fn().mockResolvedValue({ conversation_id: "conv-123" }),
  provisionAgent: vi.fn().mockResolvedValue("agent-123"),
}));

import orgRoutes from "../org.routes.js";

describe("Organisation Routes", () => {
  let app: FastifyInstance;
  const AUTH_HEADER = "Bearer test-jwt-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(orgRoutes, { prefix: "/organisations" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("GET /organisations", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/organisations",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 without organisation membership", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const response = await app.inject({
        method: "GET",
        url: "/organisations",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns organisation data with encrypted fields stripped", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      // The org.service.getOrganisation query
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Bob's Building Co",
        slug: "bobs-building-co-abc",
        builder_name: "Bob",
        phone_number: "+61400000000",
        timezone: "Australia/Sydney",
        is_active: true,
        ghl_access_token_encrypted: "encrypted-token",
        ghl_refresh_token_encrypted: "encrypted-refresh",
        calendar_credentials_encrypted: null,
        accounting_credentials_encrypted: null,
      });

      const response = await app.inject({
        method: "GET",
        url: "/organisations",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe("Bob's Building Co");
      expect(body.data.ghl_connected).toBe(true);
      expect(body.data.calendar_connected).toBe(false);
      // Encrypted fields should be stripped
      expect(body.data).not.toHaveProperty("ghl_access_token_encrypted");
      expect(body.data).not.toHaveProperty("ghl_refresh_token_encrypted");
    });
  });

  describe("PATCH /organisations", () => {
    it("updates organisation settings", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      // updateOrganisation query
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Bob's Building Updated",
        builder_name: "Bob",
        timezone: "Australia/Melbourne",
        is_active: true,
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/organisations",
        headers: { authorization: AUTH_HEADER },
        payload: {
          name: "Bob's Building Updated",
          timezone: "Australia/Melbourne",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe("Bob's Building Updated");
    });
  });

  describe("POST /organisations/test-call", () => {
    it("returns 400 when no agent is provisioned", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      // Mock org lookup returning no agent_id (default mock returns null data)
      mockSupabaseQueryResult({
        elevenlabs_agent_id: null,
        name: "Test Org",
        phone_number: "+61400000000",
      });

      const response = await app.inject({
        method: "POST",
        url: "/organisations/test-call",
        headers: { authorization: AUTH_HEADER },
        payload: { phone_number: "+61400000000" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("AGENT_NOT_PROVISIONED");
    });

    it("returns 400 with empty phone number", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const response = await app.inject({
        method: "POST",
        url: "/organisations/test-call",
        headers: { authorization: AUTH_HEADER },
        payload: { phone_number: "" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
