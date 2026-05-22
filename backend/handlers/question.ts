import type { Server, Socket } from "socket.io";
import { getRoom, touchRoom, getActiveTurnPlayerId } from "../rooms";
import { db } from "../db";
import { settleQuestion, cancelCountdown } from "../game";

export function registerQuestionHandlers(io: Server, socket: Socket) {
  socket.on(
    "question:ask",
    ({ prompt, options, presetId }: { prompt: string; options: string[]; presetId?: string }) => {
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

      const opts = (options ?? []).filter(o => o.trim());
      if (!prompt.trim()) {
        socket.emit("error", { message: "invalid_question" });
        return;
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      db.run(
        "INSERT INTO questions (id, room_id, type, prompt, options, preset_id, created_at) VALUES (?, ?, 'vote', ?, ?, ?, ?)",
        [id, code, prompt.trim(), JSON.stringify(opts), presetId ?? null, now]
      );
      db.run("UPDATE rooms SET status = 'question', last_active = ? WHERE id = ?", [now, code]);

      io.to(code).emit("question:new", {
        question: { id, type: "vote", prompt: prompt.trim(), options: opts },
        presetId: presetId ?? null,
      });
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

    const activeQ = db.query("SELECT options FROM questions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1").get(code) as { options: string } | null;
    const activeOpts: string[] = activeQ ? JSON.parse(activeQ.options ?? "[]") : [];
    if (activeOpts.length === 0) {
      socket.emit("error", { message: "no_options_to_settle" });
      return;
    }

    cancelCountdown(io, code);
    settleQuestion(io, code);
  });
}
