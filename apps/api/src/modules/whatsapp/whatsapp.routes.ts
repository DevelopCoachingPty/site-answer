import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import * as whatsappService from "./whatsapp.service.js";

const UpsertTemplateBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  template_type: Type.String({ minLength: 1 }),
  body_template: Type.String({ minLength: 1 }),
  is_active: Type.Optional(Type.Boolean()),
});

const IdParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const SendMessageBody = Type.Object({
  to: Type.String({ minLength: 1 }),
  body: Type.String({ minLength: 1 }),
});

const SendTemplateBody = Type.Object({
  to: Type.String({ minLength: 1 }),
  template_type: Type.String({ minLength: 1 }),
  variables: Type.Optional(Type.Record(Type.String(), Type.String())),
});

const ListMessagesQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  status: Type.Optional(Type.String()),
});

const whatsappRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.requireOrganisation);

  // GET /whatsapp/templates - List templates
  fastify.get("/templates", async (request, reply) => {
    const templates = await whatsappService.listTemplates(request.organisationId!);
    return reply.send({ data: templates });
  });

  // POST /whatsapp/templates - Create/update template
  fastify.post<{ Body: Static<typeof UpsertTemplateBody> }>("/templates", {
    schema: { body: UpsertTemplateBody },
    handler: async (request, reply) => {
      const template = await whatsappService.upsertTemplate(
        request.organisationId!,
        request.body,
      );
      return reply.code(201).send({ data: template });
    },
  });

  // DELETE /whatsapp/templates/:id - Delete template
  fastify.delete<{ Params: Static<typeof IdParams> }>("/templates/:id", {
    schema: { params: IdParams },
    handler: async (request, reply) => {
      await whatsappService.deleteTemplate(request.organisationId!, request.params.id);
      return reply.code(204).send();
    },
  });

  // POST /whatsapp/send - Send freeform message
  fastify.post<{ Body: Static<typeof SendMessageBody> }>("/send", {
    schema: { body: SendMessageBody },
    handler: async (request, reply) => {
      const result = await whatsappService.sendMessage(
        request.organisationId!,
        request.body.to,
        request.body.body,
      );
      return reply.send({ data: result });
    },
  });

  // POST /whatsapp/send-template - Send template message
  fastify.post<{ Body: Static<typeof SendTemplateBody> }>("/send-template", {
    schema: { body: SendTemplateBody },
    handler: async (request, reply) => {
      const result = await whatsappService.sendTemplateMessage(
        request.organisationId!,
        request.body.to,
        request.body.template_type,
        request.body.variables ?? {},
      );
      return reply.send({ data: result });
    },
  });

  // GET /whatsapp/messages - Message history
  fastify.get<{ Querystring: Static<typeof ListMessagesQuery> }>("/messages", {
    schema: { querystring: ListMessagesQuery },
    handler: async (request, reply) => {
      const result = await whatsappService.listMessages(
        request.organisationId!,
        request.query,
      );
      return reply.send(result);
    },
  });

  // POST /whatsapp/test - Test send
  fastify.post<{ Body: Static<typeof SendMessageBody> }>("/test", {
    schema: { body: SendMessageBody },
    handler: async (request, reply) => {
      const result = await whatsappService.sendMessage(
        request.organisationId!,
        request.body.to,
        `[TEST] ${request.body.body}`,
      );
      return reply.send({ data: result });
    },
  });
};

export default whatsappRoutes;
