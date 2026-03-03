import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
  mockSupabaseAwaitResult,
} from "../../../__tests__/helpers.js";
import type { FastifyInstance } from "fastify";

vi.mock("../xero.client.js", () => ({
  getOAuthAuthorizeUrl: vi.fn().mockReturnValue("https://login.xero.com/identity/connect/authorize?test=1"),
  exchangeCodeForTokens: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../quickbooks.client.js", () => ({
  getOAuthAuthorizeUrl: vi.fn().mockReturnValue("https://appcenter.intuit.com/connect/oauth2?test=1"),
  exchangeCodeForTokens: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

import * as xeroClient from "../xero.client.js";
import * as qbClient from "../quickbooks.client.js";
import accountingRoutes from "../accounting.routes.js";

describe("Accounting Routes", () => {
  let app: FastifyInstance;
  const AUTH = "Bearer test-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(accountingRoutes, { prefix: "/accounting" });
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
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/accounting/status" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 without org membership", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const res = await app.inject({
        method: "GET",
        url: "/accounting/status",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /accounting/oauth/authorize", () => {
    it("returns Xero OAuth URL", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/accounting/oauth/authorize?provider=xero",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toContain("xero.com");
    });

    it("returns QuickBooks OAuth URL", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/accounting/oauth/authorize?provider=quickbooks",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toContain("intuit.com");
    });
  });

  describe("GET /accounting/oauth/callback", () => {
    it("exchanges Xero code for tokens", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(xeroClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "xero-access",
        refresh_token: "xero-refresh",
        expires_in: 1800,
      } as never);

      const res = await app.inject({
        method: "GET",
        url: "/accounting/oauth/callback?code=auth-code&state=xero:org-1",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ success: true, provider: "xero" });
      expect(vi.mocked(xeroClient.storeTokens)).toHaveBeenCalled();
    });

    it("returns 400 for invalid state", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/accounting/oauth/callback?code=auth-code&state=invalid",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 500 on token exchange error", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(xeroClient.exchangeCodeForTokens).mockRejectedValue(new Error("OAuth failed"));

      const res = await app.inject({
        method: "GET",
        url: "/accounting/oauth/callback?code=bad-code&state=xero:org-1",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe("GET /accounting/status", () => {
    it("returns connected with last sync info", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({
        accounting_type: "xero",
        accounting_token_expires_at: "2025-02-01T00:00:00Z",
        accounting_tenant_id: "tenant-1",
      });
      mockSupabaseAwaitResult([
        { status: "completed", invoices_found: 10, invoices_synced: 8, completed_at: "2025-01-15T12:00:00Z" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/accounting/status",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.connected).toBe(true);
      expect(body.provider).toBe("xero");
      expect(body.last_sync.invoices_found).toBe(10);
    });

    it("returns not connected when no accounting type", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({ accounting_type: null });

      const res = await app.inject({
        method: "GET",
        url: "/accounting/status",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ connected: false });
    });
  });

  describe("POST /accounting/sync", () => {
    it("returns 501 (Phase 2 feature)", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "POST",
        url: "/accounting/sync",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(501);
      expect(JSON.parse(res.payload)).toEqual({ error: "Automatic invoice sync will be available in Phase 2" });
    });
  });

  describe("GET /accounting/sync/history", () => {
    it("returns sync log entries", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseAwaitResult([
        { id: "log-1", status: "completed", invoices_found: 5, invoices_synced: 5 },
        { id: "log-2", status: "failed", invoices_found: 0, invoices_synced: 0 },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/accounting/sync/history",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
    });
  });

  describe("DELETE /accounting/disconnect", () => {
    it("disconnects Xero", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({ accounting_type: "xero" });

      const res = await app.inject({
        method: "DELETE",
        url: "/accounting/disconnect",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(204);
      expect(vi.mocked(xeroClient.disconnect)).toHaveBeenCalledWith("org-1");
    });

    it("disconnects QuickBooks", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({ accounting_type: "quickbooks" });

      const res = await app.inject({
        method: "DELETE",
        url: "/accounting/disconnect",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(204);
      expect(vi.mocked(qbClient.disconnect)).toHaveBeenCalledWith("org-1");
    });
  });
});
