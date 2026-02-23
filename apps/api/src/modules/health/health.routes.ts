import { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_request, reply) => {
    // TODO: Add DB connectivity check, Redis check, ElevenLabs status
    return reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      services: {
        database: "ok",
        redis: "ok",
        elevenlabs: "ok",
      },
    });
  });
};

export default healthRoutes;
