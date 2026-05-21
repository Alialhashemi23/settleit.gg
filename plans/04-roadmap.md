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

## Phase 4 — Game Design Pivot + Player Turns (3–4 hrs) 🎲
Goal: make the game actually feel like "Settle It" — social debate, not just polling

**Design pivot:** Removed Host Picks mode and Hot Take (freetext). The game is now one mode:
players take turns asking vote questions, names are visible on votes, and rounds require
consensus to close — creating real-time debate around shifting numbers.

- [x] Remove Host Picks mode — always player-turns
- [x] Remove Hot Take / freetext question type — vote only
- [x] Player turns — question asking rotates randomly through all players
- [x] Turn order reveal animation on game start (2.5s overlay)
- [x] Active player gets picker modal automatically on their turn
- [x] `response:submit` upserts — votes are changeable at any time
- [x] `response:update` broadcasts `{ votes: [{ playerId, nickname, value }] }` — names visible to all
- [x] Live vote display: each option shows count, progress bar, and voter names
- [x] Soft consensus (all-but-one agree) triggers 10s countdown
- [x] Full consensus settles immediately; breaking consensus cancels countdown
- [x] Force Settle button — active player (asker) only
- [x] Countdown banner: "Settling on X in Ns — change vote to stop it!"
- [x] Settled option shown in post-session summary with voter breakdown
- [x] Extract shared `game.ts` for consensus logic and `QuestionPicker.svelte` component
- [x] Bugfix: host can vote on questions (was stuck at 1 remaining)

---

## Phase 5 — Deploy (1 hr) 🚀
Goal: publicly accessible URL

- [ ] `docker-compose.yml` finalized
- [ ] Cloudflare Tunnel setup on home server
- [ ] Test on actual phones on actual WiFi
- [ ] Basic per-IP rate limiting on `room:create` and `response:submit`

---

## Phase 4.5 — Bonfire Test 🔥
Goal: real-world validation before announcing

- [ ] Play with 6+ friends in a real session
- [ ] Write down every bug, awkward moment, or missing feature noticed
- [ ] Fix the top 3 issues before sharing the link publicly

---

## Phase 6 — UI Beautification 🎨🔥
Goal: make the app feel like a late-night bonfire experience — warm, glowing, full of energy

Design doc: `plans/design.md`

- [ ] Load Nunito font (Google Fonts) via layout
- [ ] Global color system — warm near-black background, amber `#e8831a` accent
- [ ] Button redesign — chunky 52px+ tap targets, ember glow effect, spring press animation
- [ ] Input redesign — warm borders, amber focus glow
- [ ] Home page — animated title, bouncy CTA buttons
- [ ] Lobby/Host page — large glowing room code, bounce-in player list
- [ ] Play page — chunky vote option buttons, live result animations
- [ ] Host game page — question display polish, force settle button glow
- [ ] Summary page — celebratory bounce-in results
- [ ] Page transitions — slide up + fade between routes
- [ ] Loading states — pulsing ember glow instead of spinners
- [ ] Error states — warm shake animation

---

## Phase 7 — QoL + Bug Fixes 🛠️
Goal: polish the real-world play experience based on bonfire test findings

- [ ] **BUG-003** Mobile reconnect — persist `roomCode` + `playerId` in `localStorage`, detect socket reconnect, emit `room:sync` to restore player into active game state (question, votes, player list)
- [ ] **BUG-002** Turn reveal highlight — highlight the first player in the order (index 0) with amber glow, separate from the "YOU" badge which stays on the local player
- [ ] **QoL** Auto-insert dash in room code input — format entry as `XXXX-XXXX` automatically so players don't have to find the dash character on mobile keyboard
- [ ] **QoL** Post-question result screen — after a question settles, show a brief result screen (3–5s or tap to continue) before the next player's turn begins, so players can absorb the outcome

---

## Phase 8 — Open Responses (write-in votes) 🗳️
Goal: give players free will — add any response beyond the predetermined options

**Design:** On any question (preset pack or custom), players can tap "Add option" to write in a new response. Once added, that option becomes available to all players in the room to vote on — same as any other option. Promotes live discussion and organic debate rather than forced binary choices.

- [ ] Backend: `response:add-option` event — player submits a new option string, server validates (length, dedup) and broadcasts `question:option-added` to room
- [ ] Backend: update consensus/countdown logic to account for dynamic option count
- [ ] Frontend: "Add your own..." button on the question view (play + host pages), opens a small text input
- [ ] Frontend: newly added options slide into the live vote display with a bounce-in animation
- [ ] Frontend: write-in options visually distinguished (e.g. subtle "✏️ write-in" label)
- [ ] Frontend: QuestionPicker unaffected — write-ins are a gameplay feature, not a question creation feature

---

## Backlog (post-bonfire, if it gets traction)
- Player avatars / emoji selection
- Reaction system during vote reveal
- Session history / replay
- Custom question pack builder
- Redis adapter for horizontal scaling

---

## Domain
- Purchased: `settleit.gg`
