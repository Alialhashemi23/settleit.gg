import type { Server } from "socket.io";
import { db } from "./db";
import { getRoom, getRoomPlayers, touchRoom, advanceTurnInDB } from "./rooms";

// Active countdown timers per room
const countdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getSoftThreshold(playerCount: number): number {
  if (playerCount <= 2) return playerCount;
  return playerCount - 1;
}

export function checkConsensus(
  votes: { value: string }[],
  totalPlayers: number
): { type: "full" | "soft" | "none"; leadingOption?: string } {
  if (votes.length === 0) return { type: "none" };

  const counts: Record<string, number> = {};
  for (const v of votes) counts[v.value] = (counts[v.value] ?? 0) + 1;

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const [leadingOption, leadingCount] = sorted[0];

  if (leadingCount === totalPlayers) return { type: "full", leadingOption };

  if (votes.length === totalPlayers && leadingCount >= getSoftThreshold(totalPlayers)) {
    return { type: "soft", leadingOption };
  }

  return { type: "none" };
}

export function settleQuestion(io: Server, code: string) {
  const q = db.query(
    "SELECT * FROM questions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(code) as any;
  if (!q) return;

  const options: string[] = JSON.parse(q.options ?? "[]");
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt] = 0;
  const rows = db.query(
    "SELECT value, COUNT(*) as count FROM responses WHERE question_id = ? GROUP BY value"
  ).all(q.id) as { value: string; count: number }[];
  for (const row of rows) counts[row.value] = row.count;

  const settledOption = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  db.run("UPDATE rooms SET status = 'lobby', last_active = ? WHERE id = ?", [Date.now(), code]);
  io.to(code).emit("question:ended", { final: { counts }, settledOption });
  touchRoom(code);

  const next = advanceTurnInDB(code);
  if (next) io.to(code).emit("turn:changed", next);
}

export function startCountdown(io: Server, code: string, leadingOption: string) {
  if (countdownTimers.has(code)) return;
  const deadline = Date.now() + 10000;
  io.to(code).emit("question:countdown", { deadline, leadingOption });

  const timer = setTimeout(() => {
    countdownTimers.delete(code);
    settleQuestion(io, code);
  }, 10000);

  countdownTimers.set(code, timer);
}

export function cancelCountdown(io: Server, code: string) {
  const timer = countdownTimers.get(code);
  if (!timer) return;
  clearTimeout(timer);
  countdownTimers.delete(code);
  io.to(code).emit("question:countdown:cancelled");
}

export function hasActiveCountdown(code: string): boolean {
  return countdownTimers.has(code);
}
