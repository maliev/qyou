import Redis from "ioredis";
import { config } from "./config";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 500;

let redisAvailable = false;

const redisOptions: import("ioredis").RedisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      console.warn(
        `[redis] Max reconnect retries (${MAX_RETRIES}) reached — giving up. Server running in degraded mode.`
      );
      return null; // stop retrying
    }
    return Math.min(times * RETRY_DELAY_MS, 5000);
  },
  lazyConnect: true,
};

// Use REDIS_URL in production (Upstash requires TLS via rediss://)
export const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, redisOptions)
  : new Redis({ host: config.REDIS_HOST, port: config.REDIS_PORT, ...redisOptions });

redis.on("error", (err) => {
  if (redisAvailable) {
    console.error("[redis] Connection error:", err.message);
  }
  redisAvailable = false;
});

redis.on("connect", () => {
  console.log("[redis] Redis connected successfully");
  redisAvailable = true;
});

redis.on("close", () => {
  redisAvailable = false;
});

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    redisAvailable = true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[redis] Redis unavailable — degraded mode: ${message}`);
    redisAvailable = false;
  }
}
