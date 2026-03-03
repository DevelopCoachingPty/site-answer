import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { buildTestServer, resetSupabaseMocks, mockSupabaseQueryResult } from "../../../__tests__/helpers.js";
import type { FastifyInstance } from "fastify";

// Mock external services used by tool endpoints
vi.mock("../../organisations/org.service.js", () => ({
  getOrganisationByAgentId: vi.fn(),
}));
vi.mock("../../ghl/ghl.client.js", () => ({
  lookupContact: vi.fn(),
  createContact: vi.fn(),
  addContactNote: vi.fn(),
}));
vi.mock("../../calendar/calendar.service.js", () => ({
  getAvailableSlots: vi.fn(),
  bookAppointment: vi.fn(),
}));
vi.mock("../../knowledge-base/kb.service.js", () => ({
  getActiveKnowledgeBase: vi.fn(),
}));
vi.mock("../../payment-chase/chase.service.js", () => ({
  updateChaseItem: vi.fn(),
}));
vi.mock("../../whatsapp/whatsapp.service.js", () => ({
  sendTemplateMessage: vi.fn(),
}));
vi.mock("../../../config/env.js", () => ({
  env: {
    LOG_LEVEL: "fatal",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    FRONTEND_URL: "http://localhost:3000",
  },
}));

import * as orgService from "../../organisations/org.service.js";
import * as ghlClient from "../../ghl/ghl.client.js";
import * as calendarService from "../../calendar/calendar.service.js";
import * as kbService from "../../knowledge-base/kb.service.js";
import * as chaseService from "../../payment-chase/chase.service.js";
import * as whatsappService from "../../whatsapp/whatsapp.service.js";
import elevenlabsRoutes from "../elevenlabs.routes.js";

const MOCK_ORG = {
  id: "org-1",
  name: "Test Builder Co",
  ghl_location_id: "loc-1",
  ghl_access_token_encrypted: "enc-token",
  escalation_sms: false,
  escalation_phone: null,
  is_active: true,
};

const toolBody = (tool_params: Record<string, unknown>) => ({
  conversation_id: "conv-123",
  agent_id: "agent-123",
  parameters: tool_params,
});

