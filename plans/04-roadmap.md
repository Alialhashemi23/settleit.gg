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

## Phase 6 — UI Beautification 🎨🔥 ✅
Goal: make the app feel like a late-night bonfire experience — warm, glowing, full of energy

Design doc: `plans/design.md`

- [x] Load Nunito font (Google Fonts) via layout — preconnect + stylesheet link in `+layout.svelte`, body uses `font-family: 'Nunito'`
- [x] Global color system — CSS vars in `:global(:root)`: `--bg: #0d0905`, `--accent: #e8831a`, full warm palette across all pages
- [x] Button redesign — `min-height: 52px`, ember `box-shadow: 0 0 16–18px var(--accent-alpha)`, spring press `cubic-bezier(0.34, 1.56, 0.64, 1)` on all pages
- [x] Input redesign — warm `var(--border)` borders, amber focus `box-shadow: 0 0 0 3px var(--accent-alpha)` across home, QuestionPicker, write-in forms
- [x] Home page — animated flame SVG (flicker/flickerInner/coreFlicker), `titleGlow` on h1, `slideUp` on hero, bouncy CTA buttons
- [x] Lobby/Host page — room code card at `3.5rem` with `glowPulse` animation, player chips with staggered `bounceIn`
- [x] Play page — option cards `min-height: 72px`, animated `option-bar-fill` progress bars, voter name chips
- [x] Host game page — force settle button with amber glow on hover, two-column question layout with live vote display
- [x] Summary page — entries bounce in with `animation-delay: {i * 80}ms` stagger, glowing h1
- [x] Page transitions — every page root has `slideUp` entrance animation; section changes animate in
- [x] Loading states — waiting states use `.pulse-dot` with `emberPulse` animation (no spinners)
- [x] Error states — form validation errors use `@keyframes shake`; persistent banners use warm red styling without shake (appropriate for non-transient state)

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

## Phase 10 — Shareable Join Links + Copy to Clipboard 🔗 ✅
Goal: make it effortless to invite players — one tap to copy a link, one tap to join

**Context:** Right now the host reads out a room code (e.g. `FIRE-4829`) and players type it manually. A direct join link and a copy button removes that friction entirely.

- [x] Frontend: new route `join/[code]/+page.svelte` — reads `$page.params.code`, shows "Joining..." briefly, then `goto('/?code=FIRE-4829', { replaceState: true })` to redirect home with code in the query string
- [x] Frontend (`+page.svelte`): `onMount` reads `$page.url.searchParams.get('code')` — if present, pre-fills the code field and switches to join mode so player only needs to enter their nickname
- [x] Frontend (`host/[code]/+page.svelte`): "🔗 Copy Link" button inside the room code card; `navigator.clipboard.writeText('https://settleit.gg/join/${code}')`, transitions to "✓ Copied!" with green styling for 2s then resets
- [x] Frontend (`play/[code]/+page.svelte`): small "🔗" icon button pinned to the right of the room header; same clipboard logic and ✓ feedback; for mid-game sharing
- [x] No backend changes needed — join links resolve entirely on the frontend

---

## Phase 11 — Question Roll System + Tagged Library 🎲 ✅
Goal: replace the small 3-pack browser with a randomized "roll" UX backed by hundreds of multi-tagged questions, with per-room exclusion so the same question never repeats in a single game

**Decisions locked in:**
- **Weight scope:** per-lobby session only. Once a question is *asked* (pushed to the room), it's excluded from rolls for the rest of that game. No persistence across games, no localStorage, no global tracking.
- **Topic structure:** multi-tag. Each question carries an array like `["gaming", "hot-take"]`. Roll UI shows tag chips at the top — toggle on/off to control the pool.
- **Roll UX:** Roll replaces the pack browser entirely. The QuestionPicker becomes two tabs: **Roll** (default) and **Custom** (existing write-in). The old `packs.ts` and From Pack tab are deleted.
- **Sourcing:** AI-generated bulk (~500 questions) curated by the user. Generation happens during this phase.

**Proposed starter tag taxonomy** (final list TBD before generation):
- **Topics:** `gaming`, `anime`, `sports`, `movies`, `music`, `food`, `tech`, `internet`, `school`, `nostalgia`
- **Vibes:** `hot-take`, `wholesome`, `weird`, `dark-humor`, `friendship`, `hypothetical`
- Each question gets 1–3 tags. Most questions pair a topic + a vibe (e.g. `gaming` + `hot-take`).

