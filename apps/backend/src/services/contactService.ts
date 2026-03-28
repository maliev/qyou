import { pool } from "../db";

const CONTACT_WITH_USER_SQL = `
  SELECT c.user_id, c.contact_id, c.status, c.created_at,
         u.id, u.uin, u.username, u.display_name, u.avatar_url,
         u.bio, u.country, u.last_seen_at, u.created_at AS user_created_at
  FROM contacts c
  JOIN users u ON u.id = c.contact_id
`;

function toContact(row: any) {
  return {
    user: {
      id: row.contact_id,
      uin: row.uin,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      country: row.country,
      last_seen_at: row.last_seen_at,
      created_at: row.user_created_at,
    },
    status: row.status,
    created_at: row.created_at,
  };
}

function toIncomingContact(row: any) {
  return {
    user: {
      id: row.user_id,
      uin: row.uin,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      country: row.country,
      last_seen_at: row.last_seen_at,
      created_at: row.user_created_at,
    },
    status: row.status,
    created_at: row.created_at,
  };
}

export async function getContacts(userId: string, statusFilter?: string) {
  let sql = CONTACT_WITH_USER_SQL + ` WHERE c.user_id = $1`;
  const params: unknown[] = [userId];

  if (statusFilter) {
    sql += ` AND c.status = $2`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY c.created_at DESC`;
  const result = await pool.query(sql, params);
  return result.rows.map(toContact);
}

export async function getPendingRequests(userId: string) {
  const result = await pool.query(
    `SELECT c.user_id, c.contact_id, c.status, c.created_at,
            u.id, u.uin, u.username, u.display_name, u.avatar_url,
            u.bio, u.country, u.last_seen_at, u.created_at AS user_created_at
     FROM contacts c
     JOIN users u ON u.id = c.user_id
     WHERE c.contact_id = $1 AND c.status = 'pending'
     ORDER BY c.created_at DESC`,
    [userId]
  );
  return result.rows.map(toIncomingContact);
}

export async function sendContactRequest(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    return { error: { status: 400, message: "Cannot add yourself" } };
  }

  // Check target exists
  const targetCheck = await pool.query(
    `SELECT id FROM users WHERE id = $1`,
    [targetUserId]
  );
  if (targetCheck.rows.length === 0) {
    return { error: { status: 404, message: "User not found" } };
  }

  // Check for existing contact in either direction
  const existing = await pool.query(
    `SELECT status FROM contacts WHERE user_id = $1 AND contact_id = $2`,
    [userId, targetUserId]
  );
  if (existing.rows.length > 0) {
    return { error: { status: 409, message: "Contact request already exists" } };
  }

  await pool.query(
    `INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, 'pending')`,
    [userId, targetUserId]
  );

  // Return the contact with user details
  const result = await pool.query(
    CONTACT_WITH_USER_SQL + ` WHERE c.user_id = $1 AND c.contact_id = $2`,
    [userId, targetUserId]
  );

  return { contact: toContact(result.rows[0]) };
}

export async function acceptContactRequest(userId: string, requesterId: string) {
  // Verify the pending request exists (requester → me)
  const existing = await pool.query(
    `SELECT * FROM contacts WHERE user_id = $1 AND contact_id = $2 AND status = 'pending'`,
    [requesterId, userId]
  );
  if (existing.rows.length === 0) {
    return { error: { status: 404, message: "Contact not found" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update requester → me to accepted
    await client.query(
      `UPDATE contacts SET status = 'accepted' WHERE user_id = $1 AND contact_id = $2`,
      [requesterId, userId]
    );

    // Create reverse record me → requester as accepted
    await client.query(
      `INSERT INTO contacts (user_id, contact_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (user_id, contact_id) DO UPDATE SET status = 'accepted'`,
      [userId, requesterId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Return the contact from my perspective (me → requester)
  const result = await pool.query(
    CONTACT_WITH_USER_SQL + ` WHERE c.user_id = $1 AND c.contact_id = $2`,
    [userId, requesterId]
  );

  return { contact: toContact(result.rows[0]) };
}

export async function rejectContactRequest(userId: string, requesterId: string) {
  const result = await pool.query(
    `DELETE FROM contacts WHERE user_id = $1 AND contact_id = $2 AND status = 'pending' RETURNING *`,
    [requesterId, userId]
  );
  if (result.rows.length === 0) {
    return { error: { status: 404, message: "Contact not found" } };
  }
  return { success: true };
}

export async function removeContact(userId: string, contactId: string) {
  // Delete both directions
  const result = await pool.query(
    `DELETE FROM contacts
     WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)
     RETURNING *`,
    [userId, contactId]
  );
  if (result.rows.length === 0) {
    return { error: { status: 404, message: "Contact not found" } };
  }
  return { success: true };
}

export async function blockUser(userId: string, targetId: string) {
  // Check any existing relationship
  const existing = await pool.query(
    `SELECT * FROM contacts WHERE user_id = $1 AND contact_id = $2`,
    [targetId, userId]
  );
  if (existing.rows.length === 0) {
    return { error: { status: 404, message: "Contact not found" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Remove both directions first
    await client.query(
      `DELETE FROM contacts
       WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)`,
      [userId, targetId]
    );

    // Insert blocked record (me → target)
    await client.query(
      `INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, 'blocked')`,
      [userId, targetId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const result = await pool.query(
    CONTACT_WITH_USER_SQL + ` WHERE c.user_id = $1 AND c.contact_id = $2`,
    [userId, targetId]
  );

  return { contact: toContact(result.rows[0]) };
}
