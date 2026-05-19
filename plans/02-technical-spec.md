# SettleIt — Technical Spec

## Data Models (SQLite)

### rooms
| column | type | notes |
|---|---|---|
| id | TEXT PK | short code e.g. `FIRE-4829` |
| host_socket_id | TEXT | current host connection |
| status | TEXT | `lobby`, `question`, `results` |
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
| type | TEXT | `vote` or `freetext` |
| prompt | TEXT | the question text |
| options | TEXT | JSON array, null for freetext |
| created_at | INTEGER | unix timestamp |

### responses
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| question_id | TEXT FK | references questions.id |
| player_id | TEXT FK | references players.id |
| value | TEXT | selected option or free text |
| submitted_at | INTEGER | unix timestamp |

---

## Host Authority

The server must check `socket.id === room.host_socket_id` before processing these events:
- `question:ask`
- `question:next`
- `room:end`

If the check fails, emit `error` with `{ message: 'not_authorized' }` back to that socket. Never trust the client to self-identify as host.

---

## Host Disconnect Behavior

- On disconnect, check if the socket was the host
- If yes, set room status to `host_disconnected`, start a 2 minute server-side timer
- Broadcast `host:disconnected` to all players in the room
- If host reconnects within 2 minutes and calls `room:rejoin` with the room code + nickname, reassign `host_socket_id`
- If timer expires with no rejoin, destroy the room and broadcast `room:ended` to all remaining players

### rooms table addition
Add `host_reconnect_deadline` (INTEGER, unix timestamp) — set when host disconnects, null otherwise.

---

## WebSocket Events

### Client → Server

| event | payload | description |
|---|---|---|
| `room:create` | `{ nickname }` | host creates a room |
| `room:join` | `{ roomCode, nickname }` | player joins existing room |
| `question:ask` | `{ type, prompt, options? }` | host pushes a question |
| `response:submit` | `{ questionId, value }` | player submits vote or text |
| `question:next` | `{}` | host ends current question |
| `room:rejoin` | `{ roomCode, nickname }` | host attempts to reclaim session |

### Server → Client

| event | payload | description |
|---|---|---|
| `room:created` | `{ roomCode }` | confirms room creation, sends code |
| `room:joined` | `{ roomCode, players }` | confirms join, sends player list |
| `room:updated` | `{ players }` | player joined or left |
| `question:new` | `{ question }` | new question pushed to all players |
| `response:update` | `{ counts, responses }` | live update as answers come in |
| `question:ended` | `{ final counts/responses }` | host ended the question |
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

---

## Room Cleanup

- Cron job or interval every 30 minutes
- Delete rooms where `last_active` is older than 2 hours
- Cascade delete players, questions, responses

---

## Project Structure

```
thisorthat/
├── frontend/          # SvelteKit app
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte        # landing / create or join
│   │   │   ├── host/[code]/        # host view
│   │   │   └── play/[code]/        # player view
│   │   └── lib/
│   │       ├── socket.ts           # socket.io client setup
│   │       └── stores.ts           # svelte stores for room state
│   └── ...
├── backend/           # Bun + Socket.io server
│   ├── index.ts       # entry, HTTP + WS server
│   ├── db.ts          # SQLite setup + queries
│   ├── rooms.ts       # room logic
│   └── handlers/      # socket event handlers
│       ├── room.ts
│       ├── question.ts
│       └── response.ts
├── docker-compose.yml
└── README.md
```

---

## Lunch Scope (Priority Order)

1. Backend: room creation + join via socket
2. Backend: player presence (join/leave events)
3. Frontend: landing page (create room / join with code)
4. Frontend: lobby view showing connected players
5. Frontend: host can push a vote question
6. Frontend: players see question and can vote
7. Frontend: live result counts update in real-time

**Stop here for lunch.** Free text mode, question packs, and UI polish are weekend scope.
