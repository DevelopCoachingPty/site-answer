import { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../lib/errors.js";

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const correlationId = request.id;

    if (error instanceof AppError) {
      request.log.warn(
        { err: error, correlationId, statusCode: error.statusCode },
        error.message,
      );

      return reply.status(error.statusCode).send({
        error: error.code ?? "ERROR",
        message: error.message,
        statusCode: error.statusCode,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    // Fastify validation errors
    if ("validation" in error && (error as FastifyError).validation) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        statusCode: 400,
        details: (error as FastifyError).validation,
      });
    }

    // Unexpected errors
    request.log.error({ err: error, correlationId }, "Unhandled error");

    return reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
