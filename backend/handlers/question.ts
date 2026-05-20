import type { Server, Socket } from "socket.io";
import { getRoom, touchRoom, getActiveTurnPlayerId } from "../rooms";
import { db } from "../db";
import { settleQuestion, cancelCountdown } from "../game";

export function registerQuestionHandlers(io: Server, socket: Socket) {
  socket.on(
    "question:ask",
    ({ prompt, options }: { prompt: string; options: string[] }) => {
      const code = socket.data.roomCode;
      if (!code) return;
      const room = getRoom(code);
      if (!room) return;

      // Only active player can ask
      const activeId = getActiveTurnPlayerId(room);
      if (socket.data.playerId !== activeId) {
        socket.emit("error", { message: "not_authorized" });
        return;
      }

      const opts = options.filter(o => o.trim());
      if (!prompt.trim() || opts.length < 2) {
        socket.emit("error", { message: "invalid_question" });
        return;
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      db.run(
        "INSERT INTO questions (id, room_id, type, prompt, options, created_at) VALUES (?, ?, 'vote', ?, ?, ?)",
        [id, code, prompt.trim(), JSON.stringify(opts), now]
      );
      db.run("UPDATE rooms SET status = 'question', last_active = ? WHERE id = ?", [now, code]);

      io.to(code).emit("question:new", { question: { id, type: "vote", prompt: prompt.trim(), options: opts } });
    }
  );

  // Force-settle: only the active player (asker) or host as override
  socket.on("question:next", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    const activeId = getActiveTurnPlayerId(room);
    const isActivePlayer = socket.data.playerId === activeId;
    const isHost = room.host_socket_id === socket.id;

    if (!isActivePlayer && !isHost) {
      socket.emit("error", { message: "not_authorized" });
      return;
    }

    cancelCountdown(io, code);
    settleQuestion(io, code);
  });
}
