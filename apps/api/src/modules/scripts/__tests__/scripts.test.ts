import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildTestServer, mockAuthenticatedUser, resetSupabaseMocks, mockSupabaseQueryResult, mockSupabaseAwaitResult } from "../../../__tests__/helpers.js";
import scriptRoutes from "../scripts.routes.js";
import type { FastifyInstance } from "fastify";

describe("Script Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(scriptRoutes, { prefix: "/scripts" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetSupabaseMocks();
    mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
  });

  describe("GET /scripts", () => {
    it("returns list of scripts", async () => {
      mockSupabaseAwaitResult([
        {
          id: "script-1",
          organisation_id: "org-1",
          flow_type: "new_inquiry",
          name: "New Inquiry",
          system_prompt: "You are a receptionist.",
          is_active: true,
          version: 1,
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/scripts",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].flow_type).toBe("new_inquiry");
    });
  });

  describe("GET /scripts/:id", () => {
    it("returns a single script", async () => {
      mockSupabaseQueryResult({
        id: "script-1",
        organisation_id: "org-1",
        flow_type: "new_inquiry",
        name: "New Inquiry",
        system_prompt: "You are a receptionist.",
        is_active: true,
      });

      const res = await app.inject({
        method: "GET",
        url: "/scripts/12345678-1234-1234-1234-123456789abc",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("New Inquiry");
    });

    it("rejects invalid UUID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scripts/not-a-uuid",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /scripts/:id", () => {
    it("updates a script", async () => {
      mockSupabaseQueryResult({
        id: "script-1",
        organisation_id: "org-1",
        name: "Updated Script",
        system_prompt: "Updated prompt.",
        is_active: true,
      });

      const res = await app.inject({
        method: "PUT",
        url: "/scripts/12345678-1234-1234-1234-123456789abc",
        headers: { authorization: "Bearer test-token" },
        payload: {
          name: "Updated Script",
          system_prompt: "Updated prompt.",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("Updated Script");
    });
  });

  describe("GET /scripts/versions", () => {
    it("returns version history for a flow type", async () => {
      mockSupabaseAwaitResult([
        { id: "v2", flow_type: "new_inquiry", version: 2, is_active: true },
        { id: "v1", flow_type: "new_inquiry", version: 1, is_active: false },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/scripts/versions?flow_type=new_inquiry",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
    });

    it("requires flow_type query parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scripts/versions",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /scripts/new-version", () => {
    it("creates a new script version", async () => {
      // First single(): get latest version number (limit(1).single())
      mockSupabaseQueryResult({ version: 1 });
      // Second single(): insert the new script
      mockSupabaseQueryResult({
        id: "new-script",
        organisation_id: "org-1",
        flow_type: "new_inquiry",
        name: "New Inquiry v2",
        system_prompt: "Updated prompt.",
        version: 2,
        is_active: false,
      });

      const res = await app.inject({
        method: "POST",
        url: "/scripts/new-version",
        headers: { authorization: "Bearer test-token" },
        payload: {
          flow_type: "new_inquiry",
          name: "New Inquiry v2",
          system_prompt: "Updated prompt.",
          change_notes: "Improved greeting",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe("New Inquiry v2");
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/scripts/new-version",
        headers: { authorization: "Bearer test-token" },
        payload: { flow_type: "new_inquiry" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /scripts/:id/publish", () => {
    it("publishes a script version", async () => {
      // First call: deactivate other versions (await result)
      mockSupabaseAwaitResult(null);
      // Second call: activate this version (single result)
      mockSupabaseQueryResult({
        id: "script-1",
        organisation_id: "org-1",
        is_active: true,
        published_at: new Date().toISOString(),
        published_by: "user-1",
      });

      const res = await app.inject({
        method: "POST",
        url: "/scripts/12345678-1234-1234-1234-123456789abc/publish",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /scripts/:id/preview", () => {
    it("returns rendered prompt preview", async () => {
      // Script lookup
      mockSupabaseQueryResult({
        id: "script-1",
        organisation_id: "org-1",
        name: "New Inquiry",
        system_prompt: "You are a receptionist for {company_name}.",
        flow_type: "new_inquiry",
      });

      // buildSystemPrompt calls: org lookup, KB entries, all scripts
      mockSupabaseQueryResult({
        id: "org-1",
        name: "TestCo",
        builder_name: "John",
        phone_number: "+61400000000",
      });
      mockSupabaseAwaitResult([]); // KB entries
      mockSupabaseAwaitResult([]); // Scripts

      const res = await app.inject({
        method: "POST",
        url: "/scripts/12345678-1234-1234-1234-123456789abc/preview",
        headers: { authorization: "Bearer test-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.rendered_prompt).toBe("string");
    });
  });
});
