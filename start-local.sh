#!/bin/bash
# Start Qyou locally with ngrok tunnel
# Usage: ./start-local.sh

set -e

echo "==> Starting Postgres & Redis..."
docker compose up -d postgres redis

echo "==> Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U qyou > /dev/null 2>&1; do
  sleep 1
done
echo "    Postgres ready."

echo "==> Running migrations..."
cd apps/backend
npm run migrate:up 2>/dev/null || true

echo "==> Starting backend..."
npm run dev &
BACKEND_PID=$!
cd ../..

# Wait for backend to be ready
echo "==> Waiting for backend on port 3001..."
until curl -s http://localhost:3001/health > /dev/null 2>&1; do
  sleep 1
done
echo "    Backend ready: http://localhost:3001/health"

echo "==> Starting ngrok tunnel..."
ngrok http 3001 --log=stdout > /tmp/ngrok.log 2>&1 &
TUNNEL_PID=$!

sleep 5
TUNNEL_URL=$(grep -oE 'https://[^ ]*\.ngrok-free\.app' /tmp/ngrok.log | head -1)

echo ""
echo "    Tunnel URL: $TUNNEL_URL"
echo ""
echo "    Update apps/frontend/.env.production:"
echo "      VITE_API_URL=${TUNNEL_URL}/api/v1"
echo "      VITE_WS_URL=${TUNNEL_URL}"
echo ""

cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $TUNNEL_PID 2>/dev/null || true
  docker compose stop postgres redis
  echo "    Done."
}
trap cleanup EXIT INT TERM

wait
