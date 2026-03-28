/**
 * Migration: Create users table
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.up = (pgm) => {
  pgm.createExtension("uuid-ossp", { ifNotExists: true });
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createExtension("pg_trgm", { ifNotExists: true });

  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    uin: {
      type: "serial",
      unique: true,
      notNull: true,
    },
    username: {
      type: "varchar(32)",
      unique: true,
      notNull: true,
    },
    display_name: {
      type: "varchar(64)",
    },
    email: {
      type: "varchar(255)",
      unique: true,
      notNull: true,
    },
    password_hash: {
      type: "varchar(255)",
      notNull: true,
    },
    avatar_url: {
      type: "text",
    },
    bio: {
      type: "varchar(500)",
    },
    country: {
      type: "varchar(2)",
    },
    last_seen_at: {
      type: "timestamptz",
      default: pgm.func("NOW()"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.createIndex("users", "username", { name: "idx_users_username" });
  pgm.createIndex("users", "email", { name: "idx_users_email" });
  pgm.createIndex("users", "uin", { name: "idx_users_uin" });
  pgm.createIndex("users", "country", { name: "idx_users_country" });
  pgm.sql(
    'CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops)'
  );
};

exports.down = (pgm) => {
  pgm.dropTable("users");
  pgm.dropExtension("pg_trgm", { ifExists: true });
  pgm.dropExtension("pgcrypto", { ifExists: true });
  pgm.dropExtension("uuid-ossp", { ifExists: true });
};
