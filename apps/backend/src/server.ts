import { config } from "./config";
import { buildApp } from "./app";
import { pool } from "./db";
import { redis, connectRedis, isRedisAvailable } from "./redis";
import { initSocketIO } from "./realtime/index";
import { runMigrations } from "./scripts/migrate-production";

async function start() {
  // In production, run pending migrations before starting
  if (config.NODE_ENV === "production") {
    await runMigrations();
  }

  // Attempt Redis connection (non-blocking — server starts either way)
  await connectRedis();

  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    app.log.info(`Server listening on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Initialize Socket.io on the underlying HTTP server
  initSocketIO(app.server);

  if (!isRedisAvailable()) {
    console.warn("[server] Redis unavailable — degraded mode (presence/sessions limited, auth+REST OK)");
  }

  const shutdown = async () => {
    app.log.info("Shutting down...");
    await app.close();
    await pool.end();
    if (isRedisAvailable()) {
      redis.disconnect();
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start();
