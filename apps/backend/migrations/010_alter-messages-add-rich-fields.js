/**
 * Migration: Add Phase 2 rich messaging fields to messages table
 */
exports.up = (pgm) => {
  pgm.addColumns("messages", {
    reply_to_id: {
      type: "uuid",
    },
    is_edited: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    is_deleted: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    deleted_for: {
      type: "uuid[]",
      notNull: true,
      default: "{}",
    },
    is_pinned: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    forwarded_from_id: {
      type: "uuid",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("messages", [
    "reply_to_id",
    "is_edited",
    "is_deleted",
    "deleted_for",
    "is_pinned",
    "forwarded_from_id",
  ]);
};
