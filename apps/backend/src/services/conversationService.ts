import { pool } from "../db";
import { safeRedisPublish } from "../utils/gracefulRedis";
import {
  getReactionsForMessages,
  getReplyPreviews,
  getForwardPreviews,
} from "./messageService";

function toPublicUser(row: any) {
  return {
    id: row.id || row.user_id,
    uin: row.uin,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    country: row.country,
    last_seen_at: row.last_seen_at,
    created_at: row.user_created_at || row.created_at,
  };
}

export async function getUserConversationIds(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT conversation_id FROM conversation_participants WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((r) => r.conversation_id);
}

export async function getContactUserIds(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT contact_id FROM contacts WHERE user_id = $1 AND status = 'accepted'`,
    [userId]
  );
  return result.rows.map((r) => r.contact_id);
}

export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  // Find existing conversation between these two users
  const existing = await pool.query(
    `SELECT cp1.conversation_id
     FROM conversation_participants cp1
     JOIN conversation_participants cp2
       ON cp1.conversation_id = cp2.conversation_id
     WHERE cp1.user_id = $1 AND cp2.user_id = $2`,
    [userIdA, userIdB]
  );

  if (existing.rows.length > 0) {
    const convId = existing.rows[0].conversation_id;
    return getConversationById(convId, userIdA);
  }

  // Create new conversation
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const convResult = await client.query(
      `INSERT INTO conversations DEFAULT VALUES RETURNING *`
    );
    const conv = convResult.rows[0];

    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [conv.id, userIdA, userIdB]
    );

    await client.query("COMMIT");

    return getConversationById(conv.id, userIdA);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getConversations(userId: string, limit = 20, offset = 0) {
  // Get conversations with the other participant, last message, and unread count
  const result = await pool.query(
    `SELECT
       c.id AS conversation_id,
       c.created_at AS conversation_created_at,
       -- Other participant
       u.id AS user_id, u.uin, u.username, u.display_name,
       u.avatar_url, u.bio, u.country, u.last_seen_at,
       u.created_at AS user_created_at,
       -- Last message (lateral join)
       lm.id AS last_msg_id,
       lm.sender_id AS last_msg_sender_id,
       lm.content AS last_msg_content,
       lm.created_at AS last_msg_created_at,
       lm.edited_at AS last_msg_edited_at,
       -- Unread count
       COALESCE(unread.count, 0)::int AS unread_count
     FROM conversation_participants my_cp
     JOIN conversations c ON c.id = my_cp.conversation_id
     JOIN conversation_participants other_cp
       ON other_cp.conversation_id = c.id AND other_cp.user_id != $1
     JOIN users u ON u.id = other_cp.user_id
     LEFT JOIN LATERAL (
       SELECT m.id, m.sender_id, m.content, m.created_at, m.edited_at
       FROM messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS count
       FROM messages m2
       WHERE m2.conversation_id = c.id
         AND m2.sender_id != $1
         AND NOT EXISTS (
           SELECT 1 FROM message_status ms
           WHERE ms.message_id = m2.id AND ms.user_id = $1 AND ms.status = 'read'
         )
     ) unread ON true
     WHERE my_cp.user_id = $1
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM conversation_participants
     WHERE user_id = $1`,
    [userId]
  );

  const conversations = result.rows.map((row) => ({
    id: row.conversation_id,
    participants: [toPublicUser(row)],
    last_message: row.last_msg_id
      ? {
          id: row.last_msg_id,
          conversation_id: row.conversation_id,
          sender_id: row.last_msg_sender_id,
          content: row.last_msg_content,
          status: "sent",
          created_at: row.last_msg_created_at,
          edited_at: row.last_msg_edited_at,
        }
      : null,
    unread_count: row.unread_count,
    created_at: row.conversation_created_at,
  }));

  return { conversations, total: countResult.rows[0].total };
}

export async function getConversationById(conversationId: string, userId: string) {
  // Verify conversation exists
  const convResult = await pool.query(
    `SELECT * FROM conversations WHERE id = $1`,
    [conversationId]
  );
  if (convResult.rows.length === 0) {
    return { error: { status: 404, message: "Conversation not found" } };
  }

  // Verify user is a participant
  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  // Get all participants with user profiles
  const participants = await pool.query(
    `SELECT u.id, u.uin, u.username, u.display_name, u.avatar_url,
            u.bio, u.country, u.last_seen_at, u.created_at AS user_created_at
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = $1`,
    [conversationId]
  );

  // Get last message
  const lastMsg = await pool.query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );

  const conv = convResult.rows[0];

  return {
    conversation: {
      id: conv.id,
      participants: participants.rows.map(toPublicUser),
      last_message: lastMsg.rows.length > 0
        ? {
            id: lastMsg.rows[0].id,
            conversation_id: lastMsg.rows[0].conversation_id,
            sender_id: lastMsg.rows[0].sender_id,
            content: lastMsg.rows[0].content,
            status: "sent",
            created_at: lastMsg.rows[0].created_at,
            edited_at: lastMsg.rows[0].edited_at,
          }
        : null,
      created_at: conv.created_at,
    },
  };
}

export async function getMessages(
  conversationId: string,
  userId: string,
  before?: string,
  limit = 50
) {
  // Verify conversation exists
  const convCheck = await pool.query(
    `SELECT id FROM conversations WHERE id = $1`,
    [conversationId]
  );
  if (convCheck.rows.length === 0) {
    return { error: { status: 404, message: "Conversation not found" } };
  }

  // Verify participant
  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const clampedLimit = Math.min(limit, 50);

  let messages;
  if (before) {
    // Keyset pagination: get created_at of the "before" message
    const cursorResult = await pool.query(
      `SELECT created_at FROM messages WHERE id = $1 AND conversation_id = $2`,
      [before, conversationId]
    );

    if (cursorResult.rows.length === 0) {
      // Invalid cursor, just return from the start
      messages = await pool.query(
        `SELECT m.*, u.uin AS sender_uin, u.username AS sender_username,
                u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1
           AND m.is_deleted = false AND NOT ($2::uuid = ANY(m.deleted_for))
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [conversationId, userId, clampedLimit + 1]
      );
    } else {
      const cursorTime = cursorResult.rows[0].created_at;
      messages = await pool.query(
        `SELECT m.*, u.uin AS sender_uin, u.username AS sender_username,
                u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1 AND m.created_at < $2
           AND m.is_deleted = false AND NOT ($3::uuid = ANY(m.deleted_for))
         ORDER BY m.created_at DESC
         LIMIT $4`,
        [conversationId, cursorTime, userId, clampedLimit + 1]
      );
    }
  } else {
    messages = await pool.query(
      `SELECT m.*, u.uin AS sender_uin, u.username AS sender_username,
              u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
         AND m.is_deleted = false AND NOT ($2::uuid = ANY(m.deleted_for))
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [conversationId, userId, clampedLimit + 1]
    );
  }

  const hasMore = messages.rows.length > clampedLimit;
  const rows = hasMore ? messages.rows.slice(0, clampedLimit) : messages.rows;

  // Batch-fetch reactions, reply previews, forward previews
  const messageIds = rows.map((r: any) => r.id);
  const replyToIds = rows
    .filter((r: any) => r.reply_to_id)
    .map((r: any) => r.reply_to_id);
  const forwardedFromIds = rows
    .filter((r: any) => r.forwarded_from_id)
    .map((r: any) => r.forwarded_from_id);

  const [reactionsMap, replyMap, forwardMap] = await Promise.all([
    getReactionsForMessages(messageIds),
    getReplyPreviews(replyToIds),
    getForwardPreviews(forwardedFromIds),
  ]);

  return {
    messages: rows.map((row: any) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      sender: {
        id: row.sender_id,
        uin: row.sender_uin,
        username: row.sender_username,
        display_name: row.sender_display_name,
        avatar_url: row.sender_avatar_url,
      },
      content: row.content,
      status: "sent",
      created_at: row.created_at,
      edited_at: row.edited_at,
      reply_to_id: row.reply_to_id,
      reply_to: row.reply_to_id ? (replyMap[row.reply_to_id] || null) : null,
      is_edited: row.is_edited ?? false,
      is_deleted: row.is_deleted ?? false,
      is_pinned: row.is_pinned ?? false,
      forwarded_from_id: row.forwarded_from_id,
      forwarded_from: row.forwarded_from_id ? (forwardMap[row.forwarded_from_id] || null) : null,
      reactions: reactionsMap[row.id] || [],
    })),
    hasMore,
  };
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
  replyToId?: string
) {
  // Verify conversation exists
  const convCheck = await pool.query(
    `SELECT id FROM conversations WHERE id = $1`,
    [conversationId]
  );
  if (convCheck.rows.length === 0) {
    return { error: { status: 404, message: "Conversation not found" } };
  }

  // Verify sender is participant
  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, senderId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  // Insert message
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, content, reply_to_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, senderId, content, replyToId || null]
  );

  const msg = result.rows[0];

  // Get sender profile
  const senderResult = await pool.query(
    `SELECT id, uin, username, display_name, avatar_url FROM users WHERE id = $1`,
    [senderId]
  );
  const sender = senderResult.rows[0];

  const message = {
    id: msg.id,
    conversation_id: msg.conversation_id,
    sender_id: msg.sender_id,
    sender: {
      id: sender.id,
      uin: sender.uin,
      username: sender.username,
      display_name: sender.display_name,
      avatar_url: sender.avatar_url,
    },
    content: msg.content,
    status: "sent",
    created_at: msg.created_at,
    edited_at: msg.edited_at,
    reply_to_id: msg.reply_to_id || null,
    reply_to: null as { id: string; content: string; sender_id: string; sender_name: string } | null,
    is_edited: false,
    is_deleted: false,
    is_pinned: false,
    forwarded_from_id: msg.forwarded_from_id || null,
    forwarded_from: null,
    reactions: [],
  };

  // Fetch reply preview if replying
  if (msg.reply_to_id) {
    const replyPreviews = await getReplyPreviews([msg.reply_to_id]);
    message.reply_to = replyPreviews[msg.reply_to_id] || null;
  }

  // Publish to Redis for realtime delivery
  await safeRedisPublish(
    `conversation:${conversationId}`,
    JSON.stringify({ event: "message:new", data: message })
  );

  return { message };
}