**Data model:**
- New file `frontend/src/lib/presets.ts` replacing `packs.ts`:
  ```ts
  export interface PresetQuestion {
    id: string;          // stable, e.g. "g001", "a042"
    prompt: string;
    options: string[];
    tags: string[];
  }
  export const presets: PresetQuestion[] = [ ... ~500 entries ... ];
  ```
- Backend `questions` table: add `preset_id TEXT NULL` column. Filled when a preset is asked, null for custom write-ins.

**Implementation:**

*Backend:*
- [x] Schema: added `preset_id TEXT` column to `questions` table in `db.ts`
- [x] `question:ask` event accepts optional `presetId` field, stored on the question row
- [x] `question:new` broadcast payload includes `presetId` (null for custom) so all clients track what's been asked
- [x] `room:rejoined` response includes `askedPresetIds: string[]` so reconnecting players have correct exclusion state when their turn comes

*Frontend — data:*
- [x] Generated 210 questions across the full tag taxonomy as `presets.ts` (AI-generated initial batch, ready for user curation/additions over time)
- [x] Deleted `packs.ts`
- [x] New `askedPresetIds` store in `stores.ts` — `Writable<Set<string>>`, reset on home page mount

*Frontend — Roll UI (in `QuestionPicker.svelte`):*
- [x] Replaced "Custom / From Pack" tabs with "🎲 Roll / Custom" (Roll is default)
- [x] Collapsible tag filter section with topic chips + vibe chips, All/None shortcuts; shows selected-count + pool-size summary in the disclosure label
- [x] Initial roll happens automatically when the picker opens (via `$effect`)
- [x] "🎲 Roll a Question" big button when no current roll; "Ask It" + "🎲 Re-roll" actions when one is shown. Re-roll excludes the current question's id to guarantee a different result if pool size ≥ 2
- [x] Rolled card shows prompt, options preview, and tag chips; bounce-in animation
- [x] Edge cases handled inline: "No questions left for those tags" (broaden filters / use Custom) and "Select at least one tag" — re-roll is unlimited (cycles freely)

*Frontend — exclusion tracking:*
- [x] On `question:new`, if `presetId` present, added to `askedPresetIds` store (both host + play pages)
- [x] On `room:rejoined` (play page), populates `askedPresetIds` from server-returned list
- [x] Reset `askedPresetIds` on home page mount (covers room:ended → goto / and any fresh entry)

**Decided inline:**
- Final taxonomy: 10 topics + 6 vibes (`gaming, anime, sports, movies, music, food, tech, internet, school, nostalgia`; `hot-take, wholesome, weird, dark-humor, friendship, hypothetical`)
- Pool-exhausted edge case: show friendly empty state suggesting broader filters or Custom tab — no auto-fallback (preserves user intent)
- Re-roll cap: unlimited — user can re-roll forever. If they cycle past every question in the filtered pool, the random selection will repeat eventually, which is fine

---

## Phase 12 — Optional Presets + Optional Options 🎚️ ✅
Goal: give the host control over whether the game uses the preset pool, and let askers create questions without pre-defined options (pure write-in mode)

**Context:** Two friction points to remove. (1) Some game nights want a "pure custom" feel where everyone writes their own questions and answers — the preset Roll tab is in the way. (2) The Custom tab currently *requires* 2+ options, but Phase 8 write-ins mean players can fill in answers organically. Forcing the asker to seed options is unnecessary work.

---

### Part 1 — Preset Toggle in Lobby

