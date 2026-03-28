# Qyou — Project Bootstrap

You are initializing the **Qyou** project from scratch.
Qyou is a real-time chat application (ICQ/Telegram-style).
Follow every step below in exact order. After completing each step, print a short confirmation before moving to the next.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + shadcn/ui + Tailwind CSS + Zustand + Socket.io-client |
| Backend | Node.js + Fastify + TypeScript + PostgreSQL + Redis + Socket.io |
| Auth | JWT (access token 15min + refresh token 7 days in Redis) |
| Local dev | Docker Compose |
| Design | Dark mode default · Telegram-inspired two-panel layout · shadcn/ui components · Lucide icons |

---

## Phase 1 features (the only scope for now)

- Sign up / login
- User profiles with avatars
- User search by username or UIN (numeric ID)
- Add / remove contacts
- 1-to-1 text chat
- Timestamps on messages
- Online / last seen presence
- Message status: sent → delivered → read
- Emoji support
- Typing indicators

---

## Step 1 — Create folder structure

Create the following folders and empty files exactly as listed:

```
.agents/
.contracts/
apps/frontend/
apps/backend/
packages/shared-types/
docs/
.contracts/API.md
.contracts/SCHEMA.md
.contracts/WEBSOCKET.md
.contracts/TYPES.md
.contracts/DESIGN.md
.agents/frontend.md
.agents/backend.md
.agents/realtime.md
.agents/database.md
.agents/devops.md
CLAUDE.md
.cursorrules
.gitignore
README.md
docker-compose.yml
```

---

## Step 2 — Write `.gitignore`

```
node_modules/
.env
.env.local
.env.*.local
dist/
build/
.DS_Store
*.log
.claude/
coverage/
.turbo/
*.tsbuildinfo
```

---

## Step 3 — Write `CLAUDE.md`

This file is auto-loaded by Claude Code on every session. Make it thorough.

```markdown
# Qyou — Master Project Context

## What is Qyou
Real-time 1-to-1 chat application. Think ICQ/Telegram.
Users can register, find each other, add contacts, and chat in real time.

## Stack
- Frontend: React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS, Zustand, Socket.io-client
- Backend: Node.js, Fastify, TypeScript, PostgreSQL, Redis, Socket.io
- Auth: JWT access tokens (15min) + refresh tokens (7 days, stored in Redis)
- Local dev: Docker Compose

## Project structure
- apps/frontend/     → React app (frontend agent owns this)
- apps/backend/      → Fastify API + Socket.io (backend + realtime agents own this)
- packages/shared-types/ → Shared TypeScript types imported by both apps
- .contracts/        → Source of truth — read before writing any code
- .agents/           → Agent-specific instructions

## Contracts (read these before every task)
- REST API      → .contracts/API.md
- WebSocket     → .contracts/WEBSOCKET.md
- DB schema     → .contracts/SCHEMA.md
- Shared types  → .contracts/TYPES.md
- Design system → .contracts/DESIGN.md

## Rules — never break these
1. Always read the relevant contract file before writing any code
2. Never define types inline — always use or extend packages/shared-types
3. Never modify .contracts/ files unless explicitly instructed
4. Always validate backend input with Zod
5. Always handle every error case defined in the contract
6. Never use sequential integers as public-facing IDs — use UUIDs
7. The UIN (numeric user ID) is the only exception — it is auto-generated, never user-supplied
8. Never store passwords in plain text — always bcrypt (cost 12)
9. Never commit .env files
10. Every new file must have TypeScript strict mode compatible types

## Current phase
Phase 1 — Core foundation
See CLAUDE.md Phase overview below for what is in and out of scope.

## Phase overview
### Phase 1 (current) — Core foundation
Sign up, login, profiles, avatars, user search, contacts, 1-to-1 chat,
timestamps, presence, message status, emoji, typing indicators

### Phase 2 — Rich messaging
Read receipts, reactions, reply, edit, delete, forward, pin, drafts

### Phase 3 — Reliability and search
Message search, offline queue, retry, backup, push notifications

### Phase 4 — Security
E2EE, 2FA, block users, anti-spam, scalable pub/sub

## Environment variables
All secrets live in .env files (never committed).
Backend: apps/backend/.env
Frontend: apps/frontend/.env
Docker: .env in root (for compose)
```

---

## Step 4 — Write `.contracts/SCHEMA.md`

