import type { Server, Socket } from "socket.io";
import { getRoom, touchRoom } from "../rooms";
import { db } from "../db";

export function registerResponseHandlers(io: Server, socket: Socket) {
  socket.on("response:submit", ({ questionId, value }: { questionId: string; value: string }) => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = getRoom(code);
    if (!room || room.status !== "question") {
      socket.emit("error", { message: "no_active_question" });
      return;
    }

    const q = db.query("SELECT * FROM questions WHERE id = ? AND room_id = ?").get(questionId, code) as any;
    if (!q) {
      socket.emit("error", { message: "question_not_found" });
      return;
    }

    const player = db.query("SELECT id FROM players WHERE socket_id = ?").get(socket.id) as { id: string } | null;
    if (!player) return;

    // One response per player per question
    const existing = db.query(
      "SELECT id FROM responses WHERE question_id = ? AND player_id = ?"
    ).get(questionId, player.id);
    if (existing) {
      socket.emit("error", { message: "already_submitted" });
      return;
    }

    db.run(
      "INSERT INTO responses (id, question_id, player_id, value, submitted_at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), questionId, player.id, value, Date.now()]
    );
    touchRoom(code);

    if (q.type === "vote") {
      const options: string[] = JSON.parse(q.options ?? "[]");
      const counts: Record<string, number> = {};
      for (const opt of options) counts[opt] = 0;
      const rows = db.query(
        "SELECT value, COUNT(*) as count FROM responses WHERE question_id = ? GROUP BY value"
      ).all(questionId) as { value: string; count: number }[];
      for (const row of rows) counts[row.value] = row.count;
      io.to(code).emit("response:update", { counts, responses: [] });
    } else {
      const responses = db.query(
        "SELECT value FROM responses WHERE question_id = ? ORDER BY submitted_at ASC"
      ).all(questionId) as { value: string }[];
      io.to(code).emit("response:update", { counts: {}, responses: responses.map((r) => r.value) });
    }
  });
}
