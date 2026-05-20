# SettleIt — Technical Spec

## Data Models (SQLite)

### rooms
| column | type | notes |
|---|---|---|
| id | TEXT PK | short code e.g. `FIRE-4829` |
| host_socket_id | TEXT | current host connection |
| status | TEXT | `lobby`, `question` |
| mode | TEXT | always `player-turns` |
| turn_order | TEXT | JSON array of player IDs, set on `game:start` |
| turn_index | INTEGER | index into turn_order for current active player |
| host_reconnect_deadline | INTEGER | unix timestamp, set on host disconnect, null otherwise |
| created_at | INTEGER | unix timestamp |
| last_active | INTEGER | unix timestamp, used for cleanup |

### players
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| room_id | TEXT FK | references rooms.id |
| socket_id | TEXT | current connection |
| nickname | TEXT | display name |
| joined_at | INTEGER | unix timestamp |

### questions
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| room_id | TEXT FK | references rooms.id |
| type | TEXT | always `vote` |
| prompt | TEXT | the question text |
| options | TEXT | JSON array of 2–4 option strings |
| created_at | INTEGER | unix timestamp |

### responses
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| question_id | TEXT FK | references questions.id |
| player_id | TEXT FK | references players.id |
| value | TEXT | selected option (upserted on vote change) |
| submitted_at | INTEGER | unix timestamp, updated on change |

---

## Authority

The server must check `socket.id === room.host_socket_id` before:
- `game:start`
- `room:end`

The active player (derived from `turn_order[turn_index]`) controls:
- `question:ask` — only the active player can ask
- `question:next` (force-settle) — active player or host as override

Check: `socket.data.playerId === turn_order[turn_index]`

If any check fails, emit `error { message: 'not_authorized' }`. Never trust the client to self-identify.

---

## Consensus Mechanic

After every `response:submit` (including vote changes), the server checks:

1. **Full consensus**: all `players.length` have voted the same value → settle immediately
2. **Soft consensus**: all-but-one agree (`players.length - 1` for groups ≥ 3; all for 2-player) → start 10s countdown
3. **Consensus broken**: leading option drops below threshold → cancel countdown
4. **Force settle**: active player (or host override) calls `question:next` → cancel countdown, settle with current leader

Countdown state is held in-memory per room (not persisted to DB). On settle, emit `question:ended` and advance turn.

---

## Disconnect Behavior

### Host disconnect
- Set room status to `host_disconnected`, start 2-minute server-side timer
- Broadcast `host:disconnected { deadline }` to all players
- If host calls `room:rejoin { roomCode, nickname }` within 2 minutes, reassign `host_socket_id`
- If timer expires, destroy room and broadcast `room:ended`

### Player disconnect
- Remove from `players` immediately, broadcast `room:updated`
- If disconnected player was the active turn player: auto-advance turn, emit `turn:changed`
- Player can rejoin with same nickname via `room:join`

---

## WebSocket Events

### Client → Server

| event | payload | description |
|---|---|---|
| `room:create` | `{ nickname }` | host creates a room |
| `room:join` | `{ roomCode, nickname }` | player joins existing room |
| `room:rejoin` | `{ roomCode, nickname }` | host reclaims session after disconnect |
| `room:end` | `{}` | host ends the session |
| `game:start` | `{}` | host starts the game; randomises and locks turn order |
| `question:ask` | `{ prompt, options }` | active player pushes a vote question |
| `response:submit` | `{ questionId, value }` | player submits or changes their vote |
| `question:next` | `{}` | active player force-settles; host can override |

### Server → Client

| event | payload | description |
|---|---|---|
| `room:created` | `{ roomCode }` | confirms room creation |
| `room:joined` | `{ roomCode, players, playerId }` | confirms join; includes caller's own player ID |
| `room:updated` | `{ players }` | player joined or left |
| `game:started` | `{ turnOrder, activePlayerId, activeNickname }` | turn order locked; first player identified |
| `turn:changed` | `{ activePlayerId, activeNickname, turnIndex }` | turn advanced to next player |
| `question:new` | `{ question }` | new question pushed to all players |
| `response:update` | `{ votes, totalPlayers }` | live update; `votes` is `[{ playerId, nickname, value }]` |
| `question:countdown` | `{ deadline, leadingOption }` | soft consensus reached; countdown started |
| `question:countdown:cancelled` | `{}` | consensus broken; countdown cancelled |
| `question:ended` | `{ final: { counts }, settledOption }` | question settled |
| `room:ended` | `{}` | session over |
| `host:disconnected` | `{ deadline }` | host dropped, reconnect window started |
| `error` | `{ message }` | something went wrong |

---

## Room Code Generation

```js
const adjectives = ['FIRE', 'NOVA', 'DARK', 'WILD', 'IRON', 'NEON'];
const generateCode = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${num}`; // e.g. FIRE-4829
};
```

Generate a code, check if it already exists in the DB, and retry on collision. Max 5 attempts before returning an error — in practice collisions are extremely rare across ~54,000 possible codes.

---

## Room Cleanup

- Interval every 30 minutes
- Delete rooms where `last_active` is older than 2 hours
- Cascade delete players, questions, responses

---

## Indexes

```sql
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_responses_question_id ON responses(question_id);
```

---

## Project Structure

```
settleit.gg/
├── frontend/          # SvelteKit app
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte          # landing / create or join
│   │   │   ├── host/[code]/          # host view
│   │   │   ├── play/[code]/          # player view
│   │   │   └── summary/              # post-session summary
│   │   └── lib/
│   │       ├── socket.ts             # socket.io client setup
│   │       ├── stores.ts             # svelte stores for room state
│   │       ├── packs.ts              # preset question packs
│   │       └── QuestionPicker.svelte # shared question picker component
│   └── ...
├── backend/           # Bun + Socket.io server
│   ├── index.ts       # entry, HTTP + WS server
│   ├── db.ts          # SQLite setup + indexes
│   ├── rooms.ts       # room/player CRUD + turn helpers
│   ├── game.ts        # consensus logic, countdown, settleQuestion
│   └── handlers/      # socket event handlers
│       ├── room.ts
│       ├── question.ts
│       └── response.ts
├── docker-compose.yml
└── plans/
```
