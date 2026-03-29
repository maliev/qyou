import { generateSecret, generateSync, verifySync, generateURI } from "otplib";
import * as QRCode from "qrcode";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../db";

const BCRYPT_ROUNDS = 12;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const APP_NAME = "Qyou";

export function createSecret(username: string): {
  secret: string;
  otpauthUrl: string;
} {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: APP_NAME,
    label: username,
    secret,
  });
  return { secret, otpauthUrl };
}

export async function createQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(
      crypto
        .randomBytes(BACKUP_CODE_LENGTH)
        .toString("hex")
        .slice(0, BACKUP_CODE_LENGTH)
        .toUpperCase()
    );
  }
  return codes;
}

async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)));
}

export function verifyToken(secret: string, token: string): boolean {
  const result = verifySync({ token, secret });
  return result.valid;
}

export async function verifyBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT totp_backup_codes FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return false;

  const hashedCodes: string[] = result.rows[0].totp_backup_codes || [];

  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(code.toUpperCase(), hashedCodes[i]);
    if (match) {
      // Remove used backup code (single use)
      const updated = [...hashedCodes];
      updated.splice(i, 1);
      await pool.query(
        `UPDATE users SET totp_backup_codes = $1 WHERE id = $2`,
        [updated, userId]
      );
      return true;
    }
  }

  return false;
}

export async function setupTOTP(
  userId: string,
  username: string
): Promise<{
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}> {
  const { secret, otpauthUrl } = createSecret(username);
  const qrCodeUrl = await createQRCode(otpauthUrl);
  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  // Save secret and backup codes, but don't enable yet
  await pool.query(
    `UPDATE users SET totp_secret = $1, totp_backup_codes = $2 WHERE id = $3`,
    [secret, hashedCodes, userId]
  );

  return { secret, qrCodeUrl, backupCodes };
}

export async function enableTOTP(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET totp_enabled = true WHERE id = $1`,
    [userId]
  );
}

export async function disableTOTP(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET totp_secret = NULL, totp_enabled = false, totp_backup_codes = '{}' WHERE id = $1`,
    [userId]
  );
}

export async function getTOTPSecret(
  userId: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT totp_secret FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.totp_secret ?? null;
}

export async function isTOTPEnabled(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT totp_enabled FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.totp_enabled ?? false;
}
