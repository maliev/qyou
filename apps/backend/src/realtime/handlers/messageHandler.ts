import { Server, Socket } from "socket.io";
import { createMessage } from "../../services/conversationService";
import { pool } from "../../db";

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on("message:send", async (payload, ack) => {
    const tempId = payload?.tempId || "";

    try {
      const { conversationId, content, replyToId } = payload || {};

      if (!conversationId || typeof content !== "string" || content.length === 0 || content.length > 5000) {
        return ack?.({ success: false, error: "Invalid payload", tempId });
      }

      const result = await createMessage(conversationId, userId, content, replyToId);

      if ("error" in result) {
        return ack?.({ success: false, error: result.error.message, tempId });
      }

      const message = result.message;

      // Emit to conversation room (excluding sender)
      socket.to(`conversation:${conversationId}`).emit("message:new", {
        message,
        conversationId,
      });

      // Track delivery to online recipients and emit message:delivered
      const participants = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [conversationId, userId]
      );

      const now = new Date().toISOString();
      for (const row of participants.rows) {
        const recipientRoom = `user:${row.user_id}`;
        const sockets = await io.in(recipientRoom).fetchSockets();
        if (sockets.length > 0) {
          // Recipient is online — mark delivered
          await pool.query(
            `INSERT INTO message_status (message_id, user_id, status, updated_at)
             VALUES ($1, $2, 'delivered', NOW())
             ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()`,
            [message.id, row.user_id]
          );

          // Notify sender
          io.to(`user:${userId}`).emit("message:delivered", {
            messageId: message.id,
            conversationId,
            userId: row.user_id,
            deliveredAt: now,
          });
        }
      }

      // Acknowledge sender
      ack?.({ success: true, message, tempId });
    } catch (err) {
      console.error("[ws] message:send error:", err);
      ack?.({ success: false, error: "Internal error", tempId });
    }
  });
}
