import { Pool } from "pg";
import { config } from "./config";

function getSslConfig(
  databaseUrl: string
): false | { rejectUnauthorized: boolean } {
  // Local development — no SSL
  if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
    return false;
  }
  // Fly.io internal networking — no SSL
  if (databaseUrl.includes(".flycast") || databaseUrl.includes(".internal")) {
    return false;
  }
  // Explicit sslmode in the URL takes precedence
  if (databaseUrl.includes("sslmode=disable")) {
    return false;
  }
  // External providers (Neon, Supabase, etc.) — SSL required
  return { rejectUnauthorized: false };
}

export const pool = new Pool(
  config.DATABASE_URL
    ? {
        connectionString: config.DATABASE_URL,
        ssl: getSslConfig(config.DATABASE_URL),
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: config.DB_HOST,
        port: config.DB_PORT,
        database: config.DB_NAME,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
);

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});
