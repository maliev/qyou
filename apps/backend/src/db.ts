import { Pool } from "pg";
import { config } from "./config";

function getSslConfig(
  connectionString: string
): false | { rejectUnauthorized: boolean } {
  if (!connectionString) return false;
  if (connectionString.includes("localhost")) return false;
  if (connectionString.includes("127.0.0.1")) return false;
  if (connectionString.includes(".flycast")) return false;
  if (connectionString.includes(".internal")) return false;
  if (connectionString.includes("sslmode=disable")) return false;
  // Supabase and all external hosts need SSL
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
