# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# --- deps: install dependencies only (cached separately from source changes) ---
FROM base AS deps
WORKDIR /app
# better-sqlite3 is a native addon — node-gyp needs a C++ toolchain + python3 to
# compile it on Alpine (musl has no prebuilt binary for it). Build-only; these
# tools never reach the runner stage since only node_modules is copied forward.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build the Next.js app ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# LLM keys are read at runtime (server-only); the app builds fine without them.
RUN npm run build

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# data/pfm.sqlite3 + schema.sql are read by path at runtime (src/lib/db.ts),
# not through a require/import chain, so the standalone output tracer never
# picks them up on its own — copy explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
