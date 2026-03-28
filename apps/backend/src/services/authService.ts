import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../db";
import { safeRedisSet, safeRedisGet, safeRedisDel } from "../utils/gracefulRedis";
import { config } from "../config";

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface UserRow {
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

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

async function storeRefreshToken(userId: string, tokenHash: string) {
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  await safeRedisSet(
    `rt:${tokenHash}`,
    userId,
    REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60
  );
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}) {
  // Check uniqueness
  const existing = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM users WHERE username = $1) AS username_taken,
       EXISTS(SELECT 1 FROM users WHERE email = $2) AS email_taken`,
    [input.username, input.email]
  );

  if (existing.rows[0].username_taken) {
    return { error: { status: 409, message: "Username already taken" } };
  }
  if (existing.rows[0].email_taken) {
    return { error: { status: 409, message: "Email already registered" } };
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.username, input.email, passwordHash, input.display_name || null]
  );

  const user: UserRow = result.rows[0];
  return { user: toSelfUser(user), userId: user.id };
}

export async function login(input: { login: string; password: string }) {
  const isEmail = input.login.includes("@");
  const result = await pool.query(
    isEmail
      ? `SELECT * FROM users WHERE email = $1`
      : `SELECT * FROM users WHERE username = $1`,
    [input.login]
  );

  if (result.rows.length === 0) {
    return { error: { status: 401, message: "Invalid credentials" } };
  }

  const user: UserRow = result.rows[0];
  const valid = await bcrypt.compare(input.password, user.password_hash);

  if (!valid) {
    return { error: { status: 401, message: "Invalid credentials" } };
  }

  return { user: toSelfUser(user), userId: user.id };
}

export async function createTokenPair(
  fastify: { jwt: { sign: (payload: object, opts?: object) => string } },
  userId: string
) {
  const accessToken = fastify.jwt.sign({ sub: userId });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  await storeRefreshToken(userId, tokenHash);

  return { accessToken, refreshToken };
}

export async function refreshTokens(
  fastify: { jwt: { sign: (payload: object, opts?: object) => string } },
  refreshToken: string
) {
  const tokenHash = hashToken(refreshToken);

  // Check Redis first for performance
  let userId: string | null = await safeRedisGet(`rt:${tokenHash}`);

  if (!userId) {
    // Fall back to DB
    const result = await pool.query(
      `SELECT user_id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return {
        error: { status: 401, message: "Invalid or expired refresh token" },
      };
    }

    userId = result.rows[0].user_id as string;
  }

  // Revoke old token
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  );
  await safeRedisDel(`rt:${tokenHash}`);

  // Issue new pair
  const tokens = await createTokenPair(fastify, userId as string);
  return { tokens, userId };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  );
  await safeRedisDel(`rt:${tokenHash}`);
}

export async function getMe(userId: string) {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [
    userId,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return toSelfUser(result.rows[0]);
}
