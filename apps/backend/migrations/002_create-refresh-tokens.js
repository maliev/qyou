/**
 * Migration: Create refresh_tokens table
 */
exports.up = (pgm) => {
  pgm.createTable("refresh_tokens", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    token_hash: {
      type: "varchar(255)",
      notNull: true,
    },
    expires_at: {
      type: "timestamptz",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    revoked_at: {
      type: "timestamptz",
    },
  });

  pgm.createIndex("refresh_tokens", "user_id", { name: "idx_refresh_tokens_user_id" });
  pgm.createIndex("refresh_tokens", "token_hash", { name: "idx_refresh_tokens_token_hash" });
  pgm.createIndex("refresh_tokens", "expires_at", { name: "idx_refresh_tokens_expires_at" });
};

exports.down = (pgm) => {
  pgm.dropTable("refresh_tokens");
};
