import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
} from "../../../__tests__/helpers.js";
import type { FastifyInstance } from "fastify";

vi.mock("../ghl.client.js", () => ({
  getOAuthAuthorizeUrl: vi.fn().mockReturnValue("https://marketplace.gohighlevel.com/oauth/chooselocation?test=1"),
  exchangeCodeForTokens: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  checkConnection: vi.fn(),
  clearTokens: vi.fn().mockResolvedValue(undefined),
}));

import * as ghlClient from "../ghl.client.js";
import ghlRoutes from "../ghl.routes.js";

describe("GHL Routes", () => {
  let app: FastifyInstance;
  const AUTH = "Bearer test-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(ghlRoutes, { prefix: "/ghl" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("Auth Guards", () => {
    it("returns 401 without auth on /status", async () => {
      const res = await app.inject({ method: "GET", url: "/ghl/status" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 without org membership", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const res = await app.inject({
        method: "GET",
        url: "/ghl/status",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /ghl/oauth/authorize", () => {
    it("returns GHL OAuth URL", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/ghl/oauth/authorize",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toContain("gohighlevel.com");
    });
  });

  describe("GET /ghl/oauth/callback", () => {
    it("exchanges code and stores tokens", async () => {
      vi.mocked(ghlClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "ghl-access",
        refresh_token: "ghl-refresh",
        locationId: "loc-123",
        expires_in: 86400,
      } as never);

      const res = await app.inject({
        method: "GET",
        url: "/ghl/oauth/callback?code=test-code&state=org-1",
      });

      expect(res.statusCode).toBe(302);
      expect(vi.mocked(ghlClient.storeTokens)).toHaveBeenCalledWith("org-1", "ghl-access", "ghl-refresh");
    });

    it("returns 400 when state missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/ghl/oauth/callback?code=test-code",
      });

      // state is optional in schema, handler checks for it
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /ghl/status", () => {
    it("returns connected true", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(ghlClient.checkConnection).mockResolvedValue(true as never);

      const res = await app.inject({
        method: "GET",
        url: "/ghl/status",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ connected: true });
    });

    it("returns connected false", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(ghlClient.checkConnection).mockResolvedValue(false as never);

      const res = await app.inject({
        method: "GET",
        url: "/ghl/status",
        headers: { authorization: AUTH },
      });

      expect(JSON.parse(res.payload)).toEqual({ connected: false });
    });
  });

  describe("DELETE /ghl/disconnect", () => {
    it("clears tokens and returns success", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "DELETE",
        url: "/ghl/disconnect",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).message).toBe("GoHighLevel disconnected");
      expect(vi.mocked(ghlClient.clearTokens)).toHaveBeenCalledWith("org-1");
    });
  });
});
