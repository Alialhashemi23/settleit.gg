# Settle It

A real-time group opinion game built for friend groups. No accounts, no friction — just a room code and a question.

![settle it demo placeholder](https://placehold.co/900x400/0a0a0a/ff4d00?text=Settle+It)

---

## How it works

1. **Host** creates a room and gets a short code like `FIRE-4829`
2. **Players** join on their phones by entering the code and a nickname
3. **Host** asks a question — vote mode or free text
4. Everyone answers live, results update in real-time
5. Host moves to the next question whenever ready

### Question modes

**Vote** — pick from preset options, watch a live bar chart fill up as votes come in

**Hot Take** *(Phase 2)* — open-ended question, answers appear on screen as players submit them

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | SvelteKit + Svelte 5 |
| Backend | Bun + Socket.io |
| Database | SQLite (`bun:sqlite`) |
| Deployment | Docker Compose |

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`

### Dev

```bash
# Backend (port 3001)
cd backend
bun install
bun run dev

# Frontend (port 5173)
cd frontend
bun install
bun run dev
```

Open [localhost:5173](http://localhost:5173) in two tabs — one as host, one as player.

### Docker

```bash
docker compose up --build
```

Frontend at `localhost:5173`, backend at `localhost:3001`.

---

## Project structure

```
settleit.gg/
├── backend/
│   ├── index.ts          # HTTP + WebSocket server entry
│   ├── db.ts             # SQLite schema + cleanup interval
│   ├── rooms.ts          # Room and player logic
│   └── handlers/
│       ├── room.ts       # room:create, room:join, disconnect handling
│       ├── question.ts   # question:ask, question:next
│       └── response.ts   # response:submit, live broadcast
├── frontend/
│   └── src/
│       ├── routes/
│       │   ├── +page.svelte          # Landing — create or join
│       │   ├── host/[code]/          # Host view
│       │   └── play/[code]/          # Player view
│       └── lib/
│           ├── socket.ts             # Socket.io client
│           └── stores.ts             # Svelte stores for room state
├── docker-compose.yml
└── plans/                # Design docs and roadmap
```

---

## WebSocket events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `room:create` | `{ nickname }` | Host creates a room |
| `room:join` | `{ roomCode, nickname }` | Player joins a room |
| `room:rejoin` | `{ roomCode, nickname }` | Host reclaims session after disconnect |
| `room:end` | — | Host ends the session |
| `question:ask` | `{ type, prompt, options? }` | Host pushes a question |
| `question:next` | — | Host ends current question |
| `response:submit` | `{ questionId, value }` | Player submits a vote or answer |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `room:created` | `{ roomCode }` | Confirms room creation |
| `room:joined` | `{ roomCode, players }` | Confirms join, sends player list |
| `room:updated` | `{ players }` | Player joined or left |
| `room:ended` | — | Session is over |
| `question:new` | `{ question }` | New question pushed to all |
| `response:update` | `{ counts, responses }` | Live update as answers come in |
| `question:ended` | `{ final }` | Host ended the question, final results |
| `host:disconnected` | `{ deadline }` | Host dropped, reconnect window open |
| `error` | `{ message }` | Something went wrong |

---

## Roadmap

- [x] **Phase 1** — Real-time core: room creation, lobby, vote questions, live results
- [ ] **Phase 2** — Full game loop: free text mode, question packs, session summary
- [ ] **Phase 3** — Polish: mobile UI, animations, error states
- [ ] **Phase 4** — Deploy: Hetzner VPS, Caddy, Cloudflare Tunnel

---

## License

MIT
