# Settle It

A party game for 5–8 phones: a question, a vote everyone can see, a beat to argue, an optional revote, a verdict. Alone, a daily "Read the Crowd" challenge with real community results. No accounts, no host screen, no TV.

Product direction and architecture live in [`docs/`](docs/): [manifesto](docs/SETTLEIT-MANIFESTO.md), [architecture](docs/SETTLEIT-ARCHITECTURE.md), [build plan](docs/SETTLEIT-BUILD-PLAN.md), [status](docs/STATUS.md), [deployment](docs/DEPLOYMENT.md), [playtest checklist](docs/PLAYTEST.md).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | SvelteKit / Svelte 5 on Cloudflare Workers (`frontend/`) |
| Game + data API | Cloudflare Worker with one SQLite-backed Durable Object per room and D1 for global records (`workers/api/`) |
| Rules | Pure TypeScript, no platform code (`packages/core/`) |
| Content | Reviewed, versioned question library with stable ids (`packages/content/`) |
| Old stack | `legacy/` (Bun + Socket.IO + Docker), kept for rollback only |

## Develop

```bash
bun install
cp workers/api/.dev.vars.example workers/api/.dev.vars

# terminal 1: API on :8787 (local Durable Objects + D1)
cd workers/api && bunx wrangler d1 migrations apply settleit --local && bun run dev

# terminal 2: site on :5173, proxies /api to :8787
cd frontend && bun run dev
```

Open http://localhost:5173 in two browser profiles (or a phone on the same network) to play a room.

## Test

```bash
bun run test     # rules, content audit, and the Worker suite inside workerd
bun run check    # type checks for every package
```

## Deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Short version: `wrangler deploy` in `workers/api`, then `bun run build && wrangler deploy` in `frontend`.

## Layout

```
docs/               current design + runbooks
packages/core/      round engine, outcomes, awards, daily scoring, protocol types
packages/content/   catalog.ts (205 approved prompts), review log, seed generator
workers/api/        Worker entry, RoomDO, D1 migrations, daily/stats/admin/telemetry, tests
frontend/           SvelteKit app; worker.ts forwards /api/* to the API Worker
legacy/             previous production stack and the original question list
plans/              historical planning docs (superseded by docs/)
```
