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
