# Legacy stack (pre-rebuild)

This folder holds the original deployment exactly as it ran before the 2026-09 rebuild:

- `backend/` — Bun + Socket.IO + SQLite server (rooms tied to socket lifecycle)
- `docker-compose.yml` — backend + frontend (adapter-node) + cloudflared tunnel
- `scripts/autodeploy.ps1` — Windows Task Scheduler watcher that pulled `main` and ran `docker compose up`
- `frontend.Dockerfile` — the old frontend image (adapter-node)
- `.env.example` — tunnel token placeholder

It is **not** wired into the workspace and is not built or tested. It exists so the previous
production setup can be inspected, and so the cutover runbook (`docs/DEPLOYMENT.md`) has a
concrete rollback reference: the last commit of the old stack on `main` is `4e2fa86`.

Note for the autodeploy watcher: once this branch lands on `main`, the watcher's
`docker compose -f <repo>/docker-compose.yml` call fails (file moved) and it simply logs the
error every two minutes. Disable the scheduled task before or right after cutover.
