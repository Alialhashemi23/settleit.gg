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

- [x] Free text mode — players submit answers, appear live on host screen
- [x] Question history — host can see previous questions/results in session
- [x] Preset question packs — Gaming, Anime, Wildcards (JSON files)
- [x] Host question picker UI — browse packs or type custom
- [x] Room end flow — session summary screen

---

## Phase 3 — Weekend Session 2 (2–3 hrs) 🎨
Goal: looks good, feels good on mobile

- [x] Mobile-first player UI polish — big tap targets, clean layout
- [x] Host screen layout — question display + live results side by side
- [x] Animations — vote bars animate, answers slide in
- [x] Room code display — big and readable on host screen for people to type
- [x] Error states — room not found, room full, disconnected

---

## Phase 4 — Deploy (1 hr) 🚀
Goal: publicly accessible URL

- [ ] `docker-compose.yml` finalized
- [ ] Cloudflare Tunnel setup on home server OR deploy to Hetzner VPS
- [ ] Caddy reverse proxy + HTTPS
- [ ] Test on actual phones on actual WiFi
- [ ] Buy `settleit.gg` if it feels right ($70/yr), fallback `settleit.to` ($30/yr)

---

## Phase 5 — Player Turns Mode 🎲
Goal: question asking rotates through all players, Skribbl.io style

- [ ] Add `mode` field to room creation — "Host Picks" (default) vs "Player Turns"
- [ ] Backend: add `mode`, `turn_order`, `turn_index` columns to rooms table
- [ ] Backend: `game:start` event — randomises player order, stores in `turn_order`, broadcasts `game:started` with ordered player list
- [ ] Backend: gate `question:ask` / `question:next` on active player in player-turns mode (derive from `turn_order[turn_index]`)
- [ ] Backend: on `question:next` in player-turns mode, increment `turn_index` (wrap around), emit `turn:changed`
- [ ] Frontend: room creation UI — add mode toggle ("Host Picks" / "Player Turns")
- [ ] Frontend: host lobby in player-turns mode — show "Start Game" button instead of "Ask a Question"
- [ ] Frontend: brief turn order reveal animation after game starts
- [ ] Frontend: active player view — when it's your turn, show the question picker on your device
- [ ] Frontend: waiting player view — show "It's [Player]'s turn to ask..." with turn order visible
- [ ] Frontend: host view — show turn order sidebar, can still advance/end at any time

---

## Backlog (post-weekend, if it gets traction)
- Player avatars / emoji selection
- Reaction system during free text reveal
- Session history / replay
- Custom question pack builder
- Rate limiting + abuse protection
- Redis adapter for horizontal scaling
