import Fastify from "fastify";
import corsPlugin from "./plugins/cors";
import authPlugin from "./plugins/auth";
import rateLimitPlugin from "./plugins/rateLimit";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import contactRoutes from "./routes/contacts";
import conversationRoutes from "./routes/conversations";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } }
          : undefined,
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

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error.statusCode === 429) {
      return reply.status(429).send({ message: "Too many requests" });
    }

    return reply
      .status(error.statusCode || 500)
      .send({ message: error.statusCode ? error.message : "Internal server error" });
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
