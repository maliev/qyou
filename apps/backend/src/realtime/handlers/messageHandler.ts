import { Server, Socket } from "socket.io";
import { createMessage } from "../../services/conversationService";
import { isBlocked } from "../../services/contactService";
import { pool } from "../../db";
import { safeRedisGet, safeRedisSet } from "../../utils/gracefulRedis";

const MESSAGE_RATE_LIMIT = 30; // messages per window
const MESSAGE_RATE_WINDOW = 60; // seconds

async function checkMessageRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `ratelimit:messages:${userId}`;
  const current = await safeRedisGet(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= MESSAGE_RATE_LIMIT) {
    return { allowed: false, retryAfter: MESSAGE_RATE_WINDOW };
  }

  await safeRedisSet(key, String(count + 1), MESSAGE_RATE_WINDOW);
  return { allowed: true };
}

function validateMessageContent(content: string): string | null {
  if (content.trim().length === 0) {
    return "Message cannot be empty";
  }
  if (content.length > 4000) {
    return "Message too long (max 4000 characters)";
  }
  // Check for > 50 consecutive identical chars
  if (/(.)\1{49,}/.test(content)) {
    return "Message contains spam-like content";
  }
  // Max 10 URLs
  const urlCount = (content.match(/https?:\/\//gi) || []).length;
  if (urlCount > 10) {
    return "Too many URLs in message";
  }
  return null;
}

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on("message:send", async (payload, ack) => {
    const tempId = payload?.tempId || "";

    try {
      const { conversationId, content, replyToId, encrypted_content, is_encrypted } = payload || {};

      if (!conversationId || typeof content !== "string" || content.length === 0 || content.length > 5000) {
        return ack?.({ success: false, error: "Invalid payload", tempId });
      }

      // Rate limit check
      const rateCheck = await checkMessageRateLimit(userId);
      if (!rateCheck.allowed) {
        return ack?.({
          success: false,
          error: "RATE_LIMITED",
          retryAfter: rateCheck.retryAfter,
          tempId,
        });
      }

      // Content validation (skip for encrypted messages)
      if (!is_encrypted) {
        const contentError = validateMessageContent(content);
        if (contentError) {
          return ack?.({ success: false, error: contentError, tempId });
        }
      }

      // Block check: find the other participant and check if blocked
      const otherParticipants = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [conversationId, userId]
      );
      for (const row of otherParticipants.rows) {
        const blocked = await isBlocked(userId, row.user_id);
        if (blocked) {
          return ack?.({ success: false, error: "Cannot send message to blocked user", tempId });
        }
      }

      const result = await createMessage(
        conversationId,
        userId,
        content,
        replyToId,
        is_encrypted ? encrypted_content : undefined,
        is_encrypted || false
      );

      if ("error" in result) {
        return ack?.({ success: false, error: result.error!.message, tempId });
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
