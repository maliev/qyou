import { pool } from "../db";

interface UserRow {
  id: string;
  uin: number;
  username: string;
  display_name: string | null;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  last_seen_at: string;
  created_at: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    uin: row.uin,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    country: row.country,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
  };
}

function toSelfUser(row: UserRow) {
  return {
    ...toPublicUser(row),
    email: row.email,
  };
}

export async function getUserByUin(uin: number) {
  const result = await pool.query(
    `SELECT * FROM users WHERE uin = $1`,
    [uin]
  );
  if (result.rows.length === 0) return null;
  return toPublicUser(result.rows[0]);
}

export async function getUserById(id: string) {
  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as UserRow;
}

export async function getSelf(userId: string) {
  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return toSelfUser(result.rows[0]);
}

export async function searchUsers(
  query: string,
  requestingUserId: string,
  country?: string,
  limit = 20,
  offset = 0
) {
  const asNumber = parseInt(query, 10);
  const isUin = !isNaN(asNumber) && String(asNumber) === query.trim();

  if (isUin) {
    const params: unknown[] = [asNumber, requestingUserId];
    let where = `uin = $1 AND id != $2`;
    if (country) {
      where += ` AND country = $3`;
      params.push(country);
    }

    const countParams = [...params];
    params.push(limit, offset);
    const pLimit = params.length - 1;
    const pOffset = params.length;

    const [results, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM users WHERE ${where} LIMIT $${pLimit} OFFSET $${pOffset}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM users WHERE ${where}`, countParams),
    ]);

    return {
      users: results.rows.map(toPublicUser),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  // Text search using ILIKE (leverages pg_trgm GIN index)
  const pattern = `%${query}%`;

  if (country) {
    const [results, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM users
         WHERE id != $1
           AND (username ILIKE $2 OR display_name ILIKE $2)
           AND country = $3
         ORDER BY similarity(username, $4::text) DESC
         LIMIT $5 OFFSET $6`,
        [requestingUserId, pattern, country, query, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM users
         WHERE id != $1
           AND (username ILIKE $2 OR display_name ILIKE $2)
           AND country = $3`,
        [requestingUserId, pattern, country]
      ),
    ]);

    return {
      users: results.rows.map(toPublicUser),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  const [results, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM users
       WHERE id != $1
         AND (username ILIKE $2 OR display_name ILIKE $2)
       ORDER BY similarity(username, $3::text) DESC
       LIMIT $4 OFFSET $5`,
      [requestingUserId, pattern, query, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) FROM users
       WHERE id != $1
         AND (username ILIKE $2 OR display_name ILIKE $2)`,
      [requestingUserId, pattern]
    ),
  ]);

  return {
    users: results.rows.map(toPublicUser),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function updateProfile(
  userId: string,
  data: {
    display_name?: string;
    bio?: string;
    country?: string;
    username?: string;
  }
) {
  // Check username uniqueness if being changed
  if (data.username) {
    const existing = await pool.query(
      `SELECT id FROM users WHERE username = $1 AND id != $2`,
      [data.username, userId]
    );
    if (existing.rows.length > 0) {
      return { error: { status: 409, message: "Username already taken" } };
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIdx++}`);
    values.push(data.display_name);
  }
  if (data.bio !== undefined) {
    setClauses.push(`bio = $${paramIdx++}`);
    values.push(data.bio);
  }
  if (data.country !== undefined) {
    setClauses.push(`country = $${paramIdx++}`);
    values.push(data.country);
  }
  if (data.username !== undefined) {
    setClauses.push(`username = $${paramIdx++}`);
    values.push(data.username);
  }

  if (setClauses.length === 0) {
    return { error: { status: 400, message: "Invalid input" } };
  }

  values.push(userId);
  const result = await pool.query(
    `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return null;
  return { user: toSelfUser(result.rows[0]) };
}

export async function updateAvatar(userId: string, avatarUrl: string) {
  const result = await pool.query(
    `UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url`,
    [avatarUrl, userId]
  );
  if (result.rows.length === 0) return null;
  return { avatar_url: result.rows[0].avatar_url as string };
}
