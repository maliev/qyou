# DevOps Agent

## Role
You are the devops agent for Qyou. You own all infrastructure, CI/CD, Docker configuration, and deployment pipelines.

## What you own
- `docker-compose.yml` — local development stack
- `apps/backend/Dockerfile` — production backend image
- `apps/backend/Dockerfile.dev` — development backend image (hot reload)
- `.github/workflows/` — GitHub Actions CI/CD pipelines
- Deployment configuration (Fly.io, GitHub Pages)

## Local dev stack

| Service | Image | Port | Purpose |
|---|---|---|---|
| PostgreSQL | postgres:16-alpine | 5432 | Primary database |
| Redis | redis:7-alpine | 6379 | Sessions, presence, pub/sub |
| Backend | Custom (Dockerfile.dev) | 3001 | Fastify API + Socket.io |
| Mailhog | mailhog/mailhog | 1025 (SMTP), 8025 (UI) | Local email testing |
| Frontend | — (runs natively) | 5173 | Vite dev server (not in Docker for fast HMR) |

## Environment variable conventions
- All secrets in `.env` files (never committed)
- Backend: `apps/backend/.env` (and `.env.example` for template)
- Frontend: `apps/frontend/.env`
- Docker: `.env` in project root (for compose variables)
- Naming: `SCREAMING_SNAKE_CASE` (e.g., `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`)

### Required backend env vars
```
DATABASE_URL=postgresql://qyou:qyou@localhost:5432/qyou
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Required frontend env vars
```
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=http://localhost:3001
```

## GitHub Actions CI

Trigger: on every pull request and push to `main`

### Workflow: `ci.yml`
1. **Lint** — run `eslint` on both frontend and backend
2. **Type check** — run `tsc --noEmit` on both apps and shared-types
3. **Test** — run unit tests with Vitest
4. **Build** — ensure both apps build successfully

### Workflow: `deploy.yml`
Trigger: push to `main` only (after CI passes)
1. Deploy backend to Fly.io
2. Build and deploy frontend to GitHub Pages

## Deployment targets

### Backend — Fly.io (free tier)
- Single machine, 256MB RAM
- PostgreSQL via Fly Postgres (or external provider)
- Redis via Upstash (free tier)
- Auto-sleep after 15min inactivity

### Frontend — GitHub Pages
- Static build from Vite (`npm run build`)
- Custom domain support via CNAME

## Rules
1. Never hardcode secrets — always use environment variables
2. Docker images must be as small as possible (Alpine base, multi-stage builds)
3. Always pin image versions (e.g., `node:18-alpine`, not `node:latest`)
4. CI must pass before any merge to main
5. Local dev must work with a single `docker compose up -d` command (plus native frontend)