describe("ElevenLabs Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestServer();
    await app.register(elevenlabsRoutes, { prefix: "/elevenlabs" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  describe("POST /elevenlabs/post-call", () => {
    it("queues post-call job and returns received", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/post-call",
        payload: { conversation_id: "conv-123", data: {} },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ status: "received" });
    });
  });

  describe("POST /elevenlabs/tools/lookup_caller", () => {
    it("returns existing contact from GHL", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(ghlClient.lookupContact).mockResolvedValue({
        id: "contact-1",
        name: "John Smith",
        firstName: "John",
        tags: ["existing-client"],
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/lookup_caller",
        payload: toolBody({ phone_number: "+61400000000" }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.found).toBe(true);
      expect(body.contact_id).toBe("contact-1");
      expect(body.type).toBe("existing_client");
    });

    it("returns not-found when org has no GHL", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue({
        ...MOCK_ORG,
        ghl_location_id: null,
        ghl_access_token_encrypted: null,
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/lookup_caller",
        payload: toolBody({ phone_number: "+61400000000" }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.found).toBe(false);
      expect(body.type).toBe("new_inquiry");
    });

    it("returns not-found when org is null", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/lookup_caller",
        payload: toolBody({ phone_number: "+61400000000" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.found).toBe(false);
    });
  });

  describe("POST /elevenlabs/tools/create_new_contact", () => {
    it("creates contact and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(ghlClient.createContact).mockResolvedValue({ id: "new-contact-1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/create_new_contact",
        payload: toolBody({ name: "Jane", phone: "+61400000001", notes: "Interested in renovation" }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.contact_id).toBe("new-contact-1");
      expect(vi.mocked(ghlClient.addContactNote)).toHaveBeenCalled();
    });

    it("returns failure when CRM not connected", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue({
        ...MOCK_ORG,
        ghl_location_id: null,
        ghl_access_token_encrypted: null,
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/create_new_contact",
        payload: toolBody({ name: "Jane", phone: "+61400000001" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.reason).toBe("CRM not connected");
    });
  });

  describe("POST /elevenlabs/tools/check_calendar", () => {
    it("returns available slots", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(calendarService.getAvailableSlots).mockResolvedValue([
        { start: "2025-01-20T09:00:00Z", end: "2025-01-20T10:00:00Z" },
        { start: "2025-01-20T14:00:00Z", end: "2025-01-20T15:00:00Z" },
      ] as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/check_calendar",
        payload: toolBody({}),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.available_slots).toHaveLength(2);
      expect(body.message).toContain("2");
    });

    it("returns empty when org not found", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/check_calendar",
        payload: toolBody({}),
      });

      const body = JSON.parse(res.payload);
      expect(body.available_slots).toHaveLength(0);
    });
  });

  describe("POST /elevenlabs/tools/book_appointment", () => {
    it("books appointment and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(calendarService.bookAppointment).mockResolvedValue({ id: "appt-1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/book_appointment",
        payload: toolBody({ datetime: "2025-01-20T10:00:00Z", type: "site_visit" }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.appointment_id).toBe("appt-1");
    });

    it("returns failure when booking throws", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(calendarService.bookAppointment).mockRejectedValue(new Error("No slots"));

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/book_appointment",
        payload: toolBody({ datetime: "2025-01-20T10:00:00Z", type: "site_visit" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
    });
  });

  describe("POST /elevenlabs/tools/send_sms", () => {
    it("logs SMS and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/send_sms",
        payload: toolBody({ phone_number: "+61400000000", message: "Hello" }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });
  });

  describe("POST /elevenlabs/tools/escalate_to_builder", () => {
    it("creates notification and returns escalated", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/escalate_to_builder",
        payload: toolBody({
          reason: "Emergency leak",
          caller_name: "John",
          caller_number: "+61400000000",
          urgency_level: "emergency",
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.escalated).toBe(true);
    });

    it("creates notification when escalation phone is set", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue({
        ...MOCK_ORG,
        escalation_sms: true,
        escalation_phone: "+61400999999",
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/escalate_to_builder",
        payload: toolBody({
          reason: "Emergency",
          caller_number: "+61400000000",
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.escalated).toBe(true);
    });
  });

  describe("POST /elevenlabs/tools/get_knowledge", () => {
    it("returns matching KB entries", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(kbService.getActiveKnowledgeBase).mockResolvedValue([
        { title: "Pricing", content: "Our hourly rate is $120", category: "services" },
        { title: "Hours", content: "We operate 7am-5pm Mon-Fri", category: "general" },
      ] as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/get_knowledge",
        payload: toolBody({ query: "pricing" }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].title).toBe("Pricing");
    });

    it("returns empty when no matches", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(kbService.getActiveKnowledgeBase).mockResolvedValue([
        { title: "Hours", content: "We operate 7am-5pm", category: "general" },
      ] as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/get_knowledge",
        payload: toolBody({ query: "warranty" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.results).toHaveLength(0);
    });
  });

  describe("POST /elevenlabs/tools/log_message", () => {
    it("creates notification and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/log_message",
        payload: toolBody({
          caller_name: "John Smith",
          phone: "+61400000000",
          message: "Please call back about the bathroom reno",
          callback_requested: true,
        }),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });
  });

  describe("POST /elevenlabs/tools/send_whatsapp", () => {
    it("sends WhatsApp template and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      mockSupabaseQueryResult({ name: "Test Builder Co" }); // org name lookup
      vi.mocked(whatsappService.sendTemplateMessage).mockResolvedValue({ id: "msg-1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/send_whatsapp",
        payload: toolBody({
          phone_number: "+61400000000",
          template_type: "booking_confirmation",
          contact_name: "John",
          datetime: "2025-01-20T10:00:00Z",
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.message_id).toBe("msg-1");
    });

    it("returns failure when org not found", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/send_whatsapp",
        payload: toolBody({ phone_number: "+61400000000", template_type: "inquiry_summary" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
    });
  });

  describe("POST /elevenlabs/tools/record_payment_outcome", () => {
    it("updates chase item and returns success", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(MOCK_ORG as never);
      vi.mocked(chaseService.updateChaseItem).mockResolvedValue(undefined as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/record_payment_outcome",
        payload: toolBody({
          chase_item_id: "chase-1",
          outcome: "promised",
          promise_date: "2025-02-01",
          notes: "Will pay by Friday",
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.outcome).toBe("promised");
    });

    it("returns failure when org not found", async () => {
      vi.mocked(orgService.getOrganisationByAgentId).mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/elevenlabs/tools/record_payment_outcome",
        payload: toolBody({ chase_item_id: "chase-1", outcome: "paid" }),
      });

      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
    });
  });
});
