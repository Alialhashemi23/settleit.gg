import { PUBLIC_STATS, dailyPeriodFor, DAILY } from "@settleit/core";
import type { Env } from "./env";
import { effectiveStatus, type ChallengeRow } from "./daily";
import { HttpError, json } from "./util";

const WINDOW_DAYS = 30;

function testFilter(env: Env, alias = ""): string {
  return env.ENVIRONMENT === "production" ? ` AND ${alias}is_test = 0` : "";
}

function withPercent(counts: Record<string, number>, total: number, minSample: number) {
  const ok = total >= minSample;
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, { count: n, percent: ok ? Math.round((n / total) * 1000) / 10 : null }]));
}

function cached(data: unknown, seconds = 60): Response {
  return json(data, { headers: { "cache-control": `public, max-age=${seconds}` } });
}

export async function homeCards(env: Env, now: number) {
  const since = now - WINDOW_DAYS * 86_400_000;
  const window = { days: WINDOW_DAYS, since, until: now };

  // Most debated: most eligible contributions in the window.
  const debated = await env.DB.prepare(
    `SELECT c.version_id, v.prompt, COUNT(*) AS total FROM contribution c JOIN question_version v ON v.version_id = c.version_id
     WHERE c.updated_at >= ?${testFilter(env, "c.")} GROUP BY c.version_id ORDER BY total DESC, c.version_id LIMIT 5`,
  ).bind(since).all<{ version_id: string; prompt: string; total: number }>();

  // Closest calls: top two options within 10 points, above the sample threshold.
  const per = await env.DB.prepare(
    `SELECT c.version_id, v.prompt, c.option_id, COUNT(*) AS n FROM contribution c JOIN question_version v ON v.version_id = c.version_id
     WHERE c.updated_at >= ?${testFilter(env, "c.")} GROUP BY c.version_id, c.option_id`,
  ).bind(since).all<{ version_id: string; prompt: string; option_id: string; n: number }>();
  const byVersion = new Map<string, { prompt: string; counts: Record<string, number>; total: number }>();
  for (const r of per.results) {
    const e = byVersion.get(r.version_id) ?? { prompt: r.prompt, counts: {}, total: 0 };
    e.counts[r.option_id] = r.n;
    e.total += r.n;
    byVersion.set(r.version_id, e);
  }
  const closest = [...byVersion.entries()]
    .filter(([, e]) => e.total >= PUBLIC_STATS.minSample)
    .map(([versionId, e]) => {
      const sorted = Object.values(e.counts).sort((a, b) => b - a);
      const gap = ((sorted[0] ?? 0) - (sorted[1] ?? 0)) / e.total * 100;
      return { versionId, prompt: e.prompt, total: e.total, gapPoints: Math.round(gap * 10) / 10 };
    })
    .filter((x) => x.gapPoints <= 10)
    .sort((a, b) => a.gapPoints - b.gapPoints)
    .slice(0, 5);

  // Changed minds: among group rounds with a revote, share of voters who switched.
  const cm = await env.DB.prepare(
    `SELECT COALESCE(SUM(changed_minds), 0) AS changed, COALESCE(SUM(both_votes), 0) AS both, COUNT(*) AS rounds FROM round_outcome
     WHERE completed_at >= ? AND both_votes > 0${testFilter(env)}`,
  ).bind(since).first<{ changed: number; both: number; rounds: number }>();
  const changedMinds = cm && cm.both >= PUBLIC_STATS.minSample
    ? { changed: cm.changed, both: cm.both, rounds: cm.rounds, percent: Math.round((cm.changed / cm.both) * 1000) / 10 }
    : { changed: cm?.changed ?? 0, both: cm?.both ?? 0, rounds: cm?.rounds ?? 0, percent: null };

  // Today's split, provisional, only above threshold.
  const period = dailyPeriodFor(now);
  const today = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(period.dateKey).first<ChallengeRow>();
  let todaysSplit: null | { dateKey: string; prompt: string; total: number; options: Record<string, { count: number; percent: number | null }>; provisional: boolean } = null;
  if (today && effectiveStatus(today, now) === "open") {
    const rows = await env.DB.prepare(`SELECT option_id, COUNT(*) AS n FROM daily_attempt WHERE date_key = ? AND eligible = 1${testFilter(env)} GROUP BY option_id`).bind(period.dateKey).all<{ option_id: string; n: number }>();
    const total = rows.results.reduce((s, r) => s + r.n, 0);
    if (total >= DAILY.minSample) {
      const q = await env.DB.prepare("SELECT prompt FROM question_version WHERE version_id = ?").bind(today.version_id).first<{ prompt: string }>();
      todaysSplit = { dateKey: period.dateKey, prompt: q?.prompt ?? "", total, options: withPercent(Object.fromEntries(rows.results.map((r) => [r.option_id, r.n])), total, DAILY.minSample), provisional: true };
    }
  }

  const featured = await env.DB.prepare("SELECT f.slot, f.version_id, f.note, v.prompt FROM featured f LEFT JOIN question_version v ON v.version_id = f.version_id").all<{ slot: string; version_id: string | null; note: string | null; prompt: string | null }>();

  return {
    generatedAt: now,
    window,
    minSample: PUBLIC_STATS.minSample,
    mostDebated: debated.results.map((r) => ({ versionId: r.version_id, prompt: r.prompt, total: r.total })),
    closestCalls: closest,
    changedMinds,
    todaysSplit,
    featured: featured.results.filter((f) => f.version_id),
  };
}

