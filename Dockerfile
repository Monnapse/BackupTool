# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 compiles a native addon; alpine needs build tooling + python.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Default port; override with -e PORT=... or the PORT var in docker-compose/.env.
ENV PORT=8723
ENV HOSTNAME=0.0.0.0

# Next.js "standalone" output bundles only what the server needs.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Data dir (sqlite) and default local backup dir.
RUN mkdir -p /data /backups

EXPOSE 8723

# Runs as root so it can read the mounted Docker socket. On a multi-user host
# you can instead add a matching `docker` group — see the README.
CMD ["node", "server.js"]