Write the complete PostgreSQL schema for Phase 1. Include:

- `users` table — id (UUID), uin (auto-increment integer), username, display_name, email, password_hash, avatar_url, bio, country, last_seen_at, created_at
- `refresh_tokens` table — for JWT refresh token tracking
- `contacts` table — user_id, contact_id, status (pending/accepted/blocked), created_at
- `conversations` table — id, created_at (supports future group chats via participants table)
- `conversation_participants` table — conversation_id, user_id, joined_at
- `messages` table — id, conversation_id, sender_id, content, created_at, edited_at (nullable) — partitioned by month
- `message_status` table — message_id, user_id, status (delivered/read), updated_at
- `push_tokens` table — user_id, token, platform, created_at (for future push notifications)

For every table include:
- Primary keys
- Foreign keys with ON DELETE behavior
- Indexes on all frequently queried columns
- Comments explaining non-obvious columns

---

## Step 5 — Write `.contracts/API.md`

Write the complete REST API contract for Phase 1. For every endpoint include:
- Method + path
- Auth required (yes/no)
- Request body shape (with types)
- Response shape (success)
- Error responses (with HTTP codes and messages)

Endpoints to cover:

**Auth**
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh
- GET  /auth/me

**Users**
- GET  /users/search?q=&country=
- GET  /users/:uin
- PATCH /users/me (update profile)
- POST /users/me/avatar (upload avatar)

**Contacts**
- GET    /contacts
- POST   /contacts (send request)
- PATCH  /contacts/:userId (accept/reject)
- DELETE /contacts/:userId

**Conversations**
- GET  /conversations
- GET  /conversations/:id
- GET  /conversations/:id/messages?before=&limit=

**Messages**
- POST /conversations/:id/messages

---

## Step 6 — Write `.contracts/WEBSOCKET.md`

Write the complete WebSocket event protocol for Phase 1.

For every event include:
- Event name
- Direction (client→server or server→client or both)
- Payload shape (with TypeScript types)
- When it is emitted
- Any acknowledgement shape

Events to cover:
- Connection auth (token sent on connect)
- `message:send` (client→server)
- `message:new` (server→client, broadcast to conversation)
- `message:delivered` (server→client)
- `message:read` (client→server + server→client)
- `typing:start` (client→server)
- `typing:stop` (client→server)
- `typing` (server→client, broadcast to conversation partner)
- `presence:update` (server→client, user came online/went offline)
- `presence:get` (client→server, request presence of specific users)
- Error event shape

---

## Step 7 — Write `.contracts/TYPES.md`

Derive shared TypeScript types from SCHEMA.md and API.md. Include:

- `User` (public-facing, no password_hash)
- `UserSelf` (own profile, includes email)
- `Contact` (with nested User)
- `Conversation` (with last message + participants)
- `Message` (with status)
- `MessageStatus` enum
- `PresenceStatus` enum
- `ContactStatus` enum
- All API request/response body types
- All WebSocket payload types

These are the canonical types. Both frontend and backend import from packages/shared-types.

---

## Step 8 — Write `.contracts/DESIGN.md`

```markdown
# Qyou Design System

## Component library
shadcn/ui — use existing components whenever possible, never build custom when shadcn covers it

## Styling
Tailwind CSS — utility classes only, no custom CSS files except for global resets

## Theme
- Default: dark mode
- Support: light mode via shadcn theme toggle
- Do not hardcode colors — always use Tailwind semantic tokens (background, foreground, muted, etc.)

## Typography
- Font: Geist Sans (Inter as fallback)
- No custom font sizes — use Tailwind scale only (text-sm, text-base, text-lg etc.)

## Icons
Lucide React — already included with shadcn/ui. Never use a different icon library.

## Accent color
Violet (shadcn default violet theme)

## Layout
Two-panel split (Telegram-style):
- Left panel: 320px fixed width — contact/chat list, search, user avatar
- Right panel: flexible — message thread, input bar, contact info header
- Mobile: single panel with navigation between list and chat (future consideration)

## Border radius
Use rounded-lg as default. rounded-full for avatars and status indicators only.

## Spacing
Follow Tailwind spacing scale. Minimum touch target 44px.

## Chat-specific conventions
- Own messages: right-aligned, violet background
- Others messages: left-aligned, muted background
- Timestamps: text-xs text-muted-foreground
- Status icons: Lucide Check (sent), CheckCheck (delivered), CheckCheck in violet (read)
- Avatar: always rounded-full, fallback to user initials
- Online indicator: green dot (bg-green-500) bottom-right of avatar
```

