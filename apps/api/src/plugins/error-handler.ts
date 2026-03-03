import { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";

// Lazy-init Sentry so it only loads when a DSN is configured
let sentryInstance: typeof import("@sentry/node") | null = null;

async function getSentry() {
  if (sentryInstance) return sentryInstance;
  if (!env.SENTRY_DSN) return null;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    });
    sentryInstance = Sentry;
    return Sentry;
  } catch {
    return null;
  }
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // Initialize Sentry early
  await getSentry();

  fastify.setErrorHandler(async (error: FastifyError | AppError | Error, request, reply) => {
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

    // Unexpected errors — capture with Sentry
    request.log.error({ err: error, correlationId }, "Unhandled error");

    const Sentry = await getSentry();
    if (Sentry) {
      Sentry.captureException(error, {
        tags: { correlationId },
        extra: { url: request.url, method: request.method },
      });
    }

    return reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
