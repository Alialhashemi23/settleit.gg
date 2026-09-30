import { dailyPeriodForDateKey, dateKeyOf } from "@settleit/core";
import { adminCookie, getAdmin, isAllowedAdmin, requireAdmin, signState, verifyState } from "./auth";
import { effectiveStatus, ensureChallenge, settleDaily, type ChallengeRow } from "./daily";
import type { Env } from "./env";
import { loadVersion } from "./library";
import { runMaintenance } from "./maintenance";
import { HttpError, assertSameOrigin, cleanText, cookieHeader, json, readJson } from "./util";

async function audit(env: Env, admin: string, action: string, target: string | null, detail: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit (admin, action, target, detail, at) VALUES (?, ?, ?, ?, ?)")
    .bind(admin, action, target, detail === undefined ? null : JSON.stringify(detail), Date.now()).run();
}

function publicOrigin(req: Request, env: Env): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

// ---------- overview ----------

async function overview(env: Env, days: number, includeTest: boolean, now: number) {
  const since = now - days * 86_400_000;
  const tf = includeTest ? "" : " AND is_test = 0";
  const day = (n: number) => dateKeyOf(n);
  const daysList: string[] = [];
  for (let i = days - 1; i >= 0; i--) daysList.push(day(now - i * 86_400_000));

  const q = async <T>(sql: string, ...binds: unknown[]) => (await env.DB.prepare(sql).bind(...binds).all<T>()).results;
  const perDay = <T extends { day: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.day, r]));

  const visitors = perDay(await q<{ day: string; visitors: number; visits: number }>(
    `SELECT day, COUNT(DISTINCT COALESCE(actor_id, session_id)) AS visitors, COUNT(DISTINCT session_id) AS visits FROM telemetry_event WHERE name = 'page_view' AND at >= ?${tf} GROUP BY day`, since));
  const starters = perDay(await q<{ day: string; starters: number }>(
    `SELECT day, COUNT(DISTINCT actor_id) AS starters FROM telemetry_event WHERE name IN ('vote_accepted','daily_submitted') AND at >= ?${tf} GROUP BY day`, since));
  const rounds = perDay(await q<{ day: string; rounds: number; sessions: number }>(
    `SELECT day, COUNT(*) AS rounds, COUNT(DISTINCT session_id) AS sessions FROM telemetry_event WHERE name = 'round_completed' AND at >= ?${tf} GROUP BY day`, since));
  const dailies = perDay(await q<{ day: string; submitted: number }>(
    `SELECT day, COUNT(*) AS submitted FROM telemetry_event WHERE name = 'daily_submitted' AND at >= ?${tf} GROUP BY day`, since));
  const graded = perDay(await q<{ day: string; graded: number; ungraded: number }>(
    `SELECT day, SUM(CASE WHEN props LIKE '%"graded":true%' THEN 1 ELSE 0 END) AS graded, SUM(CASE WHEN props LIKE '%"graded":false%' THEN 1 ELSE 0 END) AS ungraded FROM telemetry_event WHERE name = 'daily_graded' AND at >= ?${tf} GROUP BY day`, since));
  const recovery = perDay(await q<{ day: string; attempted: number; succeeded: number; failed: number }>(
    `SELECT day, SUM(name = 'resume_attempted') AS attempted, SUM(name = 'resume_succeeded') AS succeeded, SUM(name = 'resume_failed') AS failed FROM telemetry_event WHERE name LIKE 'resume_%' AND at >= ?${tf} GROUP BY day`, since));
  // Returning: actors seen on a day who were first seen on an earlier day.
  const returning = perDay(await q<{ day: string; returning_actors: number }>(
    `SELECT t.day, COUNT(DISTINCT t.actor_id) AS returning_actors FROM telemetry_event t
     JOIN (SELECT actor_id, MIN(day) AS first_day FROM telemetry_event WHERE actor_id IS NOT NULL${tf} GROUP BY actor_id) f ON f.actor_id = t.actor_id
     WHERE t.at >= ? AND t.day > f.first_day${tf.replace("is_test", "t.is_test")} GROUP BY t.day`, since));

  const totals = {
    visitors: (await env.DB.prepare(`SELECT COUNT(DISTINCT COALESCE(actor_id, session_id)) AS n FROM telemetry_event WHERE name = 'page_view' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    starters: (await env.DB.prepare(`SELECT COUNT(DISTINCT actor_id) AS n FROM telemetry_event WHERE name IN ('vote_accepted','daily_submitted') AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    roundsCompleted: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM telemetry_event WHERE name = 'round_completed' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    sessionsWithRound: (await env.DB.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM telemetry_event WHERE name = 'round_completed' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    dailySubmitted: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM telemetry_event WHERE name = 'daily_submitted' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    resumeAttempted: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM telemetry_event WHERE name = 'resume_attempted' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
    resumeFailed: (await env.DB.prepare(`SELECT COUNT(*) AS n FROM telemetry_event WHERE name = 'resume_failed' AND at >= ?${tf}`).bind(since).first<{ n: number }>())?.n ?? 0,
  };
  const latency = await env.DB.prepare(`SELECT props FROM telemetry_event WHERE name = 'resume_succeeded' AND at >= ?${tf} ORDER BY at DESC LIMIT 500`).bind(since).all<{ props: string | null }>();
  const ms = latency.results.map((r) => { try { return Number(JSON.parse(r.props ?? "{}").latencyMs); } catch { return NaN; } }).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const p95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : null;
  const under3s = ms.length ? Math.round((ms.filter((x) => x <= 3000).length / ms.length) * 1000) / 10 : null;

  return {
    generatedAt: now,
    days,
    includeTest,
    totals: { ...totals, resumeSample: ms.length, resumeP95Ms: p95, resumeUnder3sPercent: under3s },
    series: daysList.map((d) => ({
      day: d,
      visitors: visitors[d]?.visitors ?? 0,
      visits: visitors[d]?.visits ?? 0,
      starters: starters[d]?.starters ?? 0,
      roundsCompleted: rounds[d]?.rounds ?? 0,
      sessionsWithRound: rounds[d]?.sessions ?? 0,
      dailySubmitted: dailies[d]?.submitted ?? 0,
      dailyGraded: graded[d]?.graded ?? 0,
      dailyUngraded: graded[d]?.ungraded ?? 0,
      returning: returning[d]?.returning_actors ?? 0,
      resumeAttempted: recovery[d]?.attempted ?? 0,
      resumeSucceeded: recovery[d]?.succeeded ?? 0,
      resumeFailed: recovery[d]?.failed ?? 0,
    })),
    definitions: {
      visitors: "Distinct browsers (guest id, else client session) with a page_view; approximate and undercounts blocked clients.",
      starters: "Distinct actors with a server-confirmed group vote or daily submission.",
      roundsCompleted: "Group rounds that reached a verdict with at least one vote.",
      sessionsWithRound: "Rooms with at least one completed round.",
      returning: "Actors active on a day after the day they were first seen; guest resets break the chain.",
      resume: "Client-reported foreground resumes; latency is time to a fresh snapshot after visibility.",
    },
  };
}

async function ops(env: Env, now: number) {
  const stalled = await env.DB.prepare("SELECT code, pending_exports, last_export_at, last_export_error, last_activity_at, status FROM room_registry WHERE pending_exports > 0 OR last_export_error IS NOT NULL ORDER BY last_activity_at DESC LIMIT 50").all();
  const activeRooms = await env.DB.prepare("SELECT COUNT(*) AS n FROM room_registry WHERE status IN ('lobby','playing','paused') AND last_activity_at >= ?").bind(now - 3 * 3600_000).first<{ n: number }>();
  const unsettled = await env.DB.prepare("SELECT date_key, closes_at, status FROM daily_challenge WHERE status NOT IN ('settled','void') AND closes_at <= ? ORDER BY date_key").bind(now - 15 * 60_000).all();
  const upcoming = await env.DB.prepare("SELECT c.date_key, c.version_id, c.status, c.scheduled_by, v.prompt FROM daily_challenge c JOIN question_version v ON v.version_id = c.version_id WHERE c.closes_at >= ? ORDER BY c.date_key LIMIT 7").bind(now).all();
  const lastExport = await env.DB.prepare("SELECT MAX(applied_at) AS t FROM export_receipt").first<{ t: number | null }>();
  const lastTelemetry = await env.DB.prepare("SELECT MAX(at) AS t FROM telemetry_event").first<{ t: number | null }>();
  const errors = await env.DB.prepare("SELECT at, props FROM telemetry_event WHERE name = 'client_error' ORDER BY at DESC LIMIT 20").all();
  return {
    generatedAt: now,
    activeRooms: activeRooms?.n ?? 0,
    stalledExports: stalled.results,
    unsettledDays: unsettled.results,
    upcomingDailies: upcoming.results,
    freshness: { lastExportAt: lastExport?.t ?? null, lastTelemetryAt: lastTelemetry?.t ?? null },
    recentClientErrors: errors.results,
  };
}

// ---------- router ----------

export async function handleAdmin(req: Request, env: Env, url: URL, _ctx: ExecutionContext): Promise<Response | null> {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[1] !== "admin") return null;
  const now = Date.now();
  const sub = parts[2] ?? "";

  // ----- auth -----
  if (sub === "me") {
    const admin = await getAdmin(req, env);
    return json({ admin, configured: !!env.GITHUB_CLIENT_ID, testMode: req.headers.get("cookie")?.includes("sit_test=1") ?? false });
  }
  if (sub === "login" && req.method === "GET") {
    if (!env.GITHUB_CLIENT_ID) throw new HttpError(503, "oauth_not_configured", "Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET to enable admin sign-in.");
    const state = await signState(env, "login");
    const redirect = `${publicOrigin(req, env)}/api/admin/callback`;
    const gh = new URL("https://github.com/login/oauth/authorize");
    gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    gh.searchParams.set("redirect_uri", redirect);
    gh.searchParams.set("scope", "read:user");
    gh.searchParams.set("state", state);
    return Response.redirect(gh.toString(), 302);
  }
  if (sub === "callback" && req.method === "GET") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new HttpError(503, "oauth_not_configured");
    const state = await verifyState(env, url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!state || !code) throw new HttpError(400, "bad_oauth_state", "Sign-in expired. Try again.");
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "settleit-admin" },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new HttpError(401, "oauth_failed", "GitHub did not return a token.");
    const userRes = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token.access_token}`, "user-agent": "settleit-admin", accept: "application/vnd.github+json" } });
    const user = (await userRes.json()) as { login?: string };
    if (!user.login || !isAllowedAdmin(user.login, env)) {
      await audit(env, user.login ?? "unknown", "login_denied", null, null);
      throw new HttpError(403, "not_an_admin", "That GitHub account is not an administrator.");
    }
    await audit(env, user.login, "login", null, null);
    return new Response(null, { status: 302, headers: { location: `${publicOrigin(req, env)}/admin`, "set-cookie": await adminCookie(req, env, user.login) } });
  }
  if (sub === "logout" && req.method === "POST") {
    return new Response(null, { status: 204, headers: { "set-cookie": cookieHeader("sit_admin", "", req, 0) } });
  }

  // Everything below requires an admin session.
  const admin = await requireAdmin(req, env);
  if (req.method !== "GET") assertSameOrigin(req, env.ALLOWED_ORIGINS);

  if (sub === "test-mode" && req.method === "POST") {
    const body = await readJson<{ enabled?: boolean }>(req);
    await audit(env, admin, "test_mode", null, { enabled: !!body.enabled });
    return new Response(JSON.stringify({ enabled: !!body.enabled }), { status: 200, headers: { "content-type": "application/json", "set-cookie": cookieHeader("sit_test", body.enabled ? "1" : "", req, body.enabled ? 365 * 86400 : 0) } });
  }
  if (sub === "overview" && req.method === "GET") {
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 14) || 14));
    return json(await overview(env, days, url.searchParams.get("includeTest") === "1", now));
  }
  if (sub === "ops" && req.method === "GET") return json(await ops(env, now));
  if (sub === "maintenance" && req.method === "POST") {
    const r = await runMaintenance(env, now);
    await audit(env, admin, "maintenance", null, r);
    return json(r);
  }
  if (sub === "audit" && req.method === "GET") {
    return json({ entries: (await env.DB.prepare("SELECT * FROM admin_audit ORDER BY id DESC LIMIT 100").all()).results });
  }

  // ----- questions -----
  if (sub === "questions") {
    const id = parts[3];
    if (!id && req.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT q.id, q.topic, q.tags, q.spoiler, q.status, q.note, q.active_version, q.updated_at, v.version_id, v.prompt, v.options
         FROM question q JOIN question_version v ON v.question_id = q.id AND v.version = q.active_version ORDER BY q.id`,
      ).all();
      return json({ questions: rows.results.map((r) => ({ ...r, tags: JSON.parse(String(r.tags)), options: JSON.parse(String(r.options)) })) });
    }
    if (!id && req.method === "POST") {
      const body = await readJson<{ id?: string; prompt?: string; options?: string[]; topic?: string; tags?: string[]; spoiler?: boolean; status?: string }>(req);
      const { prompt, options } = validateVersion(body);
      const newId = cleanText(body.id, 12) || await nextQuestionId(env);
      if (!/^q\d{3,5}$/.test(newId)) throw new HttpError(400, "bad_id", "Ids look like q211.");
      const tags = (body.tags ?? []).map((t) => cleanText(t, 24)).filter(Boolean);
      const status = ["approved", "retired", "excluded"].includes(body.status ?? "") ? body.status! : "approved";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO question (id, topic, tags, spoiler, status, note, active_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)")
          .bind(newId, cleanText(body.topic, 24) || null, JSON.stringify(tags), body.spoiler ? 1 : 0, status, now, now),
        env.DB.prepare("INSERT INTO question_version (version_id, question_id, version, prompt, options, note, created_at) VALUES (?, ?, 1, ?, ?, NULL, ?)")
          .bind(`${newId}v1`, newId, prompt, JSON.stringify(options), now),
      ]);
      await audit(env, admin, "question_create", newId, { prompt });
      return json({ id: newId, versionId: `${newId}v1` }, { status: 201 });
    }
    if (id && parts[4] === "version" && req.method === "POST") {
      const body = await readJson<{ prompt?: string; options?: string[]; note?: string }>(req);
      const { prompt, options } = validateVersion(body);
      const note = cleanText(body.note, 200);
      if (!note) throw new HttpError(400, "note_required", "Say why this version exists.");
      const q = await env.DB.prepare("SELECT active_version FROM question WHERE id = ?").bind(id).first<{ active_version: number }>();
      if (!q) throw new HttpError(404, "not_found");
      const version = q.active_version + 1;
      // Active versions are immutable; a new version never rewrites a running daily ballot.
      await env.DB.batch([
        env.DB.prepare("INSERT INTO question_version (version_id, question_id, version, prompt, options, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(`${id}v${version}`, id, version, prompt, JSON.stringify(options), note, now),
        env.DB.prepare("UPDATE question SET active_version = ?, updated_at = ? WHERE id = ?").bind(version, now, id),
      ]);
      await audit(env, admin, "question_version", id, { version, note });
      return json({ versionId: `${id}v${version}` }, { status: 201 });
    }
    if (id && !parts[4] && req.method === "PATCH") {
      const body = await readJson<{ status?: string; spoiler?: boolean; topic?: string; tags?: string[]; note?: string }>(req);
      const q = await env.DB.prepare("SELECT * FROM question WHERE id = ?").bind(id).first<{ status: string; spoiler: number; topic: string | null; tags: string; note: string | null }>();
      if (!q) throw new HttpError(404, "not_found");
      const status = body.status && ["approved", "retired", "excluded"].includes(body.status) ? body.status : q.status;
      const spoiler = typeof body.spoiler === "boolean" ? (body.spoiler ? 1 : 0) : q.spoiler;
      const topic = body.topic !== undefined ? cleanText(body.topic, 24) || null : q.topic;
      const tags = body.tags ? JSON.stringify(body.tags.map((t) => cleanText(t, 24)).filter(Boolean)) : q.tags;
      const note = body.note !== undefined ? cleanText(body.note, 200) || null : q.note;
      await env.DB.prepare("UPDATE question SET status = ?, spoiler = ?, topic = ?, tags = ?, note = ?, updated_at = ? WHERE id = ?").bind(status, spoiler, topic, tags, note, now, id).run();
      await audit(env, admin, "question_update", id, { status, spoiler, topic, note });
      return json({ ok: true });
    }
  }

  // ----- daily schedule -----
  if (sub === "daily") {
    const dateKey = parts[3];
    if (!dateKey && req.method === "GET") {
      const from = url.searchParams.get("from") ?? dateKeyOf(now - 14 * 86_400_000);
      const to = url.searchParams.get("to") ?? dateKeyOf(now + 7 * 86_400_000);
      const rows = await env.DB.prepare(
        `SELECT c.*, v.prompt, (SELECT COUNT(*) FROM daily_attempt a WHERE a.date_key = c.date_key AND a.eligible = 1) AS attempts
         FROM daily_challenge c JOIN question_version v ON v.version_id = c.version_id WHERE c.date_key BETWEEN ? AND ? ORDER BY c.date_key DESC`,
      ).bind(from, to).all<ChallengeRow & { prompt: string; attempts: number }>();
      return json({ days: rows.results.map((r) => ({ ...r, effectiveStatus: effectiveStatus(r, now) })) });
    }
    if (dateKey && req.method === "PUT") {
      const body = await readJson<{ versionId?: string }>(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new HttpError(400, "bad_date");
      const v = body.versionId ? await loadVersion(env, body.versionId) : null;
      if (!v) throw new HttpError(400, "bad_version", "Unknown question version.");
      const period = dailyPeriodForDateKey(dateKey);
      const existing = await env.DB.prepare("SELECT * FROM daily_challenge WHERE date_key = ?").bind(dateKey).first<ChallengeRow>();
      if (existing && effectiveStatus(existing, now) !== "scheduled") throw new HttpError(409, "already_started", "Only future days can be rescheduled.");
      await env.DB.prepare(
        "INSERT INTO daily_challenge (date_key, version_id, opens_at, closes_at, status, result_version, scheduled_by, created_at) VALUES (?, ?, ?, ?, 'scheduled', 0, 'admin', ?) ON CONFLICT(date_key) DO UPDATE SET version_id = excluded.version_id, scheduled_by = 'admin'",
      ).bind(dateKey, v.versionId, period.opensAt, period.closesAt, now).run();
      await audit(env, admin, "daily_schedule", dateKey, { versionId: v.versionId });
      return json({ ok: true });
    }
    if (dateKey && parts[4] === "settle" && req.method === "POST") {
      const body = await readJson<{ correction?: string }>(req).catch(() => ({} as { correction?: string }));
      const r = await settleDaily(env, dateKey, now, cleanText(body.correction, 200) || null);
      await audit(env, admin, "daily_settle", dateKey, r);
      return json(r);
    }
    if (dateKey && parts[4] === "void" && req.method === "POST") {
      const body = await readJson<{ reason?: string }>(req).catch(() => ({} as { reason?: string }));
      await env.DB.prepare("UPDATE daily_challenge SET status = 'void' WHERE date_key = ?").bind(dateKey).run();
      await env.DB.prepare("UPDATE daily_grade SET status = 'void' WHERE date_key = ?").bind(dateKey).run();
      await audit(env, admin, "daily_void", dateKey, { reason: cleanText(body.reason, 200) });
      return json({ ok: true });
    }
    if (dateKey && parts[4] === "ensure" && req.method === "POST") {
      const c = await ensureChallenge(env, dateKey, now);
      return json({ challenge: c });
    }
  }

  // ----- featured homepage cards -----
  if (sub === "featured") {
    if (req.method === "GET") return json({ slots: (await env.DB.prepare("SELECT * FROM featured ORDER BY slot").all()).results });
    if (req.method === "PUT") {
      const body = await readJson<{ slot?: string; versionId?: string | null; note?: string }>(req);
      const slot = cleanText(body.slot, 24);
      if (!slot) throw new HttpError(400, "bad_slot");
      if (body.versionId && !(await loadVersion(env, body.versionId))) throw new HttpError(400, "bad_version");
      await env.DB.prepare("INSERT INTO featured (slot, version_id, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET version_id = excluded.version_id, note = excluded.note, updated_at = excluded.updated_at")
        .bind(slot, body.versionId ?? null, cleanText(body.note, 120) || null, now).run();
      await audit(env, admin, "featured_set", slot, { versionId: body.versionId ?? null });
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "not_found");
}

function validateVersion(body: { prompt?: string; options?: string[] }): { prompt: string; options: { id: string; text: string }[] } {
  const prompt = cleanText(body.prompt, 140);
  const texts = (body.options ?? []).map((o) => cleanText(o, 40)).filter(Boolean);
  if (prompt.length < 4) throw new HttpError(400, "bad_prompt", "Prompt is too short.");
  if (texts.length < 2 || texts.length > 4) throw new HttpError(400, "bad_options", "Give 2 to 4 options.");
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) throw new HttpError(400, "bad_options", "Options must be distinct.");
  return { prompt, options: texts.map((text, i) => ({ id: `o${i + 1}`, text })) };
}

async function nextQuestionId(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS n FROM question WHERE id GLOB 'q[0-9]*'").first<{ n: number | null }>();
  return `q${String((row?.n ?? 0) + 1).padStart(3, "0")}`;
}
