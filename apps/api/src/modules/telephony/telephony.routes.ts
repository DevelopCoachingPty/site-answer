import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";

const IncomingCallBody = Type.Object({
  CallSid: Type.String(),
  From: Type.String(),
  To: Type.String(),
  CallStatus: Type.String(),
  Direction: Type.Optional(Type.String()),
  CallerName: Type.Optional(Type.String()),
});

const StatusBody = Type.Object({
  CallSid: Type.String(),
  CallStatus: Type.String(),
  CallDuration: Type.Optional(Type.String()),
  RecordingUrl: Type.Optional(Type.String()),
  RecordingSid: Type.Optional(Type.String()),
});

const RecordingBody = Type.Object({
  CallSid: Type.String(),
  RecordingUrl: Type.String(),
  RecordingSid: Type.String(),
  RecordingDuration: Type.Optional(Type.String()),
});

const telephonyRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /webhooks/telephony/incoming - New inbound call
  fastify.post<{ Body: Static<typeof IncomingCallBody> }>("/incoming", {
    schema: { body: IncomingCallBody },
    handler: async (request, reply) => {
      // TODO: Verify Twilio signature, check idempotency, identify org,
      // check business hours, look up caller, determine call flow,
      // initiate ElevenLabs session, create call record
      request.log.info({ callSid: request.body.CallSid }, "Incoming call webhook");
      return reply.send({ status: "received" });
    },
  });

  // POST /webhooks/telephony/status - Call status updates
  fastify.post<{ Body: Static<typeof StatusBody> }>("/status", {
    schema: { body: StatusBody },
    handler: async (request, reply) => {
      request.log.info(
        { callSid: request.body.CallSid, status: request.body.CallStatus },
        "Call status update",
      );
      return reply.send({ status: "received" });
    },
  });

  // POST /webhooks/telephony/recording - Recording ready
  fastify.post<{ Body: Static<typeof RecordingBody> }>("/recording", {
    schema: { body: RecordingBody },
    handler: async (request, reply) => {
      request.log.info({ callSid: request.body.CallSid }, "Recording ready");
      return reply.send({ status: "received" });
    },
  });
};

export default telephonyRoutes;
