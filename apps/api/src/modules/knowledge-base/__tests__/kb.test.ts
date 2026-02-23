import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
  mockSupabaseAwaitResult,
} from "../../../__tests__/helpers.js";
import kbRoutes from "../kb.routes.js";

describe("Knowledge Base Routes", () => {
  let app: FastifyInstance;
  const AUTH_HEADER = "Bearer test-jwt-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(kbRoutes, { prefix: "/knowledge-base" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("GET /knowledge-base", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/knowledge-base",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 403 without organisation", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const response = await app.inject({
        method: "GET",
        url: "/knowledge-base",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns knowledge base entries", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      mockSupabaseAwaitResult([
        { id: "kb-1", category: "services", title: "Renovations", content: "We do full home renovations", is_active: true },
        { id: "kb-2", category: "pricing", title: "Hourly Rate", content: "$85/hr + GST", is_active: true },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/knowledge-base",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
    });
  });

  describe("POST /knowledge-base", () => {
    it("creates a new entry", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      mockSupabaseQueryResult({
        id: "kb-new",
        organisation_id: "org-1",
        category: "services",
        title: "Decking",
        content: "Timber and composite decking",
        is_active: true,
      });

      const response = await app.inject({
        method: "POST",
        url: "/knowledge-base",
        headers: { authorization: AUTH_HEADER },
        payload: {
          category: "services",
          title: "Decking",
          content: "Timber and composite decking",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.title).toBe("Decking");
    });

    it("returns 400 with missing fields", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const response = await app.inject({
        method: "POST",
        url: "/knowledge-base",
        headers: { authorization: AUTH_HEADER },
        payload: { category: "services" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PUT /knowledge-base/:id", () => {
    it("updates an existing entry", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      mockSupabaseQueryResult({
        id: "00000000-0000-0000-0000-000000000001",
        organisation_id: "org-1",
        category: "services",
        title: "Updated Decking",
        content: "Updated content",
        is_active: true,
      });

      const response = await app.inject({
        method: "PUT",
        url: "/knowledge-base/00000000-0000-0000-0000-000000000001",
        headers: { authorization: AUTH_HEADER },
        payload: { title: "Updated Decking" },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("DELETE /knowledge-base/:id", () => {
    it("deletes an entry and returns 204", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const response = await app.inject({
        method: "DELETE",
        url: "/knowledge-base/00000000-0000-0000-0000-000000000001",
        headers: { authorization: AUTH_HEADER },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
