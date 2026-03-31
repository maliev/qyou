/**
 * Migration: Add e2ee_enabled flag to conversations table
 */
exports.up = (pgm) => {
  pgm.addColumns("conversations", {
    e2ee_enabled: {
      type: "boolean",
      notNull: true,
      default: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("conversations", ["e2ee_enabled"]);
};
