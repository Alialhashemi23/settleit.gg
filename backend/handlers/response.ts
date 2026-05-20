import type { Server, Socket } from "socket.io";
import { getRoom, getRoomPlayers, touchRoom } from "../rooms";
import { db } from "../db";
import { checkConsensus, settleQuestion, startCountdown, cancelCountdown, hasActiveCountdown } from "../game";

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

    // Validate value is one of the question's options
    const options: string[] = JSON.parse(q.options ?? "[]");
    if (!options.includes(value)) {
      socket.emit("error", { message: "invalid_option" });
      return;
    }

    // Upsert: allow vote changes
    const existing = db.query(
      "SELECT id FROM responses WHERE question_id = ? AND player_id = ?"
    ).get(questionId, player.id);

    if (existing) {
      db.run(
        "UPDATE responses SET value = ?, submitted_at = ? WHERE question_id = ? AND player_id = ?",
        [value, Date.now(), questionId, player.id]
      );
    } else {
      db.run(
        "INSERT INTO responses (id, question_id, player_id, value, submitted_at) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), questionId, player.id, value, Date.now()]
      );
    }

    touchRoom(code);

    // Broadcast updated votes with player names
    const votes = db.query(`
      SELECT r.value, p.id as playerId, p.nickname
      FROM responses r
      JOIN players p ON r.player_id = p.id
      WHERE r.question_id = ?
      ORDER BY r.submitted_at ASC
    `).all(questionId) as { value: string; playerId: string; nickname: string }[];

    const players = getRoomPlayers(code);
    io.to(code).emit("response:update", { votes, totalPlayers: players.length });

    // Consensus check
    const consensus = checkConsensus(votes, players.length);

    if (consensus.type === "full") {
      cancelCountdown(io, code);
      settleQuestion(io, code);
    } else if (consensus.type === "soft") {
      if (!hasActiveCountdown(code)) {
        startCountdown(io, code, consensus.leadingOption!);
      }
    } else {
      // Consensus broken — cancel countdown if running
      cancelCountdown(io, code);
    }
  });
}
