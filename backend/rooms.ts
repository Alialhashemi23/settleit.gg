import { db } from "./db";

const ADJECTIVES = ["FIRE", "NOVA", "DARK", "WILD", "IRON", "NEON"];

export function generateRoomCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${num}`;
}

export function createRoom(hostSocketId: string, mode: "host-picks" | "player-turns" = "host-picks"): string {
  let code: string;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
    if (attempts > 5) throw new Error("room_code_collision");
  } while (db.query("SELECT id FROM rooms WHERE id = ?").get(code));

  const now = Date.now();
  db.run(
    "INSERT INTO rooms (id, host_socket_id, status, mode, created_at, last_active) VALUES (?, ?, 'lobby', ?, ?, ?)",
    [code, hostSocketId, mode, now, now]
  );
  return code;
}

export function getRoom(code: string) {
  return db.query("SELECT * FROM rooms WHERE id = ?").get(code) as Room | null;
}

export function touchRoom(code: string) {
  db.run("UPDATE rooms SET last_active = ? WHERE id = ?", [Date.now(), code]);
}

export function setRoomStatus(code: string, status: string) {
  db.run("UPDATE rooms SET status = ?, last_active = ? WHERE id = ?", [status, Date.now(), code]);
}

export function getRoomPlayers(roomId: string) {
  return db.query("SELECT id, nickname FROM players WHERE room_id = ?").all(roomId) as Pick<Player, "id" | "nickname">[];
}

export function addPlayer(roomId: string, socketId: string, nickname: string): string {
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO players (id, room_id, socket_id, nickname, joined_at) VALUES (?, ?, ?, ?, ?)",
    [id, roomId, socketId, nickname, Date.now()]
  );
  return id;
}

export function removePlayerBySocket(socketId: string): { roomId: string; playerId: string } | null {
  const player = db.query("SELECT id, room_id FROM players WHERE socket_id = ?").get(socketId) as { id: string; room_id: string } | null;
  if (!player) return null;
  db.run("DELETE FROM players WHERE socket_id = ?", [socketId]);
  return { roomId: player.room_id, playerId: player.id };
}

export function getPlayerBySocket(socketId: string) {
  return db.query("SELECT * FROM players WHERE socket_id = ?").get(socketId) as Player | null;
}

export function destroyRoom(code: string) {
  db.run("DELETE FROM responses WHERE question_id IN (SELECT id FROM questions WHERE room_id = ?)", [code]);
  db.run("DELETE FROM questions WHERE room_id = ?", [code]);
  db.run("DELETE FROM players WHERE room_id = ?", [code]);
  db.run("DELETE FROM rooms WHERE id = ?", [code]);
}

export function getActiveTurnPlayerId(room: Room): string | null {
  if (!room.turn_order || room.turn_index === null || room.turn_index === undefined) return null;
  const order: string[] = JSON.parse(room.turn_order);
  return order[room.turn_index] ?? null;
}

export function advanceTurnInDB(code: string): { activePlayerId: string; activeNickname: string; turnIndex: number } | null {
  const room = getRoom(code);
  if (!room || !room.turn_order || room.turn_index === null) return null;

  const turnOrder: string[] = JSON.parse(room.turn_order);
  const connected = new Set(
    (db.query("SELECT id FROM players WHERE room_id = ?").all(code) as { id: string }[]).map(p => p.id)
  );

  let nextIndex = (room.turn_index + 1) % turnOrder.length;
  for (let i = 0; i < turnOrder.length; i++) {
    if (connected.has(turnOrder[nextIndex])) break;
    nextIndex = (nextIndex + 1) % turnOrder.length;
  }

  if (!connected.has(turnOrder[nextIndex])) return null;

  db.run("UPDATE rooms SET turn_index = ?, last_active = ? WHERE id = ?", [nextIndex, Date.now(), code]);

  const active = db.query("SELECT id, nickname FROM players WHERE id = ?").get(turnOrder[nextIndex]) as { id: string; nickname: string } | null;
  if (!active) return null;

  return { activePlayerId: active.id, activeNickname: active.nickname, turnIndex: nextIndex };
}

export interface Room {
  id: string;
  host_socket_id: string;
  status: string;
  mode: "host-picks" | "player-turns";
  turn_order: string | null;
  turn_index: number | null;
  host_reconnect_deadline: number | null;
  created_at: number;
  last_active: number;
}

export interface Player {
  id: string;
  room_id: string;
  socket_id: string;
  nickname: string;
  joined_at: number;
}
