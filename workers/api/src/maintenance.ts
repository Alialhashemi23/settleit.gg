import { dailyPeriodFor, dateKeyOf } from "@settleit/core";
import { effectiveStatus, ensureChallenge, settleDaily, type ChallengeRow } from "./daily";
import type { Env } from "./env";

/**
 * Scheduled upkeep. Every step is idempotent and also reachable from request
 * handling, so a missed cron tick only delays work.
 */
export async function runMaintenance(env: Env, now = Date.now()): Promise<{ scheduled: string[]; settled: string[]; swept: number }> {
  const scheduled: string[] = [];
  const settled: string[] = [];

  // Prepare today and the next three days.
  const today = dailyPeriodFor(now);
  for (let i = 0; i < 4; i++) {
    const key = dateKeyOf(today.opensAt + i * 86_400_000);
    const c = await ensureChallenge(env, key, now).catch(() => null);
    if (c) scheduled.push(key);
  }

  // Settle anything closed but not yet settled.
  const closed = await env.DB.prepare("SELECT * FROM daily_challenge WHERE status NOT IN ('settled','void') AND closes_at <= ? ORDER BY date_key LIMIT 10").bind(now).all<ChallengeRow>();
  for (const c of closed.results) {
    if (effectiveStatus(c, now) !== "closed") continue;
    try { await settleDaily(env, c.date_key, now); settled.push(c.date_key); } catch (e) { console.warn("settle failed", c.date_key, e); }
  }

  // Ask rooms with stalled exports to retry.
  const stalled = await env.DB.prepare("SELECT code FROM room_registry WHERE pending_exports > 0 AND last_activity_at >= ? LIMIT 50").bind(now - 3 * 86_400_000).all<{ code: string }>();
  let swept = 0;
  for (const r of stalled.results) {
    try {
      await env.ROOMS.get(env.ROOMS.idFromName(r.code)).fetch("https://room/export-sweep", { method: "POST" });
      swept++;
    } catch (e) { console.warn("sweep failed", r.code, e); }
  }

  // Retention: raw operational events are kept 30 days.
  await env.DB.prepare("DELETE FROM telemetry_event WHERE at < ?").bind(now - 30 * 86_400_000).run().catch(() => {});
  return { scheduled, settled, swept };
}
