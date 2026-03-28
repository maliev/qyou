/**
 * Migration: Create conversations table
 */
exports.up = (pgm) => {
  pgm.createTable("conversations", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("conversations");
};
