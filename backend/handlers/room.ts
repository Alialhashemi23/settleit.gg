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
} from "../rooms";
import { db } from "../db";

// Track host reconnect timers: roomCode → timer
const reconnectTimers = new Map<string, Timer>();

export function registerRoomHandlers(io: Server, socket: Socket) {
  socket.on("room:create", ({ nickname }: { nickname: string }) => {
    const code = createRoom(socket.id);
    addPlayer(code, socket.id, nickname);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    socket.emit("room:created", { roomCode: code });
    socket.emit("room:joined", { roomCode: code, players: getRoomPlayers(code) });
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

    addPlayer(code, socket.id, nickname);
    touchRoom(code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = false;

    const players = getRoomPlayers(code);
    socket.emit("room:joined", { roomCode: code, players });
    socket.to(code).emit("room:updated", { players });

    // If there's an active question, send it to the joining player
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

    // Clear the pending timer
    const timer = reconnectTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(code);
    }

    db.run("UPDATE rooms SET host_socket_id = ?, status = 'lobby', host_reconnect_deadline = NULL WHERE id = ?", [socket.id, code]);
    addPlayer(code, socket.id, nickname);
    touchRoom(code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;

    const players = getRoomPlayers(code);
    socket.emit("room:joined", { roomCode: code, players });
    io.to(code).emit("room:updated", { players });
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

    removePlayerBySocket(socket.id);
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
    }
  });
}