**Design:**
- Host lobby gets a "Use preset questions" toggle (default: ON)
- When OFF: the Roll tab is hidden in the QuestionPicker; only Custom is available to every player on their turn
- Setting is locked at game start — host can only change it before tapping Start Game
- All players see the same setting (it's room state, not per-player)

**Implementation:**
- [x] Backend: added `presets_enabled INTEGER DEFAULT 1` column to `rooms` table in `db.ts`
- [x] Backend: new `room:set-presets-enabled` event — host-only, lobby-only; updates row, broadcasts `room:settings-updated`
- [x] Backend: `presetsEnabled` included in `room:joined` (create + join + host-rejoin) and `room:rejoined` payloads
- [x] Frontend: `presetsEnabled` writable added to `stores.ts`, default `true`; reset on home mount
- [x] Frontend (host lobby): amber toggle switch above Start Game button — "Use preset questions"; emits `room:set-presets-enabled` on change; hidden after game starts
- [x] Frontend (`QuestionPicker.svelte`): if `!$presetsEnabled`, tab bar hidden and Roll section skipped; default tab flips to Custom
- [x] Frontend: `presetsEnabled` set from `room:joined` (home page `once` listeners) and `room:rejoined` (play page); `room:settings-updated` listened on both host + play pages

### Part 2 — Optional Options on Custom Questions

**Design:**
- Custom tab: options become fully optional (label: "Options (optional, 0–4)")
- "Ask It" button enabled with just a prompt — no options required
- When a question has 0 options at start, the question view shows the write-in form expanded by default with a subtle nudge ("No options yet — be the first to add one")
- Players write in options (Phase 8 flow), auto-vote for their own, and consensus proceeds as normal

**Implementation:**
- [x] Backend (`handlers/question.ts`): relaxed `question:ask` validation — accepts `options: []`; only rejects if prompt is empty
- [x] Backend: `question:next` (force settle) now checks if active question has 0 options and returns `no_options_to_settle` error if so
- [x] Frontend (`QuestionPicker.svelte`): Custom tab `disabled` condition changed to `!customPrompt.trim()`; legend updated to "Options (optional, 0–4)"
- [x] Frontend (play + host): `question:new` defaults `showWriteIn = true` when `question.options.length === 0`
- [x] Frontend (play): nudge text "No options yet — be the first to add one" shown when options empty and write-in form not visible
- [x] Frontend (host): Force Settle replaced with nudge "Add at least one option before settling" when options is empty

**Edge cases (decided inline now):**
- Consensus with 0 options: simply doesn't trigger — no votes possible until someone writes in. Fine.
- Consensus with 1 option that everyone votes for: triggers full consensus → settles. Already works.
- Force Settle on 0-option question: block with toast/error rather than settle on nothing.

---

## Infrastructure Fixes (shipped outside phases)

- **SQLite persistence** (`backend/db.ts`): switched from `:memory:` to file-based `./settleit.db`. Rooms, players, questions, and responses now survive backend restarts. `*.db` is gitignored.
- **BUG-004 fix**: `visibilitychange` listener on play page — proactively rejoins on phone lock/background
- **Page refresh fix**: `isReconnecting` state + `room_not_found` error handler on play page

---

## Phase 13 — Docker + Auto-Deploy Pipeline 🐳
Goal: replace dev server setup with production Docker containers and a hands-off auto-deploy pipeline triggered by git push

**Context:** The app is currently hosted using `bun run dev` (backend, port 3001) and `npm run dev` (frontend, port 5173) routed through a Cloudflare Tunnel. This works but requires open terminal windows and manual restarts. Docker gives production-optimized builds (minified frontend, no Vite overhead), automatic container restart on crash, and an auto-deploy watcher that rebuilds and redeploys on every push to `main` — so changes go live without touching the server.

**Order of operations (must be done in this order):**
1. Docker switch — update config, get containers running
2. Auto-deploy watcher — polls git, rebuilds on new commits
3. CLAUDE.md runbook updated with live pipeline commands

**docker-compose.yml changes needed:**
- [ ] Add SQLite volume mount: `./backend/settleit.db:/app/settleit.db` so the DB persists across container rebuilds
- [ ] Verify `VITE_BACKEND_URL=https://api.settleit.gg` build arg is correct
- [ ] Verify `FRONTEND_ORIGIN=https://settleit.gg` CORS setting is correct
- [ ] Verify Cloudflare Tunnel routes: `settleit.gg → localhost:3000` (frontend), `api.settleit.gg → localhost:3001` (backend)

**Auto-deploy watcher:**
- [ ] PowerShell script that polls `git fetch` every 2 minutes, detects new commits on `main`, runs `git pull && docker compose up --build -d`
- [ ] Set up as Windows Task Scheduler job or PM2 process (requires admin one-time)
- [ ] See `CLAUDE.md` (local, gitignored) for the exact script

**Operational notes:**
- See local `CLAUDE.md` for full runbook — commands, how to manage containers, how to roll back, etc.
- `CLAUDE.md` is gitignored — do not commit (contains server-specific paths and pipeline details)

---

## Backlog (post-bonfire, if it gets traction)
- Player avatars / emoji selection
- Reaction system during vote reveal
- Custom question pack builder
- Redis adapter for horizontal scaling

---

## Domain
- Purchased: `settleit.gg`
