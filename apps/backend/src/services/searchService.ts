import { pool } from "../db";

export interface MessageSearchResult {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
  other_participant_name: string;
  other_participant_avatar_url: string | null;
}

export async function searchMessages(
  userId: string,
  query: string,
  conversationId?: string,
  limit = 20,
  offset = 0
): Promise<MessageSearchResult[]> {
  // Try FTS first, fall back to ILIKE for stop words / short terms / FTS errors
  try {
    const results = await searchMessagesFts(userId, query, conversationId, limit, offset);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn("[search] FTS query failed, falling back to ILIKE:", err);
  }
  return searchMessagesIlike(userId, query, conversationId, limit, offset);
}

async function searchMessagesFts(
  userId: string,
  query: string,
  conversationId: string | undefined,
  limit: number,
  offset: number
): Promise<MessageSearchResult[]> {
  const params: unknown[] = [query, userId, limit, offset];
  let conversationFilter = "";

  if (conversationId) {
    conversationFilter = `AND m.conversation_id = $5`;
    params.push(conversationId);
  }

  const result = await pool.query(
    `SELECT
       m.id,
       m.conversation_id,
       m.sender_id,
       m.content,
       m.created_at,
       COALESCE(sender.display_name, sender.username) AS sender_name,
       sender.avatar_url AS sender_avatar_url,
       COALESCE(other.display_name, other.username) AS other_participant_name,
       other.avatar_url AS other_participant_avatar_url
     FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $2
     JOIN users sender ON sender.id = m.sender_id
     JOIN conversation_participants cp2 ON cp2.conversation_id = m.conversation_id AND cp2.user_id != $2
     JOIN users other ON other.id = cp2.user_id
     WHERE m.search_vector @@ plainto_tsquery('english', $1)
       AND m.is_deleted = false
       ${conversationFilter}
     ORDER BY m.created_at DESC
     LIMIT $3 OFFSET $4`,
    params
  );

  return result.rows;
}

async function searchMessagesIlike(
  userId: string,
  query: string,
  conversationId: string | undefined,
  limit: number,
  offset: number
): Promise<MessageSearchResult[]> {
  const pattern = `%${query}%`;
  const params: unknown[] = [pattern, userId, limit, offset];
  let conversationFilter = "";

  if (conversationId) {
    conversationFilter = `AND m.conversation_id = $5`;
    params.push(conversationId);
  }

  const result = await pool.query(
    `SELECT
       m.id,
       m.conversation_id,
       m.sender_id,
       m.content,
       m.created_at,
       COALESCE(sender.display_name, sender.username) AS sender_name,
       sender.avatar_url AS sender_avatar_url,
       COALESCE(other.display_name, other.username) AS other_participant_name,
       other.avatar_url AS other_participant_avatar_url
     FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $2
     JOIN users sender ON sender.id = m.sender_id
     JOIN conversation_participants cp2 ON cp2.conversation_id = m.conversation_id AND cp2.user_id != $2
     JOIN users other ON other.id = cp2.user_id
     WHERE m.content ILIKE $1
       AND m.is_deleted = false
       ${conversationFilter}
     ORDER BY m.created_at DESC
     LIMIT $3 OFFSET $4`,
    params
  );

  return result.rows;
}
