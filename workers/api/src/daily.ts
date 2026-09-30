import { DAILY, baselineShare, dailyPeriodFor, dailyPeriodForDateKey, dateKeyOf, isValidPrediction, scorePrediction, selectDailyQuestion } from "@settleit/core";
import { requireSession, withSessionCookie, type Session } from "./auth";
import type { Env } from "./env";
import { loadApprovedLibrary, loadVersion } from "./library";
import { isTestTraffic } from "./rooms";
import { HttpError, assertSameOrigin, json, newId, randomToken, readJson } from "./util";

export interface ChallengeRow {
  date_key: string; version_id: string; opens_at: number; closes_at: number; status: string; result_version: number; scheduled_by: string; created_at: number;
}
interface AttemptRow { date_key: string; actor_id: string; option_id: string; prediction: number; submitted_at: number; eligible: number; is_test: number }
interface ResultRow { date_key: string; result_version: number; counts: string; total: number; graded: number; cutoff_at: number; finalized_at: number; note: string | null }
interface GradeRow { baseline_share: number | null; score: number | null; status: string; result_version: number }

function testFilter(env: Env): string {
  return env.ENVIRONMENT === "production" ? " AND is_test = 0" : "";
}

/** Create the challenge row for a date if it is missing. Idempotent; safe from requests and cron. */
export async function ensureChallenge(env: Env, dateKey: string, now: number): Promise<ChallengeRow | null> {
  const existing = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(dateKey).first<ChallengeRow>();
  if (existing) return existing;
  const { questions } = await loadApprovedLibrary(env);
  const candidates = questions.filter((q) => !q.spoiler);
  const cutoffKey = dateKeyOf(dailyPeriodForDateKey(dateKey).opensAt - DAILY.noRepeatDays * 86_400_000);
  const recent = await env.DB.prepare("SELECT version_id, date_key FROM daily_challenge WHERE date_key >= ? AND status != 'void'").bind(cutoffKey).all<{ version_id: string; date_key: string }>();
  const recentlyUsed = new Map<string, string>();
  for (const r of recent.results) {
    const qid = r.version_id.replace(/v\d+$/, "");
    const prev = recentlyUsed.get(qid);
    if (!prev || prev < r.date_key) recentlyUsed.set(qid, r.date_key);
  }
  const pick = selectDailyQuestion(dateKey, candidates, recentlyUsed);
  if (!pick) return null;
  const period = dailyPeriodForDateKey(dateKey);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO daily_challenge (date_key, version_id, opens_at, closes_at, status, result_version, scheduled_by, created_at) VALUES (?, ?, ?, ?, 'scheduled', 0, 'auto', ?)",
  ).bind(dateKey, pick.versionId, period.opensAt, period.closesAt, now).run();
  return env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(dateKey).first<ChallengeRow>();
}

export function effectiveStatus(c: ChallengeRow, now: number): "scheduled" | "open" | "closed" | "settled" | "void" {
  if (c.status === "void") return "void";
  if (c.status === "settled") return "settled";
  if (now < c.opens_at) return "scheduled";
  if (now < c.closes_at) return "open";
  return "closed";
}

/**
 * Finalize a closed day once per result version. Reads the eligible cohort at a
 * recorded cutoff, writes counts and every grade in one batch. Repeated calls
 * for an already-settled day are no-ops unless `correction` is set.
 */
