import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as googleClient from "./google.client.js";
import * as outlookClient from "./outlook.client.js";
import * as calendarService from "./calendar.service.js";
import { logger } from "../../lib/logger.js";

const ProviderQuery = Type.Object({
  provider: Type.Union([Type.Literal("google"), Type.Literal("outlook")]),
});

const OAuthCallbackQuery = Type.Object({
  code: Type.String(),
  state: Type.String(),
});

const GetSlotsQuery = Type.Object({
  start: Type.String({ format: "date-time" }),
  end: Type.String({ format: "date-time" }),
  duration: Type.Optional(Type.Integer({ minimum: 15, maximum: 480, default: 60 })),
});

const BookBody = Type.Object({
  contact_name: Type.String(),
  contact_phone: Type.Optional(Type.String()),
  contact_email: Type.Optional(Type.String()),
  start: Type.String({ format: "date-time" }),
  end: Type.String({ format: "date-time" }),
  title: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  call_id: Type.Optional(Type.String({ format: "uuid" })),
});

const SetCalendarBody = Type.Object({
  calendar_id: Type.String(),
});

const calendarRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /calendar/oauth/authorize?provider=google|outlook
  fastify.get<{ Querystring: Static<typeof ProviderQuery> }>("/oauth/authorize", {
    schema: { querystring: ProviderQuery },
    handler: async (request, reply) => {
      const { provider } = request.query;
      const orgId = request.organisationId!;

      const url = provider === "google"
        ? googleClient.getOAuthAuthorizeUrl(orgId)
        : outlookClient.getOAuthAuthorizeUrl(orgId);

      return reply.send({ url });
    },
  });

  // GET /calendar/oauth/callback
  fastify.get<{ Querystring: Static<typeof OAuthCallbackQuery> }>("/oauth/callback", {
    schema: { querystring: OAuthCallbackQuery },
    handler: async (request, reply) => {
      const { code, state } = request.query;
      const [provider, orgId] = state.split(":");

      if (!orgId || (provider !== "google" && provider !== "outlook")) {
        return reply.code(400).send({ error: "Invalid OAuth state" });
      }

      try {
        if (provider === "google") {
          const tokens = await googleClient.exchangeCodeForTokens(code);
          await googleClient.storeTokens(orgId, tokens);
        } else {
          const tokens = await outlookClient.exchangeCodeForTokens(code);
          await outlookClient.storeTokens(orgId, tokens);
        }

        return reply.send({ success: true, provider });
      } catch (err) {
        logger.error({ err, provider }, "Calendar OAuth callback failed");
        return reply.code(500).send({ error: "Failed to connect calendar" });
      }
    },
  });

  // GET /calendar/calendars - List available calendars
  fastify.get("/calendars", async (request, reply) => {
    const calendars = await calendarService.listCalendars(request.organisationId!);
    return reply.send({ data: calendars });
  });

  // POST /calendar/set-calendar - Set which calendar to use
  fastify.post<{ Body: Static<typeof SetCalendarBody> }>("/set-calendar", {
    schema: { body: SetCalendarBody },
    handler: async (request, reply) => {
      await calendarService.setCalendarId(request.organisationId!, request.body.calendar_id);
      return reply.send({ success: true });
    },
  });

  // GET /calendar/slots - Get available slots
  fastify.get<{ Querystring: Static<typeof GetSlotsQuery> }>("/slots", {
    schema: { querystring: GetSlotsQuery },
    handler: async (request, reply) => {
      const slots = await calendarService.getAvailableSlots(
        request.organisationId!,
        request.query.start,
        request.query.end,
        request.query.duration ?? 60,
      );
      return reply.send({ data: slots });
    },
  });

  // POST /calendar/book - Book an appointment
  fastify.post<{ Body: Static<typeof BookBody> }>("/book", {
    schema: { body: BookBody },
    handler: async (request, reply) => {
      const appointment = await calendarService.bookAppointment(
        request.organisationId!,
        {
          contactName: request.body.contact_name,
          contactPhone: request.body.contact_phone,
          contactEmail: request.body.contact_email,
          start: request.body.start,
          end: request.body.end,
          title: request.body.title,
          notes: request.body.notes,
          callId: request.body.call_id,
        },
      );
      return reply.code(201).send({ data: appointment });
    },
  });

  // DELETE /calendar/disconnect
  fastify.delete("/disconnect", async (request, reply) => {
    const { supabaseAdmin } = await import("../../lib/supabase.js");
    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("calendar_type")
      .eq("id", request.organisationId!)
      .single();

    if (org?.calendar_type === "google") {
      await googleClient.disconnect(request.organisationId!);
    } else if (org?.calendar_type === "outlook") {
      await outlookClient.disconnect(request.organisationId!);
    }

    return reply.code(204).send();
  });
};

export default calendarRoutes;
