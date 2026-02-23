import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import errorHandlerPlugin from "../error-handler.js";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  ExternalServiceError,
} from "../../lib/errors.js";

describe("Error Handler Plugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);

    // Register routes that throw different error types
    app.get("/not-found", async () => {
      throw new NotFoundError("Widget", "abc");
    });

    app.get("/unauthorized", async () => {
      throw new UnauthorizedError("Bad token");
    });

    app.get("/forbidden", async () => {
      throw new ForbiddenError("Admins only");
    });

    app.get("/validation", async () => {
      throw new ValidationError("Invalid input", { field: "email" });
    });

    app.get("/conflict", async () => {
      throw new ConflictError("Already exists");
    });

    app.get("/external", async () => {
      throw new ExternalServiceError("GHL", "rate limited");
    });

    app.get("/unexpected", async () => {
      throw new Error("Something broke");
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("maps NotFoundError to 404", async () => {
    const res = await app.inject({ method: "GET", url: "/not-found" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
    expect(res.json().message).toContain("Widget");
  });

  it("maps UnauthorizedError to 401", async () => {
    const res = await app.inject({ method: "GET", url: "/unauthorized" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("maps ForbiddenError to 403", async () => {
    const res = await app.inject({ method: "GET", url: "/forbidden" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("FORBIDDEN");
  });

  it("maps ValidationError to 400 with details", async () => {
    const res = await app.inject({ method: "GET", url: "/validation" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
    expect(res.json().details).toEqual({ field: "email" });
  });

  it("maps ConflictError to 409", async () => {
    const res = await app.inject({ method: "GET", url: "/conflict" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("CONFLICT");
  });

  it("maps ExternalServiceError to 502", async () => {
    const res = await app.inject({ method: "GET", url: "/external" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("EXTERNAL_SERVICE_ERROR");
    expect(res.json().message).toContain("GHL");
  });

  it("maps unexpected errors to 500", async () => {
    const res = await app.inject({ method: "GET", url: "/unexpected" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("INTERNAL_SERVER_ERROR");
    // Should NOT leak internal error message
    expect(res.json().message).toBe("An unexpected error occurred");
  });
});
