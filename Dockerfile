# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# 1. Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/
RUN npm ci --workspace=packages/shared --workspace=backend

# 2. Build application
FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY backend ./backend
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

RUN npm run build:shared
RUN npm --workspace=backend run prisma:generate
RUN npm --workspace=backend run build

# 3. Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

RUN npm ci --omit=dev --workspace=packages/shared --workspace=backend

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/src/generated ./backend/src/generated
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/assets ./backend/assets

EXPOSE 4000

WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

