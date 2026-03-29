/**
 * Migration: Create E2EE key tables and update messages for encryption support
 *
 * Creates tables for Signal protocol key management:
 * - identity_keys: permanent identity keys (one per user)
 * - signed_prekeys: periodically rotated signed prekeys
 * - one_time_prekeys: single-use prekeys consumed on first message
 * - e2ee_sessions: tracks which conversations have E2EE established
 *
 * Also adds encrypted_content and is_encrypted columns to messages.
 */
exports.up = (pgm) => {
  // Identity keys (one per user, permanent)
  pgm.sql(`
    CREATE TABLE identity_keys (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      registration_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Signed prekeys (rotate periodically)
  pgm.sql(`
    CREATE TABLE signed_prekeys (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, key_id)
    )
  `);

  // One-time prekeys (consumed on first message)
  pgm.sql(`
    CREATE TABLE one_time_prekeys (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, key_id)
    )
  `);

  // Track which conversations have E2EE established
  pgm.sql(`
    CREATE TABLE e2ee_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      initiator_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(conversation_id)
    )
  `);

  // Add encrypted message columns to the parent messages table
  // This propagates to all existing and future partitions
  pgm.sql(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS encrypted_content TEXT
  `);

  // Indexes for key lookups
  pgm.sql(`CREATE INDEX idx_signed_prekeys_user_id ON signed_prekeys (user_id)`);
  pgm.sql(`CREATE INDEX idx_one_time_prekeys_user_id ON one_time_prekeys (user_id)`);
  pgm.sql(`CREATE INDEX idx_e2ee_sessions_conversation_id ON e2ee_sessions (conversation_id)`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE messages DROP COLUMN IF EXISTS encrypted_content`);
  pgm.sql(`ALTER TABLE messages DROP COLUMN IF EXISTS is_encrypted`);
  pgm.sql(`DROP TABLE IF EXISTS e2ee_sessions`);
  pgm.sql(`DROP TABLE IF EXISTS one_time_prekeys`);
  pgm.sql(`DROP TABLE IF EXISTS signed_prekeys`);
  pgm.sql(`DROP TABLE IF EXISTS identity_keys`);
};
