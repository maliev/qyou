import { Server, Socket } from "socket.io";
import { safeRedisSet, safeRedisGet } from "../../utils/gracefulRedis";
import { pool } from "../../db";
import { getUserConversationIds, getContactUserIds } from "../../services/conversationService";

const PRESENCE_TTL = 35;

async function setOnline(userId: string) {
  const now = new Date().toISOString();
  await safeRedisSet(`presence:${userId}`, JSON.stringify({ status: "online", lastSeenAt: now }), PRESENCE_TTL);
  await pool.query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId]);
}

async function setOffline(userId: string) {
  const now = new Date().toISOString();
  await safeRedisSet(`presence:${userId}`, JSON.stringify({ status: "offline", lastSeenAt: now }), 86400);
  await pool.query(`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, [userId]);
}

async function broadcastPresence(io: Server, userId: string, status: "online" | "offline") {
  const now = new Date().toISOString();
  const contactIds = await getContactUserIds(userId);
  for (const contactId of contactIds) {
    io.to(`user:${contactId}`).emit("presence:update", {
      userId,
      status,
      lastSeenAt: now,
    });
  }
}

async function getLastSeenAt(userId: string): Promise<string> {
  // Try Redis first
  const redisData = await safeRedisGet(`presence:${userId}`);
  if (redisData) {
    try {
      const parsed = JSON.parse(redisData);
      if (parsed.lastSeenAt) return parsed.lastSeenAt;
    } catch { /* fall through to DB */ }
  }
  // Fallback to DB
  const result = await pool.query(
    `SELECT last_seen_at FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length > 0 && result.rows[0].last_seen_at) {
    return new Date(result.rows[0].last_seen_at).toISOString();
  }
  return new Date().toISOString();
}

async function getConversationsWithNewMessages(
  userId: string,
  since: string,
  conversationIds: string[]
): Promise<string[]> {
  if (conversationIds.length === 0) return [];

  const result = await pool.query(
    `SELECT DISTINCT m.conversation_id
     FROM messages m
     WHERE m.conversation_id = ANY($1::uuid[])
       AND m.sender_id != $2
       AND m.created_at > $3
       AND m.is_deleted = false`,
    [conversationIds, userId, since]
  );
  return result.rows.map((r) => r.conversation_id);
}

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  // On connect
  (async () => {
    // Get user's last_seen_at BEFORE updating it (to calculate sync window)
    const lastSeenAt = await getLastSeenAt(userId);

    // Join personal room
    socket.join(`user:${userId}`);

    // Join all conversation rooms
    const convIds = await getUserConversationIds(userId);
    for (const convId of convIds) {
      socket.join(`conversation:${convId}`);
    }

    // Set presence online
    await setOnline(userId);

    // Broadcast to contacts
    await broadcastPresence(io, userId, "online");

    // Emit sync:required with conversations that have new messages since last seen
    const conversationsWithNew = await getConversationsWithNewMessages(userId, lastSeenAt, convIds);
    if (conversationsWithNew.length > 0) {
      socket.emit("sync:required", {
        conversationIds: conversationsWithNew,
        since: lastSeenAt,
      });
    }

    console.log(`[ws] ${userId} connected (socket ${socket.id})`);
  })().catch((err) => console.error("[ws] connect error:", err));

  // On disconnect
  socket.on("disconnect", async () => {
    try {
      await setOffline(userId);
      await broadcastPresence(io, userId, "offline");
      console.log(`[ws] ${userId} disconnected (socket ${socket.id})`);
    } catch (err) {
      console.error("[ws] disconnect error:", err);
    }
  });
}

export { PRESENCE_TTL };
