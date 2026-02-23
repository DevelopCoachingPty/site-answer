import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { buildTestServer, resetSupabaseMocks, mockSupabaseQueryResult } from "../../../__tests__/helpers.js";
import type { FastifyInstance } from "fastify";

// Mock services used by telephony routes
vi.mock("../../organisations/org.service.js", () => ({
  getOrganisationByPhone: vi.fn(),
}));
vi.mock("../../calls/calls.service.js", () => ({
  createCall: vi.fn(),
  updateCall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../scripts/scripts.service.js", () => ({
  getActiveScript: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../ghl/ghl.client.js", () => ({
  lookupContact: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../whatsapp/whatsapp.service.js", () => ({
  updateMessageStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../lib/webhook-events.js", () => ({
  claimWebhookEvent: vi.fn().mockResolvedValue(true),
  markWebhookFailed: vi.fn().mockResolvedValue(undefined),
}));

import * as orgService from "../../organisations/org.service.js";
import * as callsService from "../../calls/calls.service.js";
import * as whatsappService from "../../whatsapp/whatsapp.service.js";
import { claimWebhookEvent, markWebhookFailed } from "../../../lib/webhook-events.js";
import telephonyRoutes from "../telephony.routes.js";

const MOCK_ORG = {
  id: "org-1",
  name: "Test Builder Co",
  timezone: "Australia/Sydney",
  business_hours: null,
  ghl_location_id: null,
  ghl_access_token_encrypted: null,
  elevenlabs_agent_id: "agent-123",
  phone_number: "+61280001234",
};

describe("Telephony Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(telephonyRoutes, { prefix: "/telephony" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  describe("POST /telephony/incoming", () => {
    const incomingBody = {
      CallSid: "CA123",
      From: "+61400000000",
      To: "+61280001234",
      CallStatus: "ringing",
    };

    it("returns TwiML with Stream for org with agent", async () => {
      vi.mocked(orgService.getOrganisationByPhone).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(callsService.createCall).mockResolvedValue({ id: "call-1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/telephony/incoming",
        payload: incomingBody,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/xml");
      expect(res.payload).toContain("<Stream");
      expect(res.payload).toContain("agent-123");
    });

    it("returns voicemail TwiML when org has no agent", async () => {
      vi.mocked(orgService.getOrganisationByPhone).mockResolvedValue({
        ...MOCK_ORG,
        elevenlabs_agent_id: null,
      } as never);
      vi.mocked(callsService.createCall).mockResolvedValue({ id: "call-1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/telephony/incoming",
        payload: incomingBody,
      });

      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain("<Say>");
      expect(res.payload).toContain("<Record");
    });

    it("returns error TwiML when no org found", async () => {
      vi.mocked(orgService.getOrganisationByPhone).mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/telephony/incoming",
        payload: incomingBody,
      });

      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain("not currently active");
      expect(vi.mocked(markWebhookFailed)).toHaveBeenCalled();
    });

    it("returns duplicate status for claimed webhook", async () => {
      vi.mocked(claimWebhookEvent).mockResolvedValueOnce(false as never);

      const res = await app.inject({
        method: "POST",
        url: "/telephony/incoming",
        payload: incomingBody,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ status: "duplicate" });
    });

    it("creates call record with correct fields", async () => {
      vi.mocked(orgService.getOrganisationByPhone).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(callsService.createCall).mockResolvedValue({ id: "call-1" } as never);

      await app.inject({
        method: "POST",
        url: "/telephony/incoming",
        payload: { ...incomingBody, CallerName: "John Smith" },
      });

      expect(vi.mocked(callsService.createCall)).toHaveBeenCalledWith(
        expect.objectContaining({
          organisation_id: "org-1",
          external_call_id: "CA123",
          direction: "inbound",
          caller_number: "+61400000000",
          called_number: "+61280001234",
          caller_name: "John Smith",
        }),
      );
    });
  });

  describe("POST /telephony/status", () => {
    it("updates call to completed with duration", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      const res = await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: { CallSid: "CA123", CallStatus: "completed", CallDuration: "120" },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ status: "completed", duration_seconds: 120 }),
      );
    });

    it("maps busy to missed", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: { CallSid: "CA123", CallStatus: "busy" },
      });

      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ status: "missed" }),
      );
    });

    it("maps failed to failed", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: { CallSid: "CA123", CallStatus: "failed" },
      });

      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("maps in-progress", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: { CallSid: "CA123", CallStatus: "in-progress" },
      });

      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ status: "in_progress" }),
      );
    });

    it("ignores unknown call", async () => {
      mockSupabaseQueryResult(null, { code: "PGRST116" });

      const res = await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: { CallSid: "CA999", CallStatus: "completed" },
      });

      expect(JSON.parse(res.payload)).toEqual({ status: "ignored" });
      expect(vi.mocked(callsService.updateCall)).not.toHaveBeenCalled();
    });

    it("includes recording URL when present", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      await app.inject({
        method: "POST",
        url: "/telephony/status",
        payload: {
          CallSid: "CA123",
          CallStatus: "completed",
          RecordingUrl: "https://api.twilio.com/rec/123",
        },
      });

      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ recording_url: "https://api.twilio.com/rec/123" }),
      );
    });
  });

  describe("POST /telephony/recording", () => {
    it("updates call with recording URL", async () => {
      mockSupabaseQueryResult({ id: "call-1" });

      const res = await app.inject({
        method: "POST",
        url: "/telephony/recording",
        payload: {
          CallSid: "CA123",
          RecordingUrl: "https://api.twilio.com/rec/456",
          RecordingSid: "RE456",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(callsService.updateCall)).toHaveBeenCalledWith("call-1", {
        recording_url: "https://api.twilio.com/rec/456",
      });
    });
  });

  describe("POST /telephony/whatsapp-status", () => {
    it("updates message status", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/telephony/whatsapp-status",
        payload: {
          MessageSid: "SM123",
          MessageStatus: "delivered",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(whatsappService.updateMessageStatus)).toHaveBeenCalledWith(
        "SM123",
        "delivered",
        undefined,
      );
    });

    it("passes error message when present", async () => {
      await app.inject({
        method: "POST",
        url: "/telephony/whatsapp-status",
        payload: {
          MessageSid: "SM123",
          MessageStatus: "failed",
          ErrorMessage: "Invalid number",
        },
      });

      expect(vi.mocked(whatsappService.updateMessageStatus)).toHaveBeenCalledWith(
        "SM123",
        "failed",
        "Invalid number",
      );
    });
  });
});
