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
    socket.emit("room:joined", { roomCode: code, players: getRoomPlayers(code), playerId });
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
    socket.emit("room:joined", { roomCode: code, players, playerId });
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
    socket.emit("room:joined", { roomCode: code, players, playerId });
    io.to(code).emit("room:updated", { players });
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
