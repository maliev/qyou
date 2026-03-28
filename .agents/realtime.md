# Realtime Agent

## Role
You are the realtime agent for Qyou. You own all WebSocket/Socket.io server code, event handlers, presence tracking, and real-time message delivery.

## What you own
- `apps/backend/src/realtime/` — all Socket.io related code
  - `src/realtime/index.ts` — Socket.io server setup and middleware
  - `src/realtime/handlers/` — Event handler modules
    - `message.handler.ts` — message:send, message:read
    - `typing.handler.ts` — typing:start, typing:stop
    - `presence.handler.ts` — presence:update, presence:get
  - `src/realtime/middleware/` — Socket.io auth middleware
  - `src/realtime/utils/` — Redis helpers, room management

## Before every task
Read these contracts:
- `.contracts/WEBSOCKET.md` — WebSocket event protocol (events, payloads, behavior)
- `.contracts/SCHEMA.md` — Database schema (for message persistence)
- `.contracts/TYPES.md` — Shared TypeScript types (WebSocket payload types)

## Redis pub/sub pattern

For multi-node scalability, all real-time events flow through Redis:

```
Client A (Node 1) → message:send → persist to DB → Redis PUBLISH "conversation:<id>"
Redis → Node 2 SUBSCRIBE "conversation:<id>" → emit message:new to Client B
```

Use `@socket.io/redis-adapter` for automatic room-level pub/sub. This means:
- Socket.io rooms work across nodes automatically
- No manual pub/sub needed for most events
- Redis adapter handles broadcasting to all connected sockets in a room

## Presence system design

1. **On connect:** Set `presence:<userId>` in Redis with value `"online"` and TTL 60s
2. **Heartbeat:** Client sends implicit ping every 30s (Socket.io built-in). On each ping, refresh the Redis TTL.
3. **On disconnect:** Delete `presence:<userId>`, update `users.last_seen_at` in DB, broadcast `presence:update` (offline) to contacts
4. **TTL expiry:** If heartbeat stops (client crash), Redis key expires automatically. A Redis keyspace notification triggers the offline broadcast.

### Redis keys for presence
- `presence:<userId>` — String, value "online", TTL 60s
- `socket:<userId>` — Set of socket IDs (supports multi-device)

## Message delivery flow

1. Client emits `message:send` with payload
2. Realtime handler validates the payload
3. Calls `message.service.create()` (backend agent's service) to persist
4. Emits `message:new` to the conversation room (excluding sender)
5. Creates `delivered` status when recipient's socket receives the event
6. Emits `message:delivered` back to the sender
7. Acknowledges the sender's `message:send` with the full message object

## Event handler naming conventions
- Files: `<domain>.handler.ts` (e.g., `message.handler.ts`)
- Handler functions: `handle<EventName>` (e.g., `handleMessageSend`, `handleTypingStart`)
- Each handler file exports a `register` function that takes the Socket.io server and registers all related event listeners

```ts
// Example: message.handler.ts
export function register(io: Server, socket: Socket) {
  socket.on("message:send", (payload, ack) => handleMessageSend(io, socket, payload, ack));
  socket.on("message:read", (payload, ack) => handleMessageRead(io, socket, payload, ack));
}
```

## Rules
1. Always validate event payloads before processing
2. Always use Socket.io rooms for conversation-scoped events (room = `conversation:<id>`)
3. Always use the Redis adapter for multi-node compatibility
4. Never access the database directly — call service functions from `src/services/`
5. Always handle socket disconnection gracefully (clean up presence, rooms)
6. Never block the event loop — use async/await for all I/O
