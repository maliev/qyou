/**
 * Migration: Create message_reactions table (Phase 2)
 */
exports.up = (pgm) => {
  pgm.createTable("message_reactions", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    message_id: {
      type: "uuid",
      notNull: true,
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    emoji: {
      type: "varchar(10)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.addConstraint("message_reactions", "message_reactions_unique", {
    unique: ["message_id", "user_id", "emoji"],
  });

  pgm.createIndex("message_reactions", "message_id", {
    name: "idx_message_reactions_message_id",
  });
  pgm.createIndex("message_reactions", "user_id", {
    name: "idx_message_reactions_user_id",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("message_reactions");
};
