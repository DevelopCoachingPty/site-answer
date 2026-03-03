import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
} from "../../../__tests__/helpers.js";
import authRoutes from "../auth.routes.js";

// Mock the email validation module for check-email tests
vi.mock("../../../lib/email-validation.js", () => ({
  validateEmailDomain: vi.fn(),
}));

import { validateEmailDomain } from "../../../lib/email-validation.js";
const mockValidateEmailDomain = validateEmailDomain as ReturnType<typeof vi.fn>;

describe("Auth Routes", () => {
  let app: FastifyInstance;
  const AUTH_HEADER = "Bearer test-jwt-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(authRoutes, { prefix: "/auth" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("POST /auth/check-email", () => {
    it("returns 200 for valid email domain", async () => {
      mockValidateEmailDomain.mockResolvedValue({ valid: true });

      const response = await app.inject({
        method: "POST",
        url: "/auth/check-email",
        payload: { email: "user@gmail.com" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ valid: true });
    });

    it("returns 422 for invalid email domain", async () => {
      mockValidateEmailDomain.mockResolvedValue({
        valid: false,
        reason: "Email domain does not exist or cannot receive mail",
      });

      const response = await app.inject({
        method: "POST",
        url: "/auth/check-email",
        payload: { email: "user@doesnotexist12345.com" },
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.error).toBe("INVALID_EMAIL_DOMAIN");
    });

    it("returns 400 for malformed email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/check-email",
        payload: { email: "not-an-email" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("does not require authentication", async () => {
      mockValidateEmailDomain.mockResolvedValue({ valid: true });

      const response = await app.inject({
        method: "POST",
        url: "/auth/check-email",
        payload: { email: "user@example.com" },
      });

      // Should not be 401 - no auth header needed
      expect(response.statusCode).not.toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("returns 401 without auth header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      // Default: auth.getUser returns null user
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns user profile when authenticated", async () => {
      // First single() call: auth plugin profile lookup
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      // Second single() call: /me handler's user query
      mockSupabaseQueryResult({
        id: "user-1",
        email: "builder@example.com",
        full_name: "Bob Builder",
        organisation_id: "org-1",
        is_admin: false,
        role: "owner",
      });

      // Third single() call: /me handler's organisation query
      mockSupabaseQueryResult({
        id: "org-1",
        name: "Bob's Building Co",
        slug: "bobs-building-co-abc123",
        is_active: true,
        ghl_access_token_encrypted: null,
        ghl_refresh_token_encrypted: null,
        calendar_credentials_encrypted: null,
        accounting_credentials_encrypted: null,
      });

      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveProperty("user");
      expect(body.data).toHaveProperty("organisation");
    });

    it("returns 404 when user profile not found", async () => {
      // Auth plugin profile lookup succeeds
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      // /me handler's user query returns null
      mockSupabaseQueryResult(null);

      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /auth/setup-profile", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/setup-profile",
        payload: { full_name: "Test", company_name: "Test Co" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 with invalid body", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const response = await app.inject({
        method: "POST",
        url: "/auth/setup-profile",
        headers: { authorization: AUTH_HEADER },
        payload: { full_name: "" }, // missing company_name, empty full_name
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