---

## Step 9 — Write `.agents/database.md`

Instructions for the database agent. Include:
- Role description
- What it owns (migrations folder)
- What it must read before every task (SCHEMA.md)
- Rules (never breaking changes on existing tables, always add indexes, always write rollback migrations)
- Migration tool: node-pg-migrate
- Naming conventions for tables, columns, indexes

---

## Step 10 — Write `.agents/backend.md`

Instructions for the backend agent. Include:
- Role description
- What it owns (apps/backend/ — REST routes, services, middleware)
- What it must read before every task (API.md, SCHEMA.md, TYPES.md)
- What it must NOT touch (WebSocket code — that belongs to realtime agent)
- Stack details: Fastify, TypeScript, Zod for validation, pg or Drizzle for DB, bcrypt, jsonwebtoken
- Folder structure to follow inside apps/backend/
- Error handling conventions
- Auth middleware pattern

---

## Step 11 — Write `.agents/realtime.md`

Instructions for the realtime agent. Include:
- Role description
- What it owns (apps/backend/src/realtime/ — Socket.io server, event handlers, presence)
- What it must read before every task (WEBSOCKET.md, SCHEMA.md, TYPES.md)
- Redis pub/sub pattern for multi-node delivery
- Presence system design (Redis TTL + heartbeat)
- How it publishes to Redis after backend agent persists a message
- Event handler naming conventions

---

## Step 12 — Write `.agents/frontend.md`

Instructions for the frontend agent. Include:
- Role description
- What it owns (apps/frontend/)
- What it must read before every task (API.md, WEBSOCKET.md, TYPES.md, DESIGN.md)
- Stack details: React 18, Vite, TypeScript, shadcn/ui, Tailwind, Zustand, Socket.io-client, React Query (for REST), React Router
- Folder structure: pages/, components/, stores/, hooks/, lib/, types/
- Component rules: always use shadcn components before building custom, always use Lucide icons
- State management: Zustand for auth + chat state, React Query for server state
- Never fetch directly in components — always via custom hooks

---

## Step 13 — Write `.agents/devops.md`

Instructions for the devops agent. Include:
- Role description
- What it owns (docker-compose.yml, Dockerfiles, .github/workflows/, deployment config)
- Local dev stack: PostgreSQL 16, Redis 7, backend on port 3001, frontend on port 5173
- Environment variable conventions
- GitHub Actions CI: lint + typecheck + test on every PR
- Deployment target: Fly.io (backend) + GitHub Pages (frontend) — free tier

---

## Step 14 — Write `docker-compose.yml`

Write a complete, working Docker Compose file for local development:

- `postgres` service: image postgres:16-alpine, port 5432, volume for data persistence, env vars for DB name/user/password
- `redis` service: image redis:7-alpine, port 6379
- `backend` service: builds from apps/backend/Dockerfile.dev, port 3001, depends on postgres + redis, volume mount for hot reload, env file apps/backend/.env
- `mailhog` service: for local email testing, ports 1025 (SMTP) and 8025 (web UI)

Do NOT include frontend in docker-compose — Vite dev server runs natively for faster HMR.

---

## Step 15 — Write `README.md`

```markdown
# Qyou

Real-time chat application. ICQ-style, Telegram-inspired.

## Local development

### Prerequisites
- Node.js 18+
- Docker Desktop

### Setup
\`\`\`bash
cp apps/backend/.env.example apps/backend/.env
docker compose up -d
cd apps/backend && npm install && npm run migrate && npm run dev
cd apps/frontend && npm install && npm run dev
\`\`\`

### Services
| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Mailhog | http://localhost:8025 |

## Project structure
See CLAUDE.md for full documentation.

## Agents
See .agents/ for agent-specific instructions.

## Contracts
See .contracts/ for API, WebSocket, schema, and design contracts.
```

---

## Step 16 — Final check

After completing all steps above:

1. List every file created
2. Confirm docker-compose.yml is valid YAML
3. Confirm all .contracts/ files are non-empty
4. Confirm all .agents/ files are non-empty
5. Print: "Qyou bootstrap complete. Ready for Session 2: database migrations."
