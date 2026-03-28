import { pool } from "../db";

const ALLOWED_EMOJIS = ["❤️", "🔥", "😂", "👍", "👎", "😮"];
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Verify a user is a participant in the conversation that contains the given message.
 * Returns { messageRow, conversationId } on success, or { error } on failure.
 */
async function verifyMessageAccess(messageId: string, userId: string): Promise<
  { error: { status: number; message: string } } |
  { messageRow: any; conversationId: string }
> {
  const msgResult = await pool.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
            m.edited_at, m.is_edited, m.is_deleted, m.is_pinned,
            m.reply_to_id, m.forwarded_from_id, m.deleted_for
     FROM messages m
     WHERE m.id = $1`,
    [messageId]
  );
  if (msgResult.rows.length === 0) {
    return { error: { status: 404, message: "Message not found" } };
  }

  const msg = msgResult.rows[0];

  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2`,
    [msg.conversation_id, userId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  return { messageRow: msg, conversationId: msg.conversation_id as string };
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<
  | { error: { status: number; message: string } }
  | { action: "add" | "remove"; reaction: { messageId: string; userId: string; emoji: string }; conversationId: string }
> {
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return { error: { status: 400, message: "Invalid input" } };
  }

  const access = await verifyMessageAccess(messageId, userId);
  if ("error" in access) return access;

  // Check if reaction already exists
  const existing = await pool.query(
    `SELECT id FROM message_reactions
     WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, userId, emoji]
  );

  let action: "add" | "remove";

  if (existing.rows.length > 0) {
    // Remove existing reaction
    await pool.query(
      `DELETE FROM message_reactions WHERE id = $1`,
      [existing.rows[0].id]
    );
    action = "remove";
  } else {
    // Add new reaction
    await pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)`,
      [messageId, userId, emoji]
    );
    action = "add";
  }

  return {
    action,
    reaction: { messageId, userId, emoji },
    conversationId: access.conversationId,
  };
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  const result = await pool.query(
    `DELETE FROM message_reactions
     WHERE message_id = $1 AND user_id = $2 AND emoji = $3
     RETURNING id`,
    [messageId, userId, emoji]
  );

  if (result.rows.length === 0) {
    return { error: { status: 404, message: "Reaction not found" } };
  }

  return { success: true };
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string
) {
  const access = await verifyMessageAccess(messageId, userId);
  if ("error" in access) return access;

  const msg = access.messageRow;

  if (msg.sender_id !== userId) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  if (msg.is_deleted) {
    return { error: { status: 404, message: "Message not found" } };
  }

  const elapsed = Date.now() - new Date(msg.created_at).getTime();
  if (elapsed > EDIT_WINDOW_MS) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const now = new Date().toISOString();
  const result = await pool.query(
    `UPDATE messages
     SET content = $1, edited_at = $2, is_edited = true
     WHERE id = $3
     RETURNING *`,
    [content, now, messageId]
  );

  const updated = result.rows[0];

  // Get sender profile
  const senderResult = await pool.query(
    `SELECT id, uin, username, display_name, avatar_url FROM users WHERE id = $1`,
    [userId]
  );
  const sender = senderResult.rows[0];

  return {
    message: {
      id: updated.id,
      conversation_id: updated.conversation_id,
      sender_id: updated.sender_id,
      sender: {
        id: sender.id,
        uin: sender.uin,
        username: sender.username,
        display_name: sender.display_name,
        avatar_url: sender.avatar_url,
      },
      content: updated.content,
      status: "sent",
      created_at: updated.created_at,
      edited_at: updated.edited_at,
      is_edited: updated.is_edited,
      is_deleted: updated.is_deleted,
      is_pinned: updated.is_pinned,
      reply_to_id: updated.reply_to_id,
      forwarded_from_id: updated.forwarded_from_id,
      reactions: [],
    },
    conversationId: access.conversationId,
  };
}

export async function deleteMessage(
  messageId: string,
  userId: string,
  deleteFor: "self" | "everyone"
) {
  const access = await verifyMessageAccess(messageId, userId);
  if ("error" in access) return access;

  const msg = access.messageRow;

  if (deleteFor === "everyone") {
    if (msg.sender_id !== userId) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    await pool.query(
      `UPDATE messages SET is_deleted = true WHERE id = $1`,
      [messageId]
    );
  } else {
    // deleteFor === "self"
    await pool.query(
      `UPDATE messages SET deleted_for = array_append(deleted_for, $1)
       WHERE id = $2 AND NOT ($1 = ANY(deleted_for))`,
      [userId, messageId]
    );
  }

  return {
    success: true,
    conversationId: access.conversationId,
    deleteFor,
  };
}

export async function pinMessage(
  messageId: string,
  userId: string
) {
  const access = await verifyMessageAccess(messageId, userId);
  if ("error" in access) return access;

  const msg = access.messageRow;
  const newPinned = !msg.is_pinned;

  await pool.query(
    `UPDATE messages SET is_pinned = $1 WHERE id = $2`,
    [newPinned, messageId]
  );

  return {
    isPinned: newPinned,
    messageId,
    conversationId: access.conversationId,
    pinnedBy: userId,
  };
}

