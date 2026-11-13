# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# 1. Builder stage
FROM base AS builder
WORKDIR /app
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# Copy package manifests for caching
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

# Install dependencies for shared library and backend
RUN npm ci --workspace=packages/shared --workspace=backend

# Copy source files
COPY packages/shared ./packages/shared
COPY backend ./backend

# Build shared package, Prisma client, and backend
RUN npm run build:shared
RUN npm --workspace=backend run prisma:generate
RUN npm --workspace=backend run build

# 2. Production runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Copy workspace package manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY backend/package*.json ./backend/

# Copy all installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built artifacts and necessary runtime assets
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/src/generated ./backend/src/generated
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/assets ./backend/assets

ENV PATH="/app/node_modules/.bin:$PATH"

EXPOSE 4000

WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
