# Qyou — Deployment Guide

## Architecture

| Component | Service | URL |
|-----------|---------|-----|
| Backend API | Fly.io | `https://qyou-api.fly.dev` |
| Frontend | GitHub Pages | `https://{username}.github.io/qyou` |
| Database | Fly.io Postgres | Internal (attached to app) |
| Redis | Upstash | `rediss://...upstash.io` |

## Prerequisites

- [Fly.io](https://fly.io) account (free tier)
- [Upstash](https://upstash.com) account (free tier)
- GitHub repository with this code pushed

## Backend Deployment (Fly.io)

### 1. Install flyctl

```bash
brew install flyctl
```

### 2. Login

```bash
fly auth login
```

### 3. Create the app (first time only)

```bash
fly apps create qyou-api
```

### 4. Create Postgres database

```bash
fly postgres create --name qyou-db --region fra
fly postgres attach qyou-db --app qyou-api
```

This automatically sets `DATABASE_URL` as a secret on the app.

### 5. Create Upstash Redis

1. Go to [Upstash Console](https://console.upstash.com)
2. Create a new Redis database (region: `eu-central-1` / Frankfurt)
3. Copy the `rediss://` connection string (TLS required)

### 6. Set secrets

```bash
fly secrets set \
  JWT_ACCESS_SECRET="$(openssl rand -hex 64)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 64)" \
  REDIS_URL="rediss://default:YOUR_PASSWORD@YOUR_HOST.upstash.io:6379" \
  CORS_ORIGIN="https://{github-username}.github.io" \
  --app qyou-api
```

### 7. Deploy

```bash
fly deploy
```

### 8. Verify

```bash
curl https://qyou-api.fly.dev/health
```

Expected response:
```json
{"status":"ok","db":"ok","redis":"ok","version":"1.0.0","uptime":42}
```

## Frontend Deployment (GitHub Pages)

### Automatic (CI/CD)

Push to the `trunk` branch. GitHub Actions will automatically:
1. Build the frontend
2. Deploy to the `gh-pages` branch

### First-time setup

1. Push code to `trunk` branch
2. Go to **Settings → Pages** in your GitHub repo
3. Set **Source** to `gh-pages` branch
4. Wait for the build to complete
5. Visit `https://{username}.github.io/qyou`

### Manual deployment

```bash
cd apps/frontend
npm ci
npm run build
# The dist/ folder contains the static site
```

## CI/CD

### GitHub Actions Workflows

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR to `trunk` | TypeScript type checks |
| `deploy-backend.yml` | Push to `trunk` (backend changes) | Deploys to Fly.io |
| `deploy-frontend.yml` | Push to `trunk` (frontend changes) | Builds & deploys to GitHub Pages |

### Required GitHub Secrets

| Secret | Where to get it |
|--------|----------------|
| `FLY_API_TOKEN` | `fly tokens create deploy -x 999999h` |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## Monitoring

### Fly.io logs

```bash
fly logs --app qyou-api
```

### Fly.io status

```bash
fly status --app qyou-api
```

### Health check

```bash
curl https://qyou-api.fly.dev/health
```

## Troubleshooting

### Backend won't start

```bash
fly logs --app qyou-api
```

Check that all secrets are set:
```bash
fly secrets list --app qyou-api
```

### Database connection fails

Verify Postgres is attached:
```bash
fly postgres list
```

### Redis connection fails

Verify `REDIS_URL` uses `rediss://` (with double s for TLS).

### Frontend shows blank page

1. Check browser console for errors
2. Verify `VITE_API_URL` points to the correct backend URL
3. Ensure GitHub Pages is serving from the `gh-pages` branch