export async function getPinnedMessages(
  conversationId: string,
  userId: string
) {
  // Verify participant
  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  // Verify conversation exists
  const convCheck = await pool.query(
    `SELECT id FROM conversations WHERE id = $1`,
    [conversationId]
  );
  if (convCheck.rows.length === 0) {
    return { error: { status: 404, message: "Conversation not found" } };
  }

  const result = await pool.query(
    `SELECT m.*, u.uin AS sender_uin, u.username AS sender_username,
            u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 AND m.is_pinned = true AND m.is_deleted = false
     ORDER BY m.created_at DESC`,
    [conversationId]
  );

  return {
    messages: result.rows.map((row: any) => ({
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
      is_edited: row.is_edited,
      is_deleted: row.is_deleted,
      is_pinned: row.is_pinned,
      reply_to_id: row.reply_to_id,
      forwarded_from_id: row.forwarded_from_id,
      reactions: [],
    })),
  };
}

export async function forwardMessage(
  messageId: string,
  userId: string,
  targetConversationId: string
) {
  // Verify user can access source message
  const access = await verifyMessageAccess(messageId, userId);
  if ("error" in access) return access;

  const msg = access.messageRow;

  if (msg.is_deleted) {
    return { error: { status: 404, message: "Message not found" } };
  }

  // Verify target conversation exists
  const targetConvCheck = await pool.query(
    `SELECT id FROM conversations WHERE id = $1`,
    [targetConversationId]
  );
  if (targetConvCheck.rows.length === 0) {
    return { error: { status: 404, message: "Conversation not found" } };
  }

  // Verify user is participant in target conversation
  const targetPartCheck = await pool.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2`,
    [targetConversationId, userId]
  );
  if (targetPartCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  // Create forwarded message
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, content, forwarded_from_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [targetConversationId, userId, msg.content, messageId]
  );

  const newMsg = result.rows[0];

  // Get sender profile
  const senderResult = await pool.query(
    `SELECT id, uin, username, display_name, avatar_url FROM users WHERE id = $1`,
    [userId]
  );
  const sender = senderResult.rows[0];

  // Get forwarded from preview
  const originalSenderResult = await pool.query(
    `SELECT id, username, display_name FROM users WHERE id = $1`,
    [msg.sender_id]
  );
  const originalSender = originalSenderResult.rows[0];

  return {
    message: {
      id: newMsg.id,
      conversation_id: newMsg.conversation_id,
      sender_id: newMsg.sender_id,
      sender: {
        id: sender.id,
        uin: sender.uin,
        username: sender.username,
        display_name: sender.display_name,
        avatar_url: sender.avatar_url,
      },
      content: newMsg.content,
      status: "sent",
      created_at: newMsg.created_at,
      edited_at: newMsg.edited_at,
      is_edited: false,
      is_deleted: false,
      is_pinned: false,
      reply_to_id: null,
      forwarded_from_id: newMsg.forwarded_from_id,
      forwarded_from: {
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        sender_name: originalSender.display_name || originalSender.username,
      },
      reactions: [],
    },
    targetConversationId,
  };
}

/**
 * Get reactions grouped by emoji for a list of message IDs.
 */
export async function getReactionsForMessages(
  messageIds: string[]
): Promise<Record<string, Array<{ emoji: string; count: number; user_ids: string[] }>>> {
  if (messageIds.length === 0) return {};

  const result = await pool.query(
    `SELECT message_id, emoji, array_agg(user_id) AS user_ids, COUNT(*)::int AS count
     FROM message_reactions
     WHERE message_id = ANY($1)
     GROUP BY message_id, emoji
     ORDER BY message_id, count DESC`,
    [messageIds]
  );

  const grouped: Record<string, Array<{ emoji: string; count: number; user_ids: string[] }>> = {};

  for (const row of result.rows) {
    if (!grouped[row.message_id]) {
      grouped[row.message_id] = [];
    }
    grouped[row.message_id].push({
      emoji: row.emoji,
      count: row.count,
      user_ids: row.user_ids,
    });
  }

  return grouped;
}

/**
 * Get reply-to previews for a list of reply_to_ids.
 */
export async function getReplyPreviews(
  replyToIds: string[]
): Promise<Record<string, { id: string; content: string; sender_id: string; sender_name: string }>> {
  if (replyToIds.length === 0) return {};

  const result = await pool.query(
    `SELECT m.id, m.content, m.sender_id,
            COALESCE(u.display_name, u.username) AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ANY($1)`,
    [replyToIds]
  );

  const map: Record<string, { id: string; content: string; sender_id: string; sender_name: string }> = {};
  for (const row of result.rows) {
    map[row.id] = {
      id: row.id,
      content: row.content,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
    };
  }
  return map;
}

/**
 * Get forward-from previews for a list of forwarded_from_ids.
 */
export async function getForwardPreviews(
  forwardedFromIds: string[]
): Promise<Record<string, { id: string; content: string; sender_id: string; sender_name: string }>> {
  if (forwardedFromIds.length === 0) return {};

  const result = await pool.query(
    `SELECT m.id, m.content, m.sender_id,
            COALESCE(u.display_name, u.username) AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ANY($1)`,
    [forwardedFromIds]
  );

  const map: Record<string, { id: string; content: string; sender_id: string; sender_name: string }> = {};
  for (const row of result.rows) {
    map[row.id] = {
      id: row.id,
      content: row.content,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
    };
  }
  return map;
}
