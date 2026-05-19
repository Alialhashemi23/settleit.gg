# SettleIt — Build Roadmap

## Phase 1 — Lunch (1–2 hrs) 🥪
Goal: real-time core working in two browser tabs

- [x] Monorepo scaffold — `/frontend` SvelteKit, `/backend` Bun
- [x] SQLite setup with rooms + players tables
- [x] Socket.io server with `room:create` and `room:join`
- [x] Player presence — join/leave broadcasts
- [x] Landing page — create room or join with code
- [x] Lobby view — connected players list, live updates
- [x] Host can push a vote question
- [x] Players see question and vote
- [x] Live vote counts update in real-time

**Done = two tabs, one as host one as player, can run a full vote round**

---

## Phase 2 — Weekend Session 1 (2–3 hrs) 🔥
Goal: full game loop, both question modes

- [ ] Free text mode — players submit answers, appear live on host screen
- [ ] Question history — host can see previous questions/results in session
- [ ] Preset question packs — Gaming, Anime, Wildcards (JSON files)
- [ ] Host question picker UI — browse packs or type custom
- [ ] Room end flow — session summary screen

---

## Phase 3 — Weekend Session 2 (2–3 hrs) 🎨
Goal: looks good, feels good on mobile

- [ ] Mobile-first player UI polish — big tap targets, clean layout
- [ ] Host screen layout — question display + live results side by side
- [ ] Animations — vote bars animate, answers slide in
- [ ] Room code display — big and readable on host screen for people to type
- [ ] Error states — room not found, room full, disconnected

---

## Phase 4 — Deploy (1 hr) 🚀
Goal: publicly accessible URL

- [ ] `docker-compose.yml` finalized
- [ ] Cloudflare Tunnel setup on home server OR deploy to Hetzner VPS
- [ ] Caddy reverse proxy + HTTPS
- [ ] Test on actual phones on actual WiFi
- [ ] Buy `settleit.gg` if it feels right ($70/yr), fallback `settleit.to` ($30/yr)

---

## Backlog (post-weekend, if it gets traction)
- Player avatars / emoji selection
- Reaction system during free text reveal
- Session history / replay
- Custom question pack builder
- Rate limiting + abuse protection
- Redis adapter for horizontal scaling
