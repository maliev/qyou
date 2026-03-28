import { Server, Socket } from "socket.io";
import { safeRedisSet } from "../../utils/gracefulRedis";
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

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  // On connect
  (async () => {
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
