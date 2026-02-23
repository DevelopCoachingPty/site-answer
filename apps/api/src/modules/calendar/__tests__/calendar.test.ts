import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  buildTestServer,
  mockAuthenticatedUser,
  resetSupabaseMocks,
  mockSupabaseQueryResult,
} from "../../../__tests__/helpers.js";
import type { FastifyInstance } from "fastify";

vi.mock("../google.client.js", () => ({
  getOAuthAuthorizeUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?test=1"),
  exchangeCodeForTokens: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../outlook.client.js", () => ({
  getOAuthAuthorizeUrl: vi.fn().mockReturnValue("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?test=1"),
  exchangeCodeForTokens: vi.fn(),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../calendar.service.js", () => ({
  listCalendars: vi.fn(),
  setCalendarId: vi.fn().mockResolvedValue(undefined),
  getAvailableSlots: vi.fn(),
  bookAppointment: vi.fn(),
}));

import * as googleClient from "../google.client.js";
import * as outlookClient from "../outlook.client.js";
import * as calendarService from "../calendar.service.js";
import calendarRoutes from "../calendar.routes.js";

describe("Calendar Routes", () => {
  let app: FastifyInstance;
  const AUTH = "Bearer test-token";

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(calendarRoutes, { prefix: "/calendar" });
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
      const res = await app.inject({ method: "GET", url: "/calendar/calendars" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 without org membership", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: null });

      const res = await app.inject({
        method: "GET",
        url: "/calendar/calendars",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /calendar/oauth/authorize", () => {
    it("returns Google OAuth URL", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/calendar/oauth/authorize?provider=google",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toContain("google.com");
    });

    it("returns Outlook OAuth URL", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/calendar/oauth/authorize?provider=outlook",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toContain("microsoftonline.com");
    });
  });

  describe("GET /calendar/oauth/callback", () => {
    it("exchanges Google code for tokens", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(googleClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "google-access",
        refresh_token: "google-refresh",
      } as never);

      const res = await app.inject({
        method: "GET",
        url: "/calendar/oauth/callback?code=auth-code&state=google:org-1",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ success: true, provider: "google" });
      expect(vi.mocked(googleClient.storeTokens)).toHaveBeenCalled();
    });

    it("returns 400 for invalid state", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "GET",
        url: "/calendar/oauth/callback?code=auth-code&state=invalid",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /calendar/calendars", () => {
    it("returns list of calendars", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(calendarService.listCalendars).mockResolvedValue([
        { id: "cal-1", name: "Work Calendar" },
        { id: "cal-2", name: "Personal" },
      ] as never);

      const res = await app.inject({
        method: "GET",
        url: "/calendar/calendars",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
    });
  });

  describe("POST /calendar/set-calendar", () => {
    it("sets active calendar", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });

      const res = await app.inject({
        method: "POST",
        url: "/calendar/set-calendar",
        headers: { authorization: AUTH },
        payload: { calendar_id: "cal-1" },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(calendarService.setCalendarId)).toHaveBeenCalledWith("org-1", "cal-1");
    });
  });

  describe("GET /calendar/slots", () => {
    it("returns available slots", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(calendarService.getAvailableSlots).mockResolvedValue([
        { start: "2025-01-20T09:00:00Z", end: "2025-01-20T10:00:00Z" },
      ] as never);

      const res = await app.inject({
        method: "GET",
        url: "/calendar/slots?start=2025-01-20T00:00:00Z&end=2025-01-27T00:00:00Z",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
    });
  });

  describe("POST /calendar/book", () => {
    it("books appointment and returns 201", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      vi.mocked(calendarService.bookAppointment).mockResolvedValue({
        id: "appt-1",
        start: "2025-01-20T09:00:00Z",
        end: "2025-01-20T10:00:00Z",
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/calendar/book",
        headers: { authorization: AUTH },
        payload: {
          contact_name: "John Smith",
          start: "2025-01-20T09:00:00Z",
          end: "2025-01-20T10:00:00Z",
          title: "Site inspection",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe("appt-1");
    });
  });

  describe("DELETE /calendar/disconnect", () => {
    it("disconnects Google calendar", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({ calendar_type: "google" });

      const res = await app.inject({
        method: "DELETE",
        url: "/calendar/disconnect",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(204);
      expect(vi.mocked(googleClient.disconnect)).toHaveBeenCalledWith("org-1");
    });

    it("disconnects Outlook calendar", async () => {
      mockAuthenticatedUser({ userId: "user-1", organisationId: "org-1" });
      mockSupabaseQueryResult({ calendar_type: "outlook" });

      const res = await app.inject({
        method: "DELETE",
        url: "/calendar/disconnect",
        headers: { authorization: AUTH },
      });

      expect(res.statusCode).toBe(204);
      expect(vi.mocked(outlookClient.disconnect)).toHaveBeenCalledWith("org-1");
    });
  });
});
