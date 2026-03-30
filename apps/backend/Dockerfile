FROM node:22-alpine AS builder

WORKDIR /app

COPY apps/backend/package*.json ./
RUN npm ci

COPY apps/backend/ .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY apps/backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY apps/backend/migrations ./migrations

EXPOSE 3001

CMD ["node", "dist/server.js"]
