import { Database } from "bun:sqlite";

export const db = new Database(":memory:");

db.run(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    host_socket_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    mode TEXT NOT NULL DEFAULT 'host-picks',
    turn_order TEXT,
    turn_index INTEGER,
    host_reconnect_deadline INTEGER,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    socket_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    options TEXT,
    created_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(id),
    player_id TEXT NOT NULL REFERENCES players(id),
    value TEXT NOT NULL,
    submitted_at INTEGER NOT NULL
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_responses_question_id ON responses(question_id)`);

// Room cleanup: delete rooms inactive for 2+ hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const stale = db.query("SELECT id FROM rooms WHERE last_active < ?").all(cutoff) as { id: string }[];
  for (const room of stale) {
    db.run("DELETE FROM responses WHERE question_id IN (SELECT id FROM questions WHERE room_id = ?)", [room.id]);
    db.run("DELETE FROM questions WHERE room_id = ?", [room.id]);
    db.run("DELETE FROM players WHERE room_id = ?", [room.id]);
    db.run("DELETE FROM rooms WHERE id = ?", [room.id]);
  }
}, 30 * 60 * 1000);
