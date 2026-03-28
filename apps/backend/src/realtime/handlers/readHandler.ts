import { Server, Socket } from "socket.io";
import { pool } from "../../db";

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on("message:read", async (payload, ack) => {
    try {
      const { conversationId, messageIds } = payload || {};

      if (!conversationId || !Array.isArray(messageIds) || messageIds.length === 0) {
        return ack?.({ success: false });
      }

      const now = new Date().toISOString();

      // Upsert message_status for each message
      for (const messageId of messageIds) {
        await pool.query(
          `INSERT INTO message_status (message_id, user_id, status, updated_at)
           VALUES ($1, $2, 'read', $3)
           ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = $3`,
          [messageId, userId, now]
        );
      }

      // Emit to conversation room so senders see the read receipt
      socket.to(`conversation:${conversationId}`).emit("message:read", {
        conversationId,
        messageIds,
        userId,
        readAt: now,
      });

      ack?.({ success: true });
    } catch (err) {
      console.error("[ws] message:read error:", err);
      ack?.({ success: false });
    }
  });
}
