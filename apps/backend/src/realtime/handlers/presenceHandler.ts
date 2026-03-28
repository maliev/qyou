import { Server, Socket } from "socket.io";
import { safeRedisGet, safeRedisSet } from "../../utils/gracefulRedis";
import { pool } from "../../db";
import { PRESENCE_TTL } from "./connectionHandler";

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  // presence:get — look up presence for a list of user IDs
  socket.on("presence:get", async (payload, ack) => {
    try {
      const userIds: string[] = payload?.userIds;
      if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 100) {
        return ack?.({ presences: [] });
      }

      const presences = [];
      for (const uid of userIds) {
        const cached = await safeRedisGet(`presence:${uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          presences.push({ userId: uid, status: parsed.status, lastSeenAt: parsed.lastSeenAt });
        } else {
          // Fall back to DB
          const result = await pool.query(
            `SELECT last_seen_at FROM users WHERE id = $1`,
            [uid]
          );
          const lastSeenAt = result.rows[0]?.last_seen_at || new Date().toISOString();
          presences.push({ userId: uid, status: "offline", lastSeenAt });
        }
      }

      ack?.({ presences });
    } catch (err) {
      console.error("[ws] presence:get error:", err);
      ack?.({ presences: [] });
    }
  });

  // heartbeat — refresh presence TTL
  socket.on("heartbeat", async () => {
    try {
      const now = new Date().toISOString();
      await safeRedisSet(
        `presence:${userId}`,
        JSON.stringify({ status: "online", lastSeenAt: now }),
        PRESENCE_TTL
      );
    } catch (err) {
      console.error("[ws] heartbeat error:", err);
    }
  });
}
