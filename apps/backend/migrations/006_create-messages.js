/**
 * Migration: Create messages table (partitioned by month)
 *
 * Uses raw SQL because node-pg-migrate does not support
 * PARTITION BY RANGE natively.
 */
exports.up = (pgm) => {
  // Create partitioned messages table
  pgm.sql(`
    CREATE TABLE messages (
      id              UUID NOT NULL DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id       UUID REFERENCES users(id) ON DELETE SET NULL,
      content         TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at       TIMESTAMPTZ,
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  // Create partitions for 2025 and 2026
  const months = [];
  for (let year = 2025; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const toYear = month === 12 ? year + 1 : year;
      const toMonth = month === 12 ? 1 : month + 1;
      const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;
      const name = `messages_${year}_${String(month).padStart(2, "0")}`;
      months.push({ name, from, to });
    }
  }

  for (const { name, from, to } of months) {
    pgm.sql(
      `CREATE TABLE ${name} PARTITION OF messages FOR VALUES FROM ('${from}') TO ('${to}')`
    );
  }

  // Create a function to auto-create future partitions
  pgm.sql(`
    CREATE OR REPLACE FUNCTION create_monthly_partition()
    RETURNS void AS $$
    DECLARE
      next_month_start DATE;
      next_month_end DATE;
      partition_name TEXT;
    BEGIN
      next_month_start := date_trunc('month', NOW()) + INTERVAL '1 month';
      next_month_end := next_month_start + INTERVAL '1 month';
      partition_name := 'messages_' || to_char(next_month_start, 'YYYY_MM');

      IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF messages FOR VALUES FROM (%L) TO (%L)',
          partition_name, next_month_start, next_month_end
        );
      END IF;
    END;
    $$ LANGUAGE plpgsql
  `);

  pgm.createIndex("messages", "conversation_id", { name: "idx_messages_conversation_id" });
  pgm.createIndex("messages", "sender_id", { name: "idx_messages_sender_id" });
  pgm.createIndex("messages", ["created_at"], {
    name: "idx_messages_created_at",
    method: "btree",
  });
};

exports.down = (pgm) => {
  pgm.sql("DROP FUNCTION IF EXISTS create_monthly_partition()");
  pgm.sql("DROP TABLE IF EXISTS messages CASCADE");
};
