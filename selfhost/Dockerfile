# Self-hosted v2: both Workers under workerd (wrangler dev) in one container.
# Build context is the repo root (see ../docker-compose.yml).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g bun

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && cd frontend && bun run build

ENV WRANGLER_SEND_METRICS=false \
    CI=1 \
    PUBLIC_ORIGIN=https://settleit.gg \
    ALLOWED_ORIGINS=https://settleit.gg,https://www.settleit.gg \
    ENVIRONMENT=production

EXPOSE 3000

# 1. Write .dev.vars from the container environment (secrets come from the root .env via compose).
# 2. Apply D1 migrations to the persisted local state (idempotent).
# 3. Serve the web Worker with the API Worker bound to it, state under /data.
CMD ["sh", "-c", "set -e; \
  : \"${SESSION_SECRET:?SESSION_SECRET is not set}\"; \
  : \"${ADMIN_SESSION_SECRET:?ADMIN_SESSION_SECRET is not set}\"; \
  printf 'SESSION_SECRET=%s\\nADMIN_SESSION_SECRET=%s\\nADMIN_GITHUB_LOGINS=%s\\nGITHUB_CLIENT_ID=%s\\nGITHUB_CLIENT_SECRET=%s\\nPUBLIC_ORIGIN=%s\\nALLOWED_ORIGINS=%s\\nENVIRONMENT=%s\\n' \
    \"$SESSION_SECRET\" \"$ADMIN_SESSION_SECRET\" \"$ADMIN_GITHUB_LOGINS\" \"$GITHUB_CLIENT_ID\" \"$GITHUB_CLIENT_SECRET\" \"$PUBLIC_ORIGIN\" \"$ALLOWED_ORIGINS\" \"$ENVIRONMENT\" \
    > workers/api/.dev.vars; \
  (cd workers/api && ../../frontend/node_modules/.bin/wrangler d1 migrations apply settleit --local --persist-to /data); \
  exec frontend/node_modules/.bin/wrangler dev -c frontend/wrangler.toml -c workers/api/wrangler.toml --ip 0.0.0.0 --port 3000 --persist-to /data"]
