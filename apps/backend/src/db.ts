import { Pool } from "pg";
import { config } from "./config";

const isProduction = config.NODE_ENV === "production";

export const pool = new Pool(
  config.DATABASE_URL
    ? {
        connectionString: config.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
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
