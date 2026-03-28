# Qyou

Real-time chat application. ICQ-style, Telegram-inspired.

## Local development

### Prerequisites
- Node.js 18+
- Docker Desktop

### Setup
```bash
cp apps/backend/.env.example apps/backend/.env
docker compose up -d
cd apps/backend && npm install && npm run migrate && npm run dev
cd apps/frontend && npm install && npm run dev
```

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
