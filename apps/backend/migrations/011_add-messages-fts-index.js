/**
 * Migration: Add full-text search column and GIN index to messages table
 *
 * Adds a generated tsvector column for fast full-text search using
 * PostgreSQL's built-in FTS capabilities. Applied to the default
 * partition and all existing monthly partitions.
 */
exports.up = (pgm) => {
  // Add the generated tsvector column to the parent table.
  // Because messages is partitioned, this propagates to all partitions.
  pgm.sql(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
  `);

  // Create GIN index on the parent table — PostgreSQL propagates to partitions
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS messages_fts_idx
      ON messages USING GIN(search_vector)
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS messages_fts_idx`);
  pgm.sql(`ALTER TABLE messages DROP COLUMN IF EXISTS search_vector`);
};
