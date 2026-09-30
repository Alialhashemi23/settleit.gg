# Deployment and cutover runbook

Status: written 2026-09-30 alongside the rebuild. Nothing in this file has been executed against a real Cloudflare account yet; the steps below are what the code expects. Record what actually happened in `docs/STATUS.md` as you go.

## What runs where

| Piece | Cloudflare resource | Source |
| --- | --- | --- |
| Public site + `/api/*` gateway | Worker `settleit-web` with static assets | `frontend/` (`worker.ts` wraps the SvelteKit build) |
| Game and data API | Worker `settleit-api` | `workers/api/` |
| Live rooms | Durable Object class `RoomDO` (SQLite-backed) | `workers/api/src/room.ts` |
| Library, daily, stats, telemetry, admin | D1 database `settleit` | `workers/api/migrations/` |
| Upkeep | Cron trigger every 15 minutes on `settleit-api` | `workers/api/src/maintenance.ts` |

Browsers only ever talk to `settleit-web`. It forwards `/api/*` (including WebSocket upgrades) to `settleit-api` over a service binding, so cookies stay same-origin and the API Worker is not reachable directly. If the service-binding path misbehaves on real Cloudflare (the one thing this session could not test), the fallback is a route `settleit.gg/api/*` pointed at `settleit-api`; the frontend needs no change for that.

## One-time setup

1. `bun install` at the repo root, then `bunx wrangler login` (Workers Paid plan, $5/month minimum, is required for Durable Objects).
2. Create the database and paste its id into `workers/api/wrangler.toml` (`database_id`):
   ```bash
   cd workers/api && bunx wrangler d1 create settleit
   bunx wrangler d1 migrations apply settleit --remote
   ```
3. Secrets on the API Worker (each prompts for a value; generate with `openssl rand -base64 32`):
   ```bash
   bunx wrangler secret put SESSION_SECRET
   bunx wrangler secret put ADMIN_SESSION_SECRET
   bunx wrangler secret put GITHUB_CLIENT_ID        # optional until you want /admin
   bunx wrangler secret put GITHUB_CLIENT_SECRET
   ```
   For the GitHub OAuth app, set the callback URL to `https://settleit.gg/api/admin/callback` (or the workers.dev URL while previewing).
4. Vars in `workers/api/wrangler.toml` for production: `ENVIRONMENT = "production"`, `ADMIN_GITHUB_LOGINS = "your-github-login"`, `ALLOWED_ORIGINS = ""`, `PUBLIC_ORIGIN = "https://settleit.gg"`. You can also pass them at deploy time: `bunx wrangler deploy --var ENVIRONMENT:production`.
   Anything other than `ENVIRONMENT = "production"` marks all traffic as test traffic, which the admin overview hides by default.

## Deploy (every time)

```bash
cd workers/api && bunx wrangler deploy          # API first: the web Worker binds to it by name
cd ../../frontend && bun run build && bunx wrangler deploy
```

Both Workers get a `*.workers.dev` URL. Use the web Worker's URL for the phone playtest before touching DNS.

## Local development

```bash
cp workers/api/.dev.vars.example workers/api/.dev.vars
cd workers/api && bunx wrangler d1 migrations apply settleit --local && bun run dev   # http://localhost:8787
cd frontend && bun run dev                                                              # http://localhost:5173, proxies /api
```

`bun run test` at the root runs the rules, content and Worker suites (the Worker suite runs inside workerd with real Durable Objects and D1).

## Cutover from the old stack

The old stack (`legacy/`) runs on the owner's Windows PC: Docker Compose (Bun backend on 3001, adapter-node frontend on 3000) behind a `cloudflared` tunnel, redeployed by `legacy/scripts/autodeploy.ps1` polling `main` every two minutes.

Before switching:

1. Write down the current Cloudflare DNS records for `settleit.gg`, `www` and `api.settleit.gg` (they should be tunnel CNAMEs) and the tunnel's public hostname routes. That is the rollback.
2. Disable the Windows Task Scheduler job for `autodeploy.ps1`. Once this branch merges, that script fails harmlessly (the compose file moved), but it should not be pulling `main` anyway.
3. Deploy both Workers and run the phone playtest on the workers.dev URL (`docs/PLAYTEST.md`).

Switch:

4. In the web Worker's settings add the custom domain `settleit.gg` (and `www.settleit.gg`). Cloudflare replaces the DNS records for you; keep the old ones noted.
5. Watch `/admin` → Ops for stalled exports and unsettled days for a day.
6. Stop the tunnel container and the Docker stack. Nothing in the old SQLite file needs migrating (owner decision).

Rollback: delete the custom domain from the Worker, restore the tunnel CNAMEs, start the Docker stack again. The old code is `legacy/` at commit `4e2fa86` on `main`.

## Cost check

Workers Paid starts at $5/month with 10M requests, plus Durable Object and D1 usage. The architecture doc's sizing example (1,000 group sessions and 10,000 daily attempts a month) stays inside the included allowances for requests and D1 rows, but Durable Object duration is billed while a room is active, so measure after the first week: the Cloudflare dashboard's DO duration and D1 row reads/writes are the two numbers to watch. This session did not measure real usage.
