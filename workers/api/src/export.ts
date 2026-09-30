import { margin } from "@settleit/core";
import type { Outcome } from "@settleit/core";
import { dateKeyOf } from "@settleit/core";

/** Room outbox events, exported to D1 exactly once via export_receipt. */
export type RoomExportEvent =
  | {
      kind: "round_completed";
      eventId: string;
      roomCode: string;
      roundId: string;
      seq: number;
      versionId: string | null;
      variant: boolean;
      final: Outcome;
      changedMinds: number;
      bothVotes: number;
      /** actorId -> optionId for canonical (non-variant) rounds; empty for variants. */
      finalVotes: Record<string, string>;
      completedAt: number;
      isTest: boolean;
    }
  | {
      kind: "room_status";
      eventId: string;
      roomCode: string;
      seq: number;
      status: string;
      roundsCompleted: number;
      at: number;
      isTest: boolean;
    };

/**
 * Apply one export event to D1 in a single batch. The receipt row makes the
 * whole batch idempotent: a repeated event no-ops. Contributions keep the
 * newest value by timestamp so a stale replay can never overwrite a newer vote.
 */
export async function applyExport(db: D1Database, ev: RoomExportEvent): Promise<"applied" | "duplicate"> {
  const existing = await db.prepare("SELECT 1 AS x FROM export_receipt WHERE event_id = ?").bind(ev.eventId).first();
  if (existing) return "duplicate";
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO export_receipt (event_id, room_code, seq, kind, applied_at) VALUES (?, ?, ?, ?, ?)")
      .bind(ev.eventId, ev.roomCode, ev.seq, ev.kind, now),
  ];
  if (ev.kind === "round_completed") {
    stmts.push(
      db.prepare(
        "INSERT OR IGNORE INTO round_outcome (event_id, room_code, round_id, version_id, variant, outcome_kind, total, margin, changed_minds, both_votes, completed_at, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(ev.eventId, ev.roomCode, ev.roundId, ev.versionId, ev.variant ? 1 : 0, ev.final.kind, ev.final.total, margin(ev.final), ev.changedMinds, ev.bothVotes, ev.completedAt, ev.isTest ? 1 : 0),
    );
    if (!ev.variant && ev.versionId) {
      for (const [actorId, optionId] of Object.entries(ev.finalVotes)) {
        stmts.push(
          db.prepare(
            `INSERT INTO contribution (actor_id, version_id, option_id, source, source_ref, updated_at, is_test)
             VALUES (?, ?, ?, 'group', ?, ?, ?)
             ON CONFLICT(actor_id, version_id) DO UPDATE SET
               option_id = excluded.option_id, source = excluded.source, source_ref = excluded.source_ref,
               updated_at = excluded.updated_at, is_test = excluded.is_test
             WHERE excluded.updated_at > contribution.updated_at`,
          ).bind(actorId, ev.versionId, optionId, `room:${ev.roomCode}:${ev.roundId}`, ev.completedAt, ev.isTest ? 1 : 0),
        );
      }
    }
    const day = dateKeyOf(ev.completedAt);
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, 'round_completed', NULL, ?, 'group', ?, 'server', ?, ?, ?, ?)")
        .bind(`${ev.eventId}:rc`, ev.roomCode, ev.versionId, ev.isTest ? 1 : 0, ev.completedAt, day, JSON.stringify({ total: ev.final.total, kind: ev.final.kind })),
    );
    for (const actorId of Object.keys(ev.finalVotes)) {
      stmts.push(
        db.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, 'vote_accepted', ?, ?, 'group', ?, 'server', ?, ?, ?, NULL)")
          .bind(`${ev.eventId}:${actorId}`, actorId, ev.roomCode, ev.versionId, ev.isTest ? 1 : 0, ev.completedAt, day),
      );
    }
    stmts.push(
      db.prepare("UPDATE room_registry SET last_activity_at = ?, rounds_completed = rounds_completed + 1, last_export_at = ?, last_export_error = NULL WHERE code = ?")
        .bind(ev.completedAt, now, ev.roomCode),
    );
  } else {
    stmts.push(
      db.prepare(
        `INSERT INTO room_registry (code, created_at, last_activity_at, status, rounds_completed, pending_exports, last_export_at, is_test)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(code) DO UPDATE SET last_activity_at = excluded.last_activity_at, status = excluded.status,
           rounds_completed = MAX(room_registry.rounds_completed, excluded.rounds_completed), last_export_at = excluded.last_export_at, last_export_error = NULL`,
      ).bind(ev.roomCode, ev.at, ev.at, ev.status, ev.roundsCompleted, now, ev.isTest ? 1 : 0),
    );
  }
  await db.batch(stmts);
  return "applied";
}

export async function recordExportFailure(db: D1Database, roomCode: string, pending: number, error: string): Promise<void> {
  try {
    await db.prepare("UPDATE room_registry SET pending_exports = ?, last_export_error = ? WHERE code = ?")
      .bind(pending, error.slice(0, 200), roomCode).run();
  } catch {
    // D1 is the thing that is failing; nothing more to do here.
  }
}
