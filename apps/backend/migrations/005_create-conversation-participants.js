/**
 * Migration: Create conversation_participants table
 */
exports.up = (pgm) => {
  pgm.createTable("conversation_participants", {
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    joined_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.addConstraint("conversation_participants", "conversation_participants_pkey", {
    primaryKey: ["conversation_id", "user_id"],
  });

  pgm.createIndex("conversation_participants", "user_id", {
    name: "idx_conversation_participants_user_id",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("conversation_participants");
};
