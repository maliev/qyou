import Fastify, { FastifyError } from "fastify";
import helmet from "@fastify/helmet";
import corsPlugin from "./plugins/cors";
import authPlugin from "./plugins/auth";
import rateLimitPlugin from "./plugins/rateLimit";
import { pool } from "./db";
import { isRedisAvailable } from "./redis";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import contactRoutes from "./routes/contacts";
import conversationRoutes from "./routes/conversations";
import messageRoutes from "./routes/messages";
import searchRoutes from "./routes/search";
import e2eeRoutes from "./routes/e2ee";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "warn" : "debug",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } }
          : undefined,
    },
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://maliev.github.io",
          "wss://qyou-api.fly.dev",
          "https://qyou-api.fly.dev",
        ],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  });

  // Plugins
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  // Routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(contactRoutes, { prefix: "/api/v1/contacts" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(messageRoutes, { prefix: "/api/v1/messages" });
  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(e2eeRoutes, { prefix: "/api/v1/e2ee" });

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);

    if (error.statusCode === 429) {
      return reply.status(429).send({ message: "Too many requests" });
    }

    return reply
      .status(error.statusCode || 500)
      .send({ message: error.statusCode ? error.message : "Internal server error" });
  });

  // Health check
  app.get("/health", async () => {
    let dbStatus: "ok" | "error" = "ok";
    try {
      await pool.query("SELECT 1");
    } catch {
      dbStatus = "error";
    }

    const redisStatus = isRedisAvailable() ? "ok" as const : "degraded" as const;
    const status = dbStatus === "error" ? "degraded" : "ok";

    return {
      status,
      db: dbStatus,
      redis: redisStatus,
      version: "1.0.0",
      uptime: Math.floor(process.uptime()),
    };
  });

  return app;
}
