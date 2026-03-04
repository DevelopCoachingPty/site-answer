import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as chaseService from "./chase.service.js";
import * as callsService from "../calls/calls.service.js";
import { initiateOutboundCall } from "../elevenlabs/elevenlabs.client.js";

const ChaseQuerystring = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  search: Type.Optional(Type.String()),
  date_from: Type.Optional(Type.String({ format: "date-time" })),
  date_to: Type.Optional(Type.String({ format: "date-time" })),
});

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const CreateChaseBody = Type.Object({
  contact_name: Type.String(),
  contact_phone: Type.String(),
  ghl_contact_id: Type.Optional(Type.String()),
  invoice_reference: Type.Optional(Type.String()),
  amount_due: Type.Optional(Type.Number()),
  days_overdue: Type.Optional(Type.Integer()),
  due_date: Type.Optional(Type.String({ format: "date" })),
  max_chases: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  notes: Type.Optional(Type.String()),
});

const BulkCreateChaseBody = Type.Object({
  items: Type.Array(Type.Object({
    contact_name: Type.String(),
    contact_phone: Type.String(),
    ghl_contact_id: Type.Optional(Type.String()),
    invoice_reference: Type.Optional(Type.String()),
    amount_due: Type.Optional(Type.Number()),
    days_overdue: Type.Optional(Type.Integer()),
    due_date: Type.Optional(Type.String({ format: "date" })),
    max_chases: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
    notes: Type.Optional(Type.String()),
    external_invoice_id: Type.Optional(Type.String()),
    accounting_provider: Type.Optional(Type.String()),
  })),
});

const UpdateChaseBody = Type.Object({
  status: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  promise_date: Type.Optional(Type.String({ format: "date" })),
  max_chases: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  next_chase_at: Type.Optional(Type.String({ format: "date-time" })),
});

const chaseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /payment-chase - List chase items with pagination and filters
  fastify.get<{ Querystring: Static<typeof ChaseQuerystring> }>("/", {
    schema: { querystring: ChaseQuerystring },
    handler: async (request, reply) => {
      const result = await chaseService.listChaseItems(
        request.organisationId!,
        {
          page: request.query.page ?? 1,
          limit: request.query.limit ?? 20,
          status: request.query.status,
          search: request.query.search,
          date_from: request.query.date_from,
          date_to: request.query.date_to,
        },
      );
      return reply.send(result);
    },
  });

  // GET /payment-chase/stats - Summary statistics
  fastify.get("/stats", async (request, reply) => {
    const stats = await chaseService.getChaseStats(request.organisationId!);
    return reply.send(stats);
  });

  // GET /payment-chase/:id - Detail with call history
  fastify.get<{ Params: Static<typeof IdParams> }>("/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const item = await chaseService.getChaseItem(
        request.organisationId!,
        request.params.id,
      );
      return reply.send({ data: item });
    },
  });

  // POST /payment-chase - Create manually
  fastify.post<{ Body: Static<typeof CreateChaseBody> }>("/", {
    schema: { body: CreateChaseBody },
    handler: async (request, reply) => {
      const item = await chaseService.createChaseItem(
        request.organisationId!,
        request.body,
      );
      return reply.code(201).send({ data: item });
    },
  });

  // POST /payment-chase/bulk - Bulk create (for accounting import)
  fastify.post<{ Body: Static<typeof BulkCreateChaseBody> }>("/bulk", {
    schema: { body: BulkCreateChaseBody },
    handler: async (request, reply) => {
      const items = await chaseService.bulkCreateChaseItems(
        request.organisationId!,
        request.body.items,
      );
      return reply.code(201).send({ data: items, count: items.length });
    },
  });

  // PATCH /payment-chase/:id - Update status/notes
  fastify.patch<{
    Params: Static<typeof IdParams>;
    Body: Static<typeof UpdateChaseBody>;
  }>("/:id", {
    schema: { params: IdParams, body: UpdateChaseBody },
    handler: async (request, reply) => {
      const item = await chaseService.updateChaseItem(
        request.organisationId!,
        request.params.id,
        request.body,
      );
      return reply.send({ data: item });
    },
  });

  // DELETE /payment-chase/:id - Remove
  fastify.delete<{ Params: Static<typeof IdParams> }>("/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      await chaseService.deleteChaseItem(
        request.organisationId!,
        request.params.id,
      );
      return reply.code(204).send();
    },
  });

  // POST /payment-chase/:id/chase-now - Trigger immediate outbound call
  fastify.post<{ Params: Static<typeof IdParams> }>("/:id/chase-now", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      const orgId = request.organisationId!;
      const item = await chaseService.getChaseItem(orgId, request.params.id);

      if (!item) {
        return reply.code(404).send({ error: "Chase item not found" });
      }

      if (item.status === "paid" || item.status === "cancelled") {
        return reply.code(400).send({ error: `Cannot chase item with status: ${item.status}` });
      }

      // Create a call record for tracking
      const call = await callsService.createCall({
        organisation_id: orgId,
        direction: "outbound",
        caller_number: item.contact_phone,
        caller_name: item.contact_name,
        flow_type: "payment_chase",
      });

      // Initiate outbound call via ElevenLabs
      const result = await initiateOutboundCall(orgId, {
        phoneNumber: item.contact_phone,
        contactName: item.contact_name,
        invoiceReference: item.invoice_reference ?? undefined,
        amountDue: item.amount_due ?? undefined,
        daysOverdue: item.days_overdue ?? undefined,
        chaseCount: item.chase_count ?? 0,
        callId: call.id,
        chaseItemId: item.id,
      });

      // Update chase item status
      await chaseService.updateChaseItem(orgId, item.id, { status: "in_progress" });

      return reply.send({
        message: "Chase call initiated",
        conversation_id: result.conversation_id,
        call_id: call.id,
      });
    },
  });
};

export default chaseRoutes;
