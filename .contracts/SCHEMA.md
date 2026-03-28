# Qyou — PostgreSQL Schema (Phase 1)

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

## Tables

### users

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uin         SERIAL UNIQUE NOT NULL,                        -- Numeric user ID (like ICQ UIN), auto-generated
  username    VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,                       -- bcrypt hash, cost 12
  avatar_url  TEXT,                                          -- URL to avatar image (S3 or local storage)
  bio         VARCHAR(500),
  country     VARCHAR(2),                                    -- ISO 3166-1 alpha-2 country code
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_uin ON users (uin);
CREATE INDEX idx_users_country ON users (country);
CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops);  -- For ILIKE search
```

> **Note:** The trigram index requires `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

---

### refresh_tokens

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,                         -- SHA-256 hash of the refresh token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ                                    -- NULL = active; set when revoked or rotated
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
```

> **Note:** Refresh tokens are also cached in Redis (key: `rt:<userId>`) for fast lookup. The DB is the source of truth; Redis is a performance layer.

---

### contacts

```sql
CREATE TYPE contact_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE contacts (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      contact_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, contact_id),
  CHECK (user_id <> contact_id)                              -- Cannot add yourself as contact
);

CREATE INDEX idx_contacts_contact_id ON contacts (contact_id);
CREATE INDEX idx_contacts_status ON contacts (status);
```

> **Note:** A contact request from A→B creates one row `(A, B, 'pending')`. When B accepts, the row is updated to `'accepted'` and a reciprocal row `(B, A, 'accepted')` is inserted. This allows each user to independently manage their contact list.

---

### conversations

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Note:** This table is intentionally minimal. It serves as a grouping entity. Metadata (like group name, avatar) will be added in future phases for group chat support.

---

### conversation_participants

```sql
CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_user_id ON conversation_participants (user_id);
```

---

### messages

```sql
CREATE TABLE messages (
  id              UUID NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at       TIMESTAMPTZ,                               -- NULL = never edited

  PRIMARY KEY (id, created_at)                               -- Composite PK required for partitioning
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_sender_id ON messages (sender_id);
CREATE INDEX idx_messages_created_at ON messages (created_at DESC);
```

#### Partition creation (monthly)

```sql
-- Example: create partitions for 2025
CREATE TABLE messages_2025_01 PARTITION OF messages
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE messages_2025_02 PARTITION OF messages
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- ... repeat for each month
-- Automate with pg_partman or a cron job
```

> **Note:** A `create_monthly_partition()` function should run on the 1st of each month to create the next month's partition in advance.

---

### message_status

```sql
CREATE TYPE message_delivery_status AS ENUM ('delivered', 'read');

CREATE TABLE message_status (
  message_id  UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      message_delivery_status NOT NULL DEFAULT 'delivered',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_message_status_user_id ON message_status (user_id);
CREATE INDEX idx_message_status_status ON message_status (status);
```

> **Note:** `message_status` does not have a FK to `messages` because of the partitioned table constraint. Application-level integrity is enforced instead.

---

### push_tokens

```sql
CREATE TABLE push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    VARCHAR(10) NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, token)
);

CREATE INDEX idx_push_tokens_user_id ON push_tokens (user_id);
```

> **Note:** This table is created now for schema stability but will not be actively used until Phase 3 (push notifications).

---

## Summary of ON DELETE behavior

| Parent table | Child table | ON DELETE |
|---|---|---|
| users | refresh_tokens | CASCADE |
| users | contacts (user_id) | CASCADE |
| users | contacts (contact_id) | CASCADE |
| users | conversation_participants | CASCADE |
| users | messages (sender_id) | SET NULL |
| users | message_status | CASCADE |
| users | push_tokens | CASCADE |
| conversations | conversation_participants | CASCADE |
| conversations | messages | CASCADE |
