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

## Phase 7 — QoL + Bug Fixes 🛠️ ✅
Goal: polish the real-world play experience based on bonfire test findings

- [x] **BUG-003** Mobile reconnect — `socket.on("connect")` now always calls `rejoinSession()` unconditionally; backend `room:player-rejoin` restores player into active game state
- [x] **BUG-002** Turn reveal highlight — index 0 player gets `.first` class (amber glow + "FIRST" badge), separate from "YOU" badge on local player
- [x] **QoL** Auto-insert dash in room code input — `oninput` handler formats entry as `XXXX-XXXX` automatically
- [x] **QoL** Post-question result screen — 3s overlay after question settles showing settled option + vote breakdown; tap to dismiss early; picker held until dismissed

---

## Phase 8 — Open Responses (write-in votes) 🗳️ ✅
Goal: give players free will — add any response beyond the predetermined options

**Design:** On any question (preset pack or custom), players can tap "Add option" to write in a new response. Once added, that option becomes available to all players in the room to vote on — same as any other option. Promotes live discussion and organic debate rather than forced binary choices.

- [x] Backend: `response:add-option` event — validates (non-empty, max 50 chars, max 8 total options, case-insensitive dedup), updates question options in DB, broadcasts `question:option-added`, auto-votes for the adder, re-runs consensus check
- [x] Backend: consensus/countdown logic unchanged — works correctly with dynamic option counts since it operates on votes not option list length
- [x] Frontend: "✏️ Add your own..." button on the question view (play + host pages), opens an inline text input with Add/Cancel; auto-dismissed after submit
- [x] Frontend: newly added options slide into the live vote display via existing `votesByOption` derived (options list is reactive); bounce-in animation inherited from option card enter
- [x] Frontend: write-in options visually distinguished with dashed border and "✏️ write-in" chip; tracked per-question in a `writeInOptions` Set reset on each new question
- [x] Frontend: QuestionPicker unaffected — write-ins are a gameplay feature, not a question creation feature

---

## Phase 9 — Player Question History 📜 ✅
Goal: every player can see the full question and vote history during a session, not just the host

**Context:** The host already had a collapsible "Session History" panel. Players had no way to look back. The `questionHistory` store was already populated client-side on the play page as questions settle — the main work was building the UI, extracting a shared component, and restoring history for rejoining players.

- [x] Frontend: extracted `HistoryPanel.svelte` shared component — collapsible toggle, question prompt, settled option badge, full vote breakdown with progress bars and voter names per option; used by both host and play pages
- [x] Frontend (`host/[code]/+page.svelte`): replaced inline history section with `<HistoryPanel />`; removed `showHistory` state and old history CSS
- [x] Frontend (`play/[code]/+page.svelte`): added `<HistoryPanel />` below the lobby/question section; players now see the same history panel as the host
- [x] Backend (`handlers/room.ts`): `room:rejoined` now queries all settled questions for the room, computes settled option from stored responses, and returns `history[]` alongside the active question state
- [x] Frontend: `room:rejoined` handler populates `questionHistory` store from server-returned history so reconnecting players see all past questions

---

## Phase 10 — Shareable Join Links + Copy to Clipboard 🔗
Goal: make it effortless to invite players — one tap to copy a link, one tap to join

**Context:** Right now the host reads out a room code (e.g. `FIRE-4829`) and players type it manually. This is a friction point, especially on mobile where even with auto-formatting it's an extra step. A direct join link and a copy button removes that entirely.

**Design:**
- The host lobby shows a **"Copy Link"** button (and optionally a secondary "Copy Code" button) next to the room code card
- Copying puts `https://settleit.gg/join/FIRE-4829` on the clipboard — a full URL players can tap in Discord/iMessage/etc.
- A new SvelteKit route `/join/[code]` accepts the room code from the URL and redirects to the home page with the code pre-filled in the join form, so players only need to enter their nickname
- Brief "Copied!" confirmation replaces the button label for ~2 seconds, then resets — no toast library needed
- The copy button also appears on the play page header (for players who want to share mid-game)

**Implementation:**
- [ ] Frontend: new route `frontend/src/routes/join/[code]/+page.svelte` — on mount, reads `$page.params.code`, saves it to a store or sessionStorage, and `goto('/')` with the code pre-loaded into the join form
- [ ] Frontend (`+page.svelte`): detect a pre-loaded code on mount (from the join redirect) and automatically switch to join mode with the code field pre-filled; player just enters nickname and taps Join
- [ ] Frontend (`host/[code]/+page.svelte`): add "Copy Link" button to the room code card; uses `navigator.clipboard.writeText()` with `https://settleit.gg/join/${code}`; shows "Copied!" for 2s then resets
- [ ] Frontend (`play/[code]/+page.svelte`): add a small copy icon/button next to the room code in the header for mid-game sharing
- [ ] No backend changes needed — join links resolve entirely on the frontend

---

## Backlog (post-bonfire, if it gets traction)
- Player avatars / emoji selection
- Reaction system during vote reveal
- Custom question pack builder
- Redis adapter for horizontal scaling

---

## Domain
- Purchased: `settleit.gg`