export async function settleDaily(env: Env, dateKey: string, now: number, correction: string | null = null): Promise<{ status: string; resultVersion: number }> {
  const c = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(dateKey).first<ChallengeRow>();
  if (!c) throw new HttpError(404, "no_challenge");
  const status = effectiveStatus(c, now);
  if (status === "void") return { status, resultVersion: c.result_version };
  if (status === "settled" && !correction) return { status, resultVersion: c.result_version };
  if (status === "open" || status === "scheduled") throw new HttpError(409, "not_closed", "The day has not closed yet.");
  const attempts = await env.DB.prepare(`SELECT * FROM daily_attempt WHERE date_key = ? AND eligible = 1${testFilter(env)}`).bind(dateKey).all<AttemptRow>();
  const counts: Record<string, number> = {};
  const question = await loadVersion(env, c.version_id);
  for (const o of question?.options ?? []) counts[o.id] = 0;
  for (const a of attempts.results) counts[a.option_id] = (counts[a.option_id] ?? 0) + 1;
  const total = attempts.results.length;
  const graded = total >= DAILY.minSample;
  const resultVersion = c.result_version + 1;
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO daily_result (date_key, result_version, counts, total, graded, cutoff_at, finalized_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(dateKey, resultVersion, JSON.stringify(counts), total, graded ? 1 : 0, c.closes_at, now, correction),
  ];
  for (const a of attempts.results) {
    const share = graded ? baselineShare(counts, a.option_id, DAILY.minOthersToGrade) : null;
    const score = share === null ? null : scorePrediction(a.prediction, share);
    stmts.push(
      env.DB.prepare("INSERT OR REPLACE INTO daily_grade (date_key, actor_id, result_version, baseline_share, score, status) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(dateKey, a.actor_id, resultVersion, share, score, share === null ? "ungraded" : "graded"),
    );
    stmts.push(
      env.DB.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, 'daily_graded', ?, NULL, 'daily', ?, 'server', ?, ?, ?, ?)")
        .bind(`dg:${dateKey}:${a.actor_id}:${resultVersion}`, a.actor_id, c.version_id, a.is_test, now, dateKeyOf(now), JSON.stringify({ graded: share !== null })),
    );
  }
  stmts.push(env.DB.prepare("UPDATE daily_challenge SET status = 'settled', result_version = ? WHERE date_key = ?").bind(resultVersion, dateKey));
  await env.DB.batch(stmts);
  return { status: "settled", resultVersion };
}

