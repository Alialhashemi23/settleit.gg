# Rebuild status

Branch `rebuild/v2-cloudflare`, 2026-09-30. Maps the [build plan](SETTLEIT-BUILD-PLAN.md) slices to what exists.

| Slice | State | Notes |
| --- | --- | --- |
| 0 Baseline | Done | Old stack archived in `legacy/`; docs imported; bun workspace; baseline had one pre-existing type error (join page) now gone with the rewrite |
| 1 Hosting spike | Code done, deploy pending | DO SQLite state survives `ctx.abort()` in tests; D1 migrations apply; service-binding forwarding (HTTP and WebSocket 101) verified with both Workers under workerd and a scripted browser; exports never block gameplay and catch up exactly once after a simulated D1 outage. Real hosted/mobile check and cost measurement still needed (`docs/DEPLOYMENT.md`) |
| 2 One group round | Done | Pure rules in `packages/core`; unified room screen; fixed eligibility; timeouts; no creator special case; idempotent commands |
| 3 Casual session | Done | Category mix, seeded no-repeat queue stored per room, ready/skip/more-time, pause under two active players, private custom questions, write-ins as private variants, recap + awards, 30-minute idle expiry, outbox export |
| 4 Daily challenge | Done | Deterministic schedule 4 days ahead, locked opinion+prediction, 20-person threshold, provisional split, idempotent versioned settlement, ungraded days, late answers, share links enforced server-side, history reset |
| 5 Homepage + admin | Done | Real stat cards with empty states; topics ranked by participants; GitHub-OAuth admin with overview, ops, library versions, scheduling, featured, audit, test mode |
| 6 Playtest | Not started | Needs deployment and phones. Checklist in `docs/PLAYTEST.md` |
| 7 Accounts/content tools | Not started | Guest history reset exists; no accounts, submissions or reports yet |

## Proposed defaults in code (tune after the playtest)

`packages/core/src/config.ts`: vote 30 s, discuss 30 s, revote 15 s, verdict 8 s, one 30 s extension; 2 players to start, cap 12; presence window 45 s; idle expiry 30 min; retention 24 h; daily opens 12:00 UTC, 20-person minimum sample and 20 others to grade, no repeats within 60 days; public stats minimum sample 20.

## Known gaps and decisions to revisit

- Rate limiting for room creation/joins is per-isolate and best effort.
- Guest identity is a signed cookie; clearing site data creates a new player, as the manifesto accepts.
- Visitors are counted from client `page_view` events, so ad blockers undercount.
- The service-binding WebSocket path works under workerd locally; confirm once on the hosted platform. The fallback is a `/api/*` route on the API Worker.
- `@sveltejs/adapter-cloudflare` overwrites the file named by `main`; the adapter reads `frontend/wrangler.build.toml` for that reason. See `docs/DEPLOYMENT.md`.
- Admin sign-in needs a GitHub OAuth app; until then `/admin` shows a configuration notice.
