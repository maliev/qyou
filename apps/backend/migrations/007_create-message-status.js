/**
 * Migration: Create message_status table with message_delivery_status enum
 *
 * No FK to messages because it is a partitioned table.
 * Application-level integrity is enforced instead.
 */
exports.up = (pgm) => {
  pgm.createType("message_delivery_status", ["delivered", "read"]);

  pgm.createTable("message_status", {
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
    status: {
      type: "message_delivery_status",
      notNull: true,
      default: "delivered",
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.addConstraint("message_status", "message_status_pkey", {
    primaryKey: ["message_id", "user_id"],
  });

  pgm.createIndex("message_status", "user_id", { name: "idx_message_status_user_id" });
  pgm.createIndex("message_status", "status", { name: "idx_message_status_status" });
};

exports.down = (pgm) => {
  pgm.dropTable("message_status");
  pgm.dropType("message_delivery_status");
};
