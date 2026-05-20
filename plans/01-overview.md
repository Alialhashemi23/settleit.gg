# SettleIt — Project Overview

A real-time social debate game built for bonfire nights and friend groups.
No accounts, no friction — just a room code and a question.

## The Core Loop

1. Host creates a room → gets a short code (e.g. `FIRE-4829`)
2. Friends join on their phones via URL + code + nickname
3. Host starts the game — a random turn order is locked in and revealed to everyone
4. The active player picks or types a question (vote options only) from their own device
5. Everyone votes — names are visible next to each option, live as votes come in
6. Players can change their vote freely — the numbers shift in real-time as debate happens
7. When all-but-one agree on the same option, a 10-second countdown starts
8. If a holdout flips before it expires, the countdown cancels — debate continues
9. If the countdown completes, the round is settled on that option
10. The active player can also force-settle at any time
11. Turn advances to the next player — repeat until the host ends the session

**The point:** the live shifting numbers while people argue is the game. "Settle It" means reaching actual group agreement, not just polling.

---

## One Question Type: Vote

- Active player creates a question with 2–4 fixed options
- Everyone votes live, including the active player
- Names visible next to each option — no anonymous polling
- Votes are changeable until the round settles
- Good for: "Who's the GOAT?", "Pineapple on pizza?", "Best console ever?"

---

## Consensus Mechanic

- **Full consensus** (everyone on the same option) → settles immediately
- **Soft consensus** (all-but-one agree) → 10-second countdown starts; holdout can flip to cancel
- **Force Settle** → only the active player (the one who asked) can skip the countdown
- The host can always end the room but cannot force-settle individual rounds

---

## Authority Rules

The **host** controls:
- Starting the game (`game:start`)
- Ending the session (`room:end`)

The **active player** (whose turn it is) controls:
- Asking a question (`question:ask`)
- Force-settling a stuck round (`question:next`)

See `02-technical-spec.md` for server-side enforcement details.

---

## Disconnect Behavior

### Host
- If the host disconnects, the room enters `host_disconnected` status
- Players see a "Waiting for host to reconnect..." message
- Host has a **2 minute window** to rejoin using the same room code
- On rejoin, server reassigns `host_socket_id`
- If 2 minutes elapse with no rejoin, the room is destroyed and all players receive `room:ended`

### Players
Players who disconnect are removed immediately and can rejoin with the same nickname. In player turns mode, disconnected players are skipped on their turn.

---

## Screen Definitions

### Landing Screen (`/`)
- Two options: "Create Room" and "Join Room"
- Join reveals a code input + nickname input
- Create asks for a nickname only → creates room → redirects to host view

### Lobby Screen — Host (`/host/[code]`)
- Shows room code large and readable
- Live player list
- "Start Game" button — requires 2+ players; locks in random turn order

### Lobby Screen — Player (`/play/[code]`)
- Shows room code at the top
- List of connected players
- "Waiting for host to start..." message

### Turn Order Reveal (both views)
- Shown for 2.5 seconds after "Start Game" is pressed
- Animated list of players in order, current player highlighted as "YOU"
- Auto-dismisses; active player's question picker opens immediately after

### Question Picker (active player only, on their own device)
- Tabs: "Custom" | "From Pack"
- Custom: prompt input + 2–4 option fields
- Pack: choose from Gaming, Anime, or Wildcards packs

### Active Question Screen (all players)
- Question prompt at top
- Each option shown as a card with live count, thin progress bar, and names of voters
- Current player's selection highlighted in orange
- Tapping any option changes vote and broadcasts immediately
- Countdown banner appears when soft consensus is reached: "Settling on X in Ns — change vote to stop it!"
- Active player sees a "Force Settle" button

### Post-Round (both views)
- "✅ Settled!" confirmation shown briefly
- Turn advances to next player; their picker opens automatically

### Session Summary (`/summary`)
- All questions asked, what was settled, who voted what
- "New Game" button returns to landing

---

## MVP Scope

**Included:**
- Room creation and join via code + nickname
- Player turns — question asking rotates through everyone
- Vote questions with live named tallies
- Soft consensus countdown + force settle
- Turn order reveal animation
- Session summary screen
- Room cleanup after 2hr inactivity
- Docker + Cloudflare Tunnel deployment

**Explicitly excluded (post-MVP):**
- User accounts or persistent identity
- Session history / replay
- Player avatars or reactions
- Rate limiting / abuse protection
- Redis / horizontal scaling
- Monetization

---

## Design Principles

- **No auth, no accounts** — rooms are ephemeral, die after inactivity
- **Phone-first** — players are on their phones, host has the big screen
- **Low friction** — URL + code is the entire onboarding
- **Social over anonymous** — names on votes create accountability and debate

---

## Stack

- **Frontend**: SvelteKit + Svelte 5
- **Backend**: Bun + Socket.io (WebSockets)
- **Database**: SQLite via `bun:sqlite`
- **Language**: TypeScript throughout
- **Deployment**: Docker Compose + Cloudflare Tunnel
