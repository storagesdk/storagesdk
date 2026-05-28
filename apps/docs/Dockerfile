# syntax=docker/dockerfile:1.7

# ────────────────────────────────────────────────────────────────────────
# Build stage — install deps and produce the static site
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Use the pnpm version pinned in the root package.json's `packageManager`
RUN corepack enable

WORKDIR /app

# Copy workspace plumbing first so Docker can cache the install layer
# when only source changes. Every workspace's package.json has to be
# present — pnpm validates them against the lockfile.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/docs/package.json         ./apps/docs/
COPY packages/core/package.json     ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY examples/package.json          ./examples/

# Install only the docs site's deps. The root package.json's
# `pnpm.onlyBuiltDependencies` covers sharp + esbuild postinstall
# approval; `--frozen-lockfile` keeps the build deterministic against
# the monorepo's pnpm-lock.yaml.
RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --filter @storagesdk/docs-site

# Bring in the source and build
COPY apps/docs ./apps/docs
RUN pnpm --filter @storagesdk/docs-site build

# ────────────────────────────────────────────────────────────────────────
# Runtime stage — Caddy serving the static output
# ────────────────────────────────────────────────────────────────────────
FROM caddy:2-alpine AS runner

COPY --from=builder /app/apps/docs/dist /usr/share/caddy
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
