/**
 * Migration: Add 2FA (TOTP) columns to users table
 *
 * Adds:
 * - totp_secret: encrypted TOTP secret for authenticator apps
 * - totp_enabled: whether 2FA is active for this user
 * - totp_backup_codes: array of hashed backup codes (single-use)
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS totp_secret TEXT,
      ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[] DEFAULT '{}'
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS totp_backup_codes,
      DROP COLUMN IF EXISTS totp_enabled,
      DROP COLUMN IF EXISTS totp_secret
  `);
};