export async function handleStats(req: Request, env: Env, url: URL): Promise<Response | null> {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[1] !== "stats" || req.method !== "GET") return null;
  const now = Date.now();

  if (parts[2] === "home") return cached(await homeCards(env, now));

  if (parts[2] === "topics" && !parts[3]) {
    const since = now - WINDOW_DAYS * 86_400_000;
    const rows = await env.DB.prepare(
      `SELECT c.version_id, v.prompt, q.topic, COUNT(*) AS total FROM contribution c
       JOIN question_version v ON v.version_id = c.version_id JOIN question q ON q.id = v.question_id
       WHERE c.updated_at >= ?${testFilter(env, "c.")} GROUP BY c.version_id ORDER BY total DESC, c.version_id LIMIT 50`,
    ).bind(since).all<{ version_id: string; prompt: string; topic: string | null; total: number }>();
    return cached({ generatedAt: now, window: { days: WINDOW_DAYS, since, until: now }, minSample: PUBLIC_STATS.minSample,
      topics: rows.results.map((r) => ({ versionId: r.version_id, prompt: r.prompt, topic: r.topic, total: r.total, published: r.total >= PUBLIC_STATS.minSample })) });
  }

  if (parts[2] === "topics" && parts[3]) {
    const versionId = parts[3];
    const v = await env.DB.prepare(
      "SELECT v.version_id, v.question_id, v.version, v.prompt, v.options, q.topic, q.tags, q.status FROM question_version v JOIN question q ON q.id = v.question_id WHERE v.version_id = ?",
    ).bind(versionId).first<{ version_id: string; question_id: string; version: number; prompt: string; options: string; topic: string | null; tags: string; status: string }>();
    if (!v) throw new HttpError(404, "not_found", "No such question.");
    const options = JSON.parse(v.options) as { id: string; text: string }[];
    const all = await env.DB.prepare(`SELECT option_id, source, COUNT(*) AS n FROM contribution WHERE version_id = ?${testFilter(env)} GROUP BY option_id, source`).bind(versionId).all<{ option_id: string; source: string; n: number }>();
    const counts: Record<string, number> = Object.fromEntries(options.map((o) => [o.id, 0]));
    const bySource: Record<string, number> = { group: 0, daily: 0 };
    let total = 0;
    for (const r of all.results) { counts[r.option_id] = (counts[r.option_id] ?? 0) + r.n; bySource[r.source] = (bySource[r.source] ?? 0) + r.n; total += r.n; }
    const rounds = await env.DB.prepare(`SELECT COUNT(*) AS rounds, COALESCE(AVG(total), 0) AS avg_voters, COALESCE(SUM(changed_minds), 0) AS changed, COALESCE(SUM(both_votes), 0) AS both, MIN(completed_at) AS first_at, MAX(completed_at) AS last_at FROM round_outcome WHERE version_id = ?${testFilter(env)}`).bind(versionId).first<{ rounds: number; avg_voters: number; changed: number; both: number; first_at: number | null; last_at: number | null }>();
    const versions = await env.DB.prepare("SELECT version_id, version, prompt, note FROM question_version WHERE question_id = ? ORDER BY version").bind(v.question_id).all();
    const dailies = await env.DB.prepare("SELECT date_key, status, result_version FROM daily_challenge WHERE version_id = ? ORDER BY date_key DESC LIMIT 5").bind(versionId).all();
    return cached({
      generatedAt: now,
      versionId, questionId: v.question_id, version: v.version, prompt: v.prompt, topic: v.topic, tags: JSON.parse(v.tags), status: v.status,
      total, minSample: PUBLIC_STATS.minSample, published: total >= PUBLIC_STATS.minSample,
      options: options.map((o) => ({ ...o, count: counts[o.id] ?? 0, percent: total >= PUBLIC_STATS.minSample ? Math.round(((counts[o.id] ?? 0) / total) * 1000) / 10 : null })),
      sources: bySource,
      rounds: rounds ? { played: rounds.rounds, averageVoters: Math.round(rounds.avg_voters * 10) / 10, changedMinds: rounds.changed, bothVotes: rounds.both, firstAt: rounds.first_at, lastAt: rounds.last_at } : null,
      versions: versions.results,
      dailies: dailies.results,
      note: "Counts describe participating players (one latest answer per browser or account per question version), not a representative poll. Group votes are shown live with names, which can influence later voters.",
    });
  }
  return null;
}
