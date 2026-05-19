# SettleIt — Project Overview

A real-time group opinion game built for bonfire nights and friend groups.
No accounts, no friction — just a room code and a question.

## The Core Loop

1. Host creates a room → gets a short code (e.g. `FIRE-4829`)
2. Friends join on their phones via URL + code + nickname
3. Host asks a question — either from a preset pack or typed custom
4. Everyone votes or submits answers live
5. Results display in real-time as they roll in
6. Host moves to next question whenever ready

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

Only the host can:
- Push a new question (`question:ask`)
- End the current question (`question:next`)
- End the session (`room:end`)

The server must validate the socket ID against `rooms.host_socket_id` before executing any of these actions. Players attempting to call host-only events should receive an `error` event back with a `not_authorized` message.

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
- Create Room just asks for a nickname, then creates the room and redirects to host view

### Lobby Screen — Player (`/play/[code]`)
- Shows room code large at the top
- List of connected players with nicknames
- "Waiting for host to start..." message
- Updates live as players join

### Lobby Screen — Host (`/host/[code]`)
- Shows room code large and readable (players are typing this on their phones)
- Live player list
- Button to start — opens question picker

### Question Picker — Host only
- Tabs: "Question Packs" | "Custom Question"
- Pack tab: grid of packs (Gaming, Anime, Wildcards), tap to expand, tap a question to push it
- Custom tab: text input for prompt, toggle for Vote vs Free Text mode, option inputs if Vote mode

### Question Screen — Player (`/play/[code]`)
- Vote mode: prompt at top, large tap targets for each option, confirmation on tap, locked after voting
- Free text mode: prompt at top, text input, submit button

### Question Screen — Host (`/host/[code]`)
- Prompt displayed at top
- Vote mode: live bar chart updating as votes come in, player count indicator
- Free text mode: answers slide in as submitted, host can tap to highlight one
- "Next Question" button always visible

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