async function viewFor(env: Env, c: ChallengeRow, session: Session, now: number) {
  const status = effectiveStatus(c, now);
  const question = await loadVersion(env, c.version_id);
  const mine = await env.DB.prepare("SELECT * FROM daily_attempt WHERE date_key = ? AND actor_id = ?").bind(c.date_key, session.actorId).first<AttemptRow>();
  const sampleRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM daily_attempt WHERE date_key = ? AND eligible = 1${testFilter(env)}`).bind(c.date_key).first<{ n: number }>();
  const sample = sampleRow?.n ?? 0;
  let split: { counts: Record<string, number>; total: number; provisional: boolean } | null = null;
  let grade: { status: string; score: number | null; baselineShare: number | null; resultVersion: number } | null = null;
  let finalResult: ResultRow | null = null;
  if (status === "settled" || status === "closed") {
    finalResult = await env.DB.prepare("SELECT * FROM daily_result WHERE date_key = ? AND result_version = ?").bind(c.date_key, c.result_version).first<ResultRow>();
  }
  // Answer-before-comparison is enforced here: no attempt, no numbers.
  if (mine) {
    if (finalResult && finalResult.graded) split = { counts: JSON.parse(finalResult.counts), total: finalResult.total, provisional: false };
    else if (!finalResult && sample >= DAILY.minSample) {
      const rows = await env.DB.prepare(`SELECT option_id, COUNT(*) AS n FROM daily_attempt WHERE date_key = ? AND eligible = 1${testFilter(env)} GROUP BY option_id`).bind(c.date_key).all<{ option_id: string; n: number }>();
      const counts: Record<string, number> = {};
      for (const o of question?.options ?? []) counts[o.id] = 0;
      for (const r of rows.results) counts[r.option_id] = r.n;
      split = { counts, total: sample, provisional: true };
    }
    if (status === "settled") {
      const g = await env.DB.prepare("SELECT baseline_share, score, status, result_version FROM daily_grade WHERE date_key = ? AND actor_id = ? AND result_version = ?").bind(c.date_key, session.actorId, c.result_version).first<GradeRow>();
      grade = g ? { status: g.status, score: g.score, baselineShare: g.baseline_share, resultVersion: g.result_version } : { status: mine.eligible ? "ungraded" : "late", score: null, baselineShare: null, resultVersion: c.result_version };
    }
  }
  return {
    dateKey: c.date_key,
    opensAt: c.opens_at,
    closesAt: c.closes_at,
    status,
    question: question ? { versionId: question.versionId, prompt: question.prompt, options: question.options, topic: question.topic, tags: question.tags } : null,
    myAttempt: mine ? { optionId: mine.option_id, prediction: mine.prediction, submittedAt: mine.submitted_at, eligible: !!mine.eligible } : null,
    sample,
    minSample: DAILY.minSample,
    split,
    grade,
    resultVersion: c.result_version,
    voidReason: status === "void" ? "This question was withdrawn, so the day has no result." : null,
    serverNow: now,
  };
}

export async function handleDaily(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[1] !== "daily") return null;
  const now = Date.now();
  const session = await requireSession(req, env);
  const isTest = isTestTraffic(req, env) ? 1 : 0;

  // GET /api/daily → today's challenge
  if (parts.length === 2 && req.method === "GET") {
    const period = dailyPeriodFor(now);
    const c = await ensureChallenge(env, period.dateKey, now);
    if (!c) return withSessionCookie(json({ dateKey: period.dateKey, status: "none", question: null, serverNow: now }), session);
    return withSessionCookie(json(await viewFor(env, c, session, now)), session);
  }

  // POST /api/daily/submit
  if (parts[2] === "submit" && req.method === "POST") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    const body = await readJson<{ dateKey?: string; optionId?: string; prediction?: number }>(req);
    const dateKey = body.dateKey ?? dailyPeriodFor(now).dateKey;
    const c = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(dateKey).first<ChallengeRow>();
    if (!c) throw new HttpError(404, "no_challenge", "There is no challenge for that day.");
    const status = effectiveStatus(c, now);
    if (status === "scheduled") throw new HttpError(409, "not_open", "That challenge hasn't opened yet.");
    if (status === "void") throw new HttpError(409, "void", "That question was withdrawn.");
    const question = await loadVersion(env, c.version_id);
    if (!question || !question.options.some((o) => o.id === body.optionId)) throw new HttpError(400, "invalid_option", "Pick one of the answers.");
    if (!isValidPrediction(body.prediction)) throw new HttpError(400, "invalid_prediction", "Prediction must be a whole number from 0 to 100.");
    const eligible = status === "open" ? 1 : 0; // late answers unlock comparisons but never join the cohort
    const existing = await env.DB.prepare("SELECT * FROM daily_attempt WHERE date_key = ? AND actor_id = ?").bind(dateKey, session.actorId).first<AttemptRow>();
    if (existing) {
      // Locked: a retry of the same submission is fine; a change is not.
      if (existing.option_id === body.optionId && existing.prediction === body.prediction) {
        return withSessionCookie(json({ ok: true, duplicate: true, view: await viewFor(env, c, session, now) }), session);
      }
      throw new HttpError(409, "already_submitted", "Your answer for this day is locked.");
    }
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO daily_attempt (date_key, actor_id, option_id, prediction, submitted_at, eligible, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(dateKey, session.actorId, body.optionId, body.prediction, now, eligible, isTest),
      env.DB.prepare("INSERT INTO actor (id, kind, created_at, last_seen_at, is_test) VALUES (?, 'guest', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at")
        .bind(session.actorId, now, now, isTest),
      env.DB.prepare(
        `INSERT INTO contribution (actor_id, version_id, option_id, source, source_ref, updated_at, is_test) VALUES (?, ?, ?, 'daily', ?, ?, ?)
         ON CONFLICT(actor_id, version_id) DO UPDATE SET option_id = excluded.option_id, source = excluded.source, source_ref = excluded.source_ref, updated_at = excluded.updated_at, is_test = excluded.is_test
         WHERE excluded.updated_at > contribution.updated_at`,
      ).bind(session.actorId, c.version_id, body.optionId, `daily:${dateKey}`, now, isTest),
      env.DB.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, 'daily_submitted', ?, NULL, 'daily', ?, 'server', ?, ?, ?, ?)")
        .bind(`ds:${dateKey}:${session.actorId}`, session.actorId, c.version_id, isTest, now, dateKeyOf(now), JSON.stringify({ eligible: !!eligible })),
    ]);
    return withSessionCookie(json({ ok: true, duplicate: false, view: await viewFor(env, c, session, now) }), session);
  }

  // GET /api/daily/share/:token
  if (parts[2] === "share" && parts[3] && req.method === "GET") {
    const tok = await env.DB.prepare("SELECT * FROM share_token WHERE token = ? AND revoked = 0").bind(parts[3]).first<{ date_key: string; actor_id: string }>();
    if (!tok) throw new HttpError(404, "share_not_found", "That link is no longer valid.");
    const c = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(tok.date_key).first<ChallengeRow>();
    if (!c) throw new HttpError(404, "no_challenge");
    const view = await viewFor(env, c, session, now);
    const sharerAttempt = await env.DB.prepare("SELECT option_id FROM daily_attempt WHERE date_key = ? AND actor_id = ?").bind(tok.date_key, tok.actor_id).first<{ option_id: string }>();
    // The sharer's choice is withheld until the viewer has answered the same question (server-side, not just hidden).
    const revealed = view.myAttempt !== null;
    return withSessionCookie(json({ ...view, share: { isOwner: tok.actor_id === session.actorId, revealed, sharerOptionId: revealed ? sharerAttempt?.option_id ?? null : null } }), session);
  }

  // POST /api/daily/:dateKey/share  |  DELETE /api/daily/:dateKey/share/:token
  if (parts[3] === "share" && parts[2]) {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    const dateKey = parts[2];
    if (req.method === "POST") {
      const mine = await env.DB.prepare("SELECT 1 AS x FROM daily_attempt WHERE date_key = ? AND actor_id = ?").bind(dateKey, session.actorId).first();
      if (!mine) throw new HttpError(409, "answer_first", "Answer the question before sharing it.");
      const token = randomToken(18);
      await env.DB.prepare("INSERT INTO share_token (token, date_key, actor_id, created_at, revoked) VALUES (?, ?, ?, ?, 0)").bind(token, dateKey, session.actorId, now).run();
      return withSessionCookie(json({ token }), session);
    }
    if (req.method === "DELETE" && parts[4]) {
      await env.DB.prepare("UPDATE share_token SET revoked = 1 WHERE token = ? AND actor_id = ?").bind(parts[4], session.actorId).run();
      return withSessionCookie(json({ ok: true }), session);
    }
  }

  // GET /api/daily/:dateKey → a past day's result (settles it on demand if overdue)
  if (parts.length === 3 && req.method === "GET" && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]!)) {
    let c = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(parts[2]).first<ChallengeRow>();
    if (!c) throw new HttpError(404, "no_challenge", "No challenge ran that day.");
    if (effectiveStatus(c, now) === "closed") {
      ctx.waitUntil(settleDaily(env, c.date_key, now).catch((e) => console.warn("settle failed", e)));
      await settleDaily(env, c.date_key, now).catch(() => {});
      c = (await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(parts[2]).first<ChallengeRow>()) ?? c;
    }
    return withSessionCookie(json(await viewFor(env, c, session, now)), session);
  }

  // GET /api/daily/history → the viewer's own attempts
  if (parts[2] === "history" && req.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT a.date_key, a.option_id, a.prediction, a.submitted_at, a.eligible, g.score, g.status AS grade_status, c.status AS challenge_status, c.result_version, v.prompt
       FROM daily_attempt a JOIN daily_challenge c ON c.date_key = a.date_key JOIN question_version v ON v.version_id = c.version_id
       LEFT JOIN daily_grade g ON g.date_key = a.date_key AND g.actor_id = a.actor_id AND g.result_version = c.result_version
       WHERE a.actor_id = ? ORDER BY a.date_key DESC LIMIT 60`,
    ).bind(session.actorId).all();
    return withSessionCookie(json({ attempts: rows.results }), session);
  }

  // DELETE /api/daily/history → guest history reset (attempts stay in cohorts, unlinked from this browser)
  if (parts[2] === "history" && req.method === "DELETE") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    const ghost = newId("x_");
    await env.DB.batch([
      env.DB.prepare("UPDATE daily_attempt SET actor_id = ? WHERE actor_id = ?").bind(ghost, session.actorId),
      env.DB.prepare("UPDATE daily_grade SET actor_id = ? WHERE actor_id = ?").bind(ghost, session.actorId),
      env.DB.prepare("UPDATE share_token SET revoked = 1 WHERE actor_id = ?").bind(session.actorId),
      env.DB.prepare("DELETE FROM contribution WHERE actor_id = ?").bind(session.actorId),
    ]);
    return withSessionCookie(json({ ok: true }), session);
  }

  return null;
}
