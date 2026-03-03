import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { resetSupabaseMocks, mockSupabaseLimitResult } from "../../../__tests__/helpers.js";
import healthRoutes from "../health.routes.js";

describe("Health Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(healthRoutes, { prefix: "/health" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMocks();
  });

  it("GET /health returns 200 with ok status", async () => {
    mockSupabaseLimitResult([{ id: "1" }]);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version", "0.1.0");
    expect(body).toHaveProperty("services");
  });

  it("GET /health returns 503 when database check fails", async () => {
    mockSupabaseLimitResult([], { message: "connection refused" });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("error");
  });
});
