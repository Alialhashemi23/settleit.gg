# SettleIt — Claude Code Kickoff Prompt

Paste this as your first message to Claude Code when you sit down.
Adjust anything in [brackets] before sending.

---

## Prompt

Build a real-time multiplayer group opinion game called **SettleIt**.

### What it does
- A host creates a room and gets a short code (e.g. `FIRE-4829`)
- Players join on their phones by entering the code and a nickname — no auth, no accounts
- Host asks questions in two modes:
  - **Vote mode**: preset options, players tap to vote, live bar chart updates as votes come in
  - **Free text mode**: open question, players type answers, responses appear live on screen
- Host controls pacing — advances to next question manually
- Multiple concurrent rooms supported from day one — key everything by room code

### Stack
- **Frontend**: SvelteKit
- **Backend**: Bun + Socket.io
- **Database**: SQLite via `better-sqlite3` (in-memory for now, synchronous is fine)
- **Structure**: monorepo with `/frontend` and `/backend` folders
- Dockerized from the start — include a `docker-compose.yml`

### Data models
- `rooms` — id (short code), host_socket_id, status, created_at, last_active
- `players` — id, room_id, socket_id, nickname, joined_at
- `questions` — id, room_id, type (vote|freetext), prompt, options (JSON), created_at
- `responses` — id, question_id, player_id, value, submitted_at

### WebSocket events (Client → Server)
- `room:create` `{ nickname }` → host creates room
- `room:join` `{ roomCode, nickname }` → player joins
- `question:ask` `{ type, prompt, options? }` → host pushes question
- `response:submit` `{ questionId, value }` → player responds
- `question:next` → host ends current question
- `room:end` → host ends session

### WebSocket events (Server → Client)
- `room:created` `{ roomCode }`
- `room:joined` `{ roomCode, players }`
- `room:updated` `{ players }`
- `question:new` `{ question }`
- `response:update` `{ counts, responses }`
- `question:ended` `{ final }`
- `room:ended`
- `error` `{ message }`

### Room code generation
Short memorable codes like `FIRE-4829` — adjective prefix + 4 digit number.

### Start with this scope only
1. Backend: room creation and join via socket, player presence tracking
2. Frontend: landing page (create room / join with code)
3. Frontend: lobby showing connected players
4. Frontend: host can push a vote question, players vote, live counts update

Do not build free text mode, question packs, or UI polish yet. Get the real-time core working first.

### Host authority
- Only the host can call `question:ask`, `question:next`, and `room:end`
- Server must validate `socket.id === room.host_socket_id` before processing these — reject with `error { message: 'not_authorized' }` if check fails
- Never trust client to self-identify as host

### Host disconnect behavior
- On disconnect, check if socket was the host
- If yes, set room to `host_disconnected` status, start a 2 minute timer, broadcast `host:disconnected { deadline }` to all players
- If host calls `room:rejoin { roomCode, nickname }` within 2 minutes, reassign `host_socket_id`
- If timer expires, destroy room and broadcast `room:ended` to all players

### Notes
- Keep the player view phone-friendly (large tap targets, minimal layout)
- Host view can assume a larger screen
- Add a simple room cleanup interval — delete rooms inactive for 2+ hours
