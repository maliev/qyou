# Qyou — WebSocket Event Protocol (Phase 1)

Transport: Socket.io v4
Namespace: `/` (default)

## Connection

### Authentication

The client sends the JWT access token during the Socket.io handshake:

```ts
const socket = io("ws://localhost:3001", {
  auth: {
    token: "<access_token>"
  }
});
```

The server validates the token in the `connection` middleware. If invalid, the connection is rejected with:

```ts
{
  message: "Authentication failed"
}
```

On successful connection, the server:
1. Adds the socket to a room named after the user's ID (`room = userId`)
2. Updates `last_seen_at` in the database
3. Sets presence to `online` in Redis (`presence:<userId>` with TTL 60s)
4. Broadcasts `presence:update` to the user's contacts

---

## Events

### message:send

**Direction:** client → server

**When:** User sends a message in a conversation.

**Payload:**
```ts
{
  conversationId: string  // UUID
  content: string         // 1–5000 chars
  tempId: string          // Client-generated UUID for optimistic UI matching
}
```

**Acknowledgement:**
```ts
{
  success: true
  message: Message        // Full message object with server-generated id and created_at
  tempId: string          // Echoed back so client can match optimistic message
}
// or
{
  success: false
  error: string
  tempId: string
}
```

**Server behavior:**
1. Validates payload
2. Verifies sender is a participant
3. Persists message to DB
4. Emits `message:new` to all other participants
5. Acknowledges the sender

---

### message:new

**Direction:** server → client

**When:** A new message is created in a conversation the user participates in.

**Payload:**
```ts
{
  message: Message        // Full message object
  conversationId: string  // UUID
}
```

**Note:** This is NOT sent to the sender — they receive the message via the `message:send` acknowledgement.

---

### message:delivered

**Direction:** server → client

**When:** A message sent by the user has been delivered to the recipient (recipient's client received `message:new`).

**Payload:**
```ts
{
  messageId: string       // UUID
  conversationId: string  // UUID
  userId: string          // UUID of the user who received it
  deliveredAt: string     // ISO 8601 timestamp
}
```

**Server behavior:**
1. When a client receives `message:new`, the server automatically creates a `delivered` status record
2. The server then emits `message:delivered` to the sender

---

### message:read

**Direction:** client → server + server → client

**When (client → server):** User opens/views a conversation, marking messages as read.

**Client → Server payload:**
```ts
{
  conversationId: string  // UUID
  messageIds: string[]    // UUIDs of messages being marked as read
}
```

**Acknowledgement:**
```ts
{
  success: true
}
```

**Server → Client payload** (sent to the original message senders):
```ts
{
  conversationId: string  // UUID
  messageIds: string[]    // UUIDs of messages that were read
  userId: string          // UUID of the user who read them
  readAt: string          // ISO 8601 timestamp
}
```

**Server behavior:**
1. Updates `message_status` records to `read`
2. Emits `message:read` to the senders of those messages

---

### typing:start

**Direction:** client → server

**When:** User starts typing in a conversation.

**Payload:**
```ts
{
  conversationId: string  // UUID
}
```

**No acknowledgement.**

**Server behavior:**
1. Emits `typing` event to other participants in the conversation
2. Sets a Redis key `typing:<conversationId>:<userId>` with 5s TTL

---

### typing:stop

**Direction:** client → server

**When:** User stops typing (e.g., cleared the input, sent the message, or 5s timeout on client side).

**Payload:**
```ts
{
  conversationId: string  // UUID
}
```

**No acknowledgement.**

**Server behavior:**
1. Emits `typing` event to other participants with `isTyping: false`
2. Deletes the Redis key `typing:<conversationId>:<userId>`

---

### typing

**Direction:** server → client

**When:** Another user in the conversation starts or stops typing.

**Payload:**
```ts
{
  conversationId: string  // UUID
  userId: string          // UUID of the user who is typing
  isTyping: boolean
}
```

---

### presence:update

**Direction:** server → client

**When:** A user in the client's contact list comes online or goes offline.

**Payload:**
```ts
{
  userId: string          // UUID
  status: "online" | "offline"
  lastSeenAt: string      // ISO 8601 timestamp (set when going offline)
}
```

**Server behavior:**
- On connect: set `presence:<userId>` in Redis with 60s TTL, broadcast `online` to contacts
- Heartbeat: client sends `ping` every 30s, server refreshes Redis TTL
- On disconnect: delete `presence:<userId>`, update `last_seen_at` in DB, broadcast `offline` to contacts
- TTL expiry (missed heartbeats): same as disconnect

---

### presence:get

**Direction:** client → server

**When:** Client wants to know the current presence status of specific users (e.g., on initial load).

**Payload:**
```ts
{
  userIds: string[]       // UUIDs to check (max 100)
}
```

**Acknowledgement:**
```ts
{
  presences: Array<{
    userId: string
    status: "online" | "offline"
    lastSeenAt: string    // ISO 8601 timestamp
  }>
}
```

**Server behavior:**
1. Checks Redis for each user's presence key
2. Falls back to `last_seen_at` from DB for offline users

---

## Error Event

**Direction:** server → client

**Event name:** `error`

**Payload:**
```ts
{
  code: string            // e.g., "UNAUTHORIZED", "VALIDATION_ERROR", "INTERNAL_ERROR"
  message: string         // Human-readable error description
  event?: string          // The event that caused the error (if applicable)
}
```

---

## Redis Keys Used by WebSocket Layer

| Key pattern | Type | TTL | Description |
|---|---|---|---|
| `presence:<userId>` | String | 60s | User is online (refreshed by heartbeat) |
| `typing:<conversationId>:<userId>` | String | 5s | User is typing |
| `socket:<userId>` | Set | — | Set of socket IDs for a user (multi-device) |
