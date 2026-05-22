import type { Server, Socket } from "socket.io";
import {
  createRoom,
  getRoom,
  getRoomPlayers,
  addPlayer,
  removePlayerBySocket,
  setRoomStatus,
  destroyRoom,
  touchRoom,
  advanceTurnInDB,
  getActiveTurnPlayerId,
} from "../rooms";
import { db } from "../db";

const reconnectTimers = new Map<string, Timer>();

export function registerRoomHandlers(io: Server, socket: Socket) {
  socket.on("room:create", ({ nickname }: { nickname: string }) => {
    let code: string;
    try {
      code = createRoom(socket.id, "player-turns");
    } catch {
      socket.emit("error", { message: "room_create_failed" });
      return;
    }
    const playerId = addPlayer(code, socket.id, nickname);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    socket.data.playerId = playerId;
    socket.emit("room:created", { roomCode: code });
    socket.emit("room:joined", { roomCode: code, players: getRoomPlayers(code), playerId, presetsEnabled: true });
  });

  socket.on("room:join", ({ roomCode, nickname }: { roomCode: string; nickname: string }) => {
    const code = roomCode.toUpperCase();
    const room = getRoom(code);

    if (!room) {
      socket.emit("error", { message: "room_not_found" });
      return;
    }
    if (room.status === "ended") {
      socket.emit("error", { message: "room_ended" });
      return;
    }

    const playerId = addPlayer(code, socket.id, nickname);
    touchRoom(code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = false;
    socket.data.playerId = playerId;

    const players = getRoomPlayers(code);
    socket.emit("room:joined", { roomCode: code, players, playerId, presetsEnabled: room.presets_enabled !== 0 });
    socket.to(code).emit("room:updated", { players });

    const activeQ = db.query(
      "SELECT * FROM questions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(code) as any;
    if (activeQ && room.status === "question") {
      socket.emit("question:new", { question: { ...activeQ, options: activeQ.options ? JSON.parse(activeQ.options) : null } });
    }
  });

  socket.on("room:rejoin", ({ roomCode, nickname }: { roomCode: string; nickname: string }) => {
    const code = roomCode.toUpperCase();
    const room = getRoom(code);

    if (!room || room.status !== "host_disconnected") {
      socket.emit("error", { message: "room_not_found" });
      return;
    }
    if (room.host_reconnect_deadline && Date.now() > room.host_reconnect_deadline) {
      socket.emit("error", { message: "reconnect_window_expired" });
      return;
    }

    const timer = reconnectTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(code);
    }

    db.run("UPDATE rooms SET host_socket_id = ?, status = 'lobby', host_reconnect_deadline = NULL WHERE id = ?", [socket.id, code]);
    const playerId = addPlayer(code, socket.id, nickname);
    touchRoom(code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    socket.data.playerId = playerId;

    const players = getRoomPlayers(code);
    const rejoinedRoom = getRoom(code)!;
    socket.emit("room:joined", { roomCode: code, players, playerId, presetsEnabled: rejoinedRoom.presets_enabled !== 0 });
    io.to(code).emit("room:updated", { players });
  });

  socket.on("room:set-presets-enabled", ({ enabled }: { enabled: boolean }) => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.host_socket_id !== socket.id) return;
    if (room.status !== "lobby") return;
    db.run("UPDATE rooms SET presets_enabled = ? WHERE id = ?", [enabled ? 1 : 0, code]);
    touchRoom(code);
    io.to(code).emit("room:settings-updated", { presetsEnabled: enabled });
  });

  socket.on("game:start", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.host_socket_id !== socket.id) {
      socket.emit("error", { message: "not_authorized" });
      return;
    }
    if (room.mode !== "player-turns") return;

    const players = getRoomPlayers(code);
    if (players.length < 2) {
      socket.emit("error", { message: "not_enough_players" });
      return;
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const turnOrder = shuffled.map(p => p.id);

    db.run(
      "UPDATE rooms SET turn_order = ?, turn_index = 0, last_active = ? WHERE id = ?",
      [JSON.stringify(turnOrder), Date.now(), code]
    );

    const first = shuffled[0];
    io.to(code).emit("game:started", {
      turnOrder: shuffled,
      activePlayerId: first.id,
      activeNickname: first.nickname,
    });
  });

  socket.on("room:player-rejoin", ({ roomCode, playerId, nickname }: { roomCode: string; playerId: string; nickname: string }) => {
    const code = roomCode.toUpperCase();
    const room = getRoom(code);

    if (!room || room.status === "ended") {
      socket.emit("error", { message: "room_not_found" });
      return;
    }

    const existing = db.query("SELECT id FROM players WHERE id = ? AND room_id = ?").get(playerId, code) as { id: string } | null;
    if (existing) {
      db.run("UPDATE players SET socket_id = ? WHERE id = ?", [socket.id, playerId]);
    } else {
      db.run(
        "INSERT INTO players (id, room_id, socket_id, nickname, joined_at) VALUES (?, ?, ?, ?, ?)",
        [playerId, code, socket.id, nickname, Date.now()]
      );
    }

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;
    socket.data.isHost = false;
    touchRoom(code);

    const players = getRoomPlayers(code);
    io.to(code).emit("room:updated", { players });

    let turnOrderPlayers: { id: string; nickname: string }[] | null = null;
    const activePlayerId = getActiveTurnPlayerId(room);

    if (room.turn_order) {
      const order: string[] = JSON.parse(room.turn_order);
      turnOrderPlayers = order
        .map(pid => db.query("SELECT id, nickname FROM players WHERE id = ?").get(pid) as { id: string; nickname: string } | null)
        .filter((p): p is { id: string; nickname: string } => p !== null);
    }

    let currentQuestion = null;
    let currentVotes: { value: string; playerId: string; nickname: string }[] = [];

    const allQuestions = db.query(
      "SELECT * FROM questions WHERE room_id = ? ORDER BY created_at ASC"
    ).all(code) as any[];

    const activeQuestionId = room.status === "question"
      ? allQuestions[allQuestions.length - 1]?.id
      : null;

    if (activeQuestionId) {
      const q = allQuestions[allQuestions.length - 1];
      currentQuestion = { id: q.id, type: q.type, prompt: q.prompt, options: JSON.parse(q.options ?? "[]") };
      currentVotes = db.query(`
        SELECT r.value, p.id as playerId, p.nickname
        FROM responses r
        JOIN players p ON r.player_id = p.id
        WHERE r.question_id = ?
        ORDER BY r.submitted_at ASC
      `).all(q.id) as { value: string; playerId: string; nickname: string }[];
    }

    const history = allQuestions
      .filter(q => q.id !== activeQuestionId)
      .map(q => {
        const options: string[] = JSON.parse(q.options ?? "[]");
        const votes = db.query(`
          SELECT r.value, p.id as playerId, p.nickname
          FROM responses r
          JOIN players p ON r.player_id = p.id
          WHERE r.question_id = ?
          ORDER BY r.submitted_at ASC
        `).all(q.id) as { value: string; playerId: string; nickname: string }[];
        const counts: Record<string, number> = {};
        for (const opt of options) counts[opt] = 0;
        for (const v of votes) counts[v.value] = (counts[v.value] ?? 0) + 1;
        const settledOption = votes.length > 0
          ? (Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null)
          : null;
        return { question: { id: q.id, type: q.type, prompt: q.prompt, options }, settledOption, votes };
      });

    const askedPresetIds = allQuestions
      .map(q => q.preset_id as string | null)
      .filter((id): id is string => !!id);

    socket.emit("room:rejoined", {
      roomCode: code,
      playerId,
      players,
      turnOrder: turnOrderPlayers,
      activePlayerId,
      currentQuestion,
      currentVotes,
      history,
      askedPresetIds,
      presetsEnabled: room.presets_enabled !== 0,
    });
  });

  socket.on("room:end", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.host_socket_id !== socket.id) {
      socket.emit("error", { message: "not_authorized" });
      return;
    }
    io.to(code).emit("room:ended");
    destroyRoom(code);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = getRoom(code);
    if (!room) return;

    const removed = removePlayerBySocket(socket.id);
    const players = getRoomPlayers(code);

    if (room.host_socket_id === socket.id) {
      const deadline = Date.now() + 2 * 60 * 1000;
      db.run(
        "UPDATE rooms SET status = 'host_disconnected', host_reconnect_deadline = ? WHERE id = ?",
        [deadline, code]
      );
      io.to(code).emit("host:disconnected", { deadline });

      const timer = setTimeout(() => {
        const stillGone = getRoom(code);
        if (stillGone?.status === "host_disconnected") {
          io.to(code).emit("room:ended");
          destroyRoom(code);
        }
        reconnectTimers.delete(code);
      }, 2 * 60 * 1000);
      reconnectTimers.set(code, timer);
    } else {
      touchRoom(code);
      io.to(code).emit("room:updated", { players });

      // In player-turns mode, if the disconnected player was the active one, advance the turn
      if (room.mode === "player-turns" && room.status === "lobby" && removed) {
        const activeId = getActiveTurnPlayerId(room);
        if (activeId === removed.playerId) {
          const next = advanceTurnInDB(code);
          if (next) {
            io.to(code).emit("turn:changed", next);
          }
        }
      }
    }
  });
}
