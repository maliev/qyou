import { redis, isRedisAvailable } from "../redis";

export async function safeRedisGet(key: string): Promise<string | null> {
  if (!isRedisAvailable()) return null;
  try {
    return await redis.get(key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[redis] safeRedisGet("${key}") failed: ${message}`);
    return null;
  }
}

export async function safeRedisSet(
  key: string,
  value: string,
  ttl?: number
): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    if (ttl) {
      await redis.set(key, value, "EX", ttl);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[redis] safeRedisSet("${key}") failed: ${message}`);
    return false;
  }
}

export async function safeRedisDel(key: string): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    await redis.del(key);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[redis] safeRedisDel("${key}") failed: ${message}`);
    return false;
  }
}

export async function safeRedisPublish(
  channel: string,
  message: string
): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  try {
    await redis.publish(channel, message);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[redis] safeRedisPublish("${channel}") failed: ${msg}`);
    return false;
  }
}
