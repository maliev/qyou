/**
 * Migration: Create push_tokens table (for future Phase 3 use)
 */
exports.up = (pgm) => {
  pgm.createTable("push_tokens", {
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
    token: {
      type: "text",
      notNull: true,
    },
    platform: {
      type: "varchar(10)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.addConstraint("push_tokens", "push_tokens_user_token_unique", {
    unique: ["user_id", "token"],
  });

  pgm.addConstraint("push_tokens", "push_tokens_platform_check", {
    check: "platform IN ('web', 'ios', 'android')",
  });

  pgm.createIndex("push_tokens", "user_id", { name: "idx_push_tokens_user_id" });
};

exports.down = (pgm) => {
  pgm.dropTable("push_tokens");
};
