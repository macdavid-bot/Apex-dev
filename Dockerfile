FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

# ── Dependency layer (cached unless lockfile or package files change) ──────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

# ── Build the React frontend ──────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm --filter @apex/web build

# ── Lean production image ──────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps    /app/node_modules          ./node_modules
COPY --from=deps    /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/web/dist         ./apps/web/dist
COPY apps/api   ./apps/api
COPY services   ./services
COPY package.json pnpm-workspace.yaml ./

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api/src/index.js"]
