# SettleIt — Project Overview

A real-time group opinion game built for bonfire nights and friend groups.
No accounts, no friction — just a room code and a question.

## The Core Loop

There are two game modes, selected by the host at room creation:

### Host Picks Mode (default)
1. Host creates a room → gets a short code (e.g. `FIRE-4829`)
2. Friends join on their phones via URL + code + nickname
3. Host asks a question — either from a preset pack or typed custom
4. Everyone votes or submits answers live
5. Results display in real-time as they roll in
6. Host moves to next question whenever ready

### Player Turns Mode
1. Host creates a room in "Player Turns" mode
2. Friends join the same way
3. Host starts the game — a random turn order is locked in across all players
4. The active player (shown on everyone's screen) picks or types a question from their own device
5. Everyone answers — including the active player
6. Results reveal, then the turn passes to the next player in the order
7. Rotates until all players have gone, then loops (or host ends the session)

## Two Question Modes

### This or That (Preset Options)
- Host picks or creates a question with fixed options
- Players tap to vote
- Live bar chart updates as votes come in
- Good for: "Best villain — Sephiroth vs Ganondorf?"

### Hot Take (Free Text)
- Host asks an open question
- Players type a free-text answer
- Answers appear on screen one by one as submitted
- Group discusses and reacts
- Good for: "Most underrated game of all time?"

## Host Authority Rules

The host always controls:
- Starting the game / locking in turn order (`game:start`)
- Ending the session (`room:end`)

In **Host Picks** mode, the host also controls:
- Pushing questions (`question:ask`)
- Advancing to the next question (`question:next`)

In **Player Turns** mode, the **active player** controls:
- Pushing a question (`question:ask`) — they get the same picker UI as the host
- The question auto-advances after the host (or active player) ends it

The server validates socket ID against `rooms.host_socket_id` for host-only events and against the current turn's player for active-player events. Unauthorized calls return `error: not_authorized`.

## Host Disconnect Behavior

- If the host disconnects, the room enters a `host_disconnected` status
- Players see a "Waiting for host to reconnect..." message
- Host has a **2 minute window** to rejoin using the same room code
- On rejoin, server reassigns `host_socket_id` to their new socket
- If 2 minutes elapse with no host reconnect, the room is destroyed and all players receive `room:ended`

## Screen Definitions

### Landing Screen (`/`)
- Two options: "Create Room" and "Join Room"
- Join Room reveals a code input + nickname input
- Create Room asks for a nickname and a game mode ("Host Picks" or "Player Turns"), then creates the room and redirects to host view

### Lobby Screen — Player (`/play/[code]`)
- Shows room code large at the top
- List of connected players with nicknames
- "Waiting for host to start..." message
- Updates live as players join

### Lobby Screen — Host (`/host/[code]`)
- Shows room code large and readable (players are typing this on their phones)
- Live player list
- In Host Picks mode: "Ask a Question" button opens picker
- In Player Turns mode: "Start Game" button locks in random turn order and broadcasts it

### Question Picker (Host Picks mode: host only / Player Turns mode: active player only)
- Tabs: "Question Packs" | "Custom Question"
- Pack tab: grid of packs (Gaming, Anime, Wildcards), tap to expand, tap a question to push it
- Custom tab: text input for prompt, toggle for Vote vs Free Text mode, option inputs if Vote mode

### Question Screen — Player (`/play/[code]`)
- Vote mode: prompt at top, large tap targets for each option, confirmation on tap, locked after voting
- Free text mode: prompt at top, text input, submit button
- In Player Turns mode: shows whose turn it is in the header; active player sees the question picker instead of a waiting screen

### Question Screen — Host (`/host/[code]`)
- Prompt displayed at top
- Vote mode: live bar chart updating as votes come in, player count indicator
- Free text mode: answers slide in as submitted
- "Next Question" button always visible (host can always advance)
- In Player Turns mode: shows turn order and whose turn is next

### Turn Order Screen (Player Turns mode only)
- Displayed briefly after "Start Game" is pressed
- Shows the randomised player order with an animation
- Auto-dismisses after a few seconds, active player immediately gets the picker

### Results / End Screen
- Session summary — questions asked, most popular answers
- "Play Again" button starts a new session in the same room

## MVP Scope

**Included:**
- Room creation and join via code + nickname
- Vote mode (preset options, live bar chart)
- Free text mode (open answers, live reveal)
- Host authority (only host controls question flow)
- Multiple concurrent rooms
- Room cleanup after 2hr inactivity
- Docker + basic deployment

**Explicitly excluded (post-MVP):**
- User accounts or persistent identity
- Session history / replay
- Player avatars or reactions
- Rate limiting / abuse protection
- Redis / horizontal scaling
- Monetization

## Design Principles

- **No auth, no accounts** — rooms are ephemeral, die after inactivity
- **Phone-first** — players are on their phones, host has the big screen
- **Low friction** — URL + code is the entire onboarding
- **Multiple concurrent rooms** — keyed by room code from day one

## Stack

- **Frontend**: SvelteKit
- **Backend**: Bun + Socket.io (WebSockets)
- **Database**: SQLite (in-memory for prototype, file-based for prod)
- **Deployment**: Docker Compose + Cloudflare Tunnel (dev) → Hetzner VPS (prod)

## Domain

- Primary candidate: `settleit.gg` (~$70/yr on Namecheap) — preferred, fits the gaming audience
- Fallback: `settleit.to` (~$30/yr on Namecheap)
- Buy after prototype is validated at a bonfire
