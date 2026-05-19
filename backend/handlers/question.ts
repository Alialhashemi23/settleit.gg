import type { Server, Socket } from "socket.io";
import { getRoom, getRoomPlayers, touchRoom } from "../rooms";
import { db } from "../db";

export function registerQuestionHandlers(io: Server, socket: Socket) {
  socket.on(
    "question:ask",
    ({ type, prompt, options }: { type: "vote" | "freetext"; prompt: string; options?: string[] }) => {
      const code = socket.data.roomCode;
      if (!code) return;
      const room = getRoom(code);
      if (!room || room.host_socket_id !== socket.id) {
        socket.emit("error", { message: "not_authorized" });
        return;
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      db.run(
        "INSERT INTO questions (id, room_id, type, prompt, options, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, code, type, prompt, options ? JSON.stringify(options) : null, now]
      );
      db.run("UPDATE rooms SET status = 'question', last_active = ? WHERE id = ?", [now, code]);

      const question = { id, type, prompt, options: options ?? null };
      io.to(code).emit("question:new", { question });
    }
  );

  socket.on("question:next", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.host_socket_id !== socket.id) {
      socket.emit("error", { message: "not_authorized" });
      return;
    }

    const q = db.query(
      "SELECT * FROM questions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(code) as any;

    if (!q) return;

    let final: any;
    if (q.type === "vote") {
      const options: string[] = JSON.parse(q.options ?? "[]");
      const counts: Record<string, number> = {};
      for (const opt of options) counts[opt] = 0;
      const rows = db.query(
        "SELECT value, COUNT(*) as count FROM responses WHERE question_id = ? GROUP BY value"
      ).all(q.id) as { value: string; count: number }[];
      for (const row of rows) counts[row.value] = row.count;
      final = { counts };
    } else {
      const responses = db.query(
        "SELECT value FROM responses WHERE question_id = ? ORDER BY submitted_at ASC"
      ).all(q.id) as { value: string }[];
      final = { responses: responses.map((r) => r.value) };
    }

    db.run("UPDATE rooms SET status = 'lobby', last_active = ? WHERE id = ?", [Date.now(), code]);
    io.to(code).emit("question:ended", { final });
    touchRoom(code);
  });
}
