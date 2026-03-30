import { execSync } from "child_process";
import { config } from "../config";

export async function runMigrations(): Promise<void> {
  const databaseUrl =
    config.DATABASE_URL ??
    `postgresql://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;

  console.log("[migrations] Running pending migrations...");

  try {
    execSync("npx node-pg-migrate up --migrations-dir migrations", {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log("[migrations] Migrations completed successfully");
  } catch (err) {
    console.error("[migrations] Migration failed:", err);
    process.exit(1);
  }
}
