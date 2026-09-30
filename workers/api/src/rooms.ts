import { LIMITS } from "@settleit/core";
import type { RoomCommand } from "@settleit/core";
import { requireSession, withSessionCookie } from "./auth";
import type { Env } from "./env";
import { HttpError, RateLimiter, assertSameOrigin, cleanText, json, parseCookies, readJson } from "./util";

/** Owner test sessions mark everything they touch as test traffic. */
export function isTestTraffic(req: Request, env: Env): boolean {
  return env.ENVIRONMENT !== "production" || parseCookies(req)["sit_test"] === "1";
}

const WORDS = ["FIRE", "NOVA", "WILD", "IRON", "NEON", "MOSS", "JADE", "ECHO", "RUST", "SNOW", "LAVA", "DUSK", "PINE", "SAGE", "OPAL", "ZINC"];
const createLimiter = new RateLimiter(10, 10 * 60_000);
const joinLimiter = new RateLimiter(40, 10 * 60_000);

function roomCode(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)]!;
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${w}-${n}`;
}

export function normalizeCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{4}$/.test(s)) throw new HttpError(400, "bad_code", "Room codes look like FIRE-4829.");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

async function forward(env: Env, code: string, path: string, init: RequestInit & { actorId?: string; ws?: Request } = {}): Promise<Response> {
  const stub = roomStub(env, code);
  const url = new URL(`https://room${path}`);
  if (init.actorId) url.searchParams.set("actor", init.actorId);
  if (init.ws) {
    const headers = new Headers(init.ws.headers);
    return stub.fetch(new Request(url.toString(), { headers, method: "GET" }));
  }
  return stub.fetch(new Request(url.toString(), { method: init.method ?? "GET", body: init.body ?? null, headers: { "content-type": "application/json" } }));
}

async function passThrough(res: Response): Promise<Response> {
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function handleRooms(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  const parts = url.pathname.split("/").filter(Boolean); // ["api","rooms",...]
  if (parts[1] !== "rooms") return null;
  const session = await requireSession(req, env);

  // POST /api/rooms  → create
  if (parts.length === 2 && req.method === "POST") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    if (!createLimiter.check(session.actorId)) throw new HttpError(429, "slow_down", "Too many rooms created. Try again in a few minutes.");
    const body = await readJson<{ nickname?: string; categories?: string[]; excludeSpoilers?: boolean; isTest?: boolean }>(req);
    const nickname = cleanText(body.nickname, LIMITS.maxNicknameLength);
    if (!nickname) throw new HttpError(400, "nickname_required", "Pick a nickname first.");
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = roomCode();
      const exists = (await (await forward(env, code, "/exists")).json()) as { exists: boolean };
      if (exists.exists) continue;
      const res = await forward(env, code, "/create", {
        method: "POST",
        body: JSON.stringify({ code, actorId: session.actorId, nickname, categories: body.categories ?? [], excludeSpoilers: body.excludeSpoilers, isTest: isTestTraffic(req, env) }),
      });
      if (res.status === 409) continue;
      ctx.waitUntil(recordJoin(env, session.actorId, code, isTestTraffic(req, env)));
      return withSessionCookie(await passThrough(res), session);
    }
    throw new HttpError(503, "no_code", "Couldn't find a free room code. Try again.");
  }

  const code = normalizeCode(parts[2] ?? "");
  const action = parts[3] ?? "";

  if (action === "join" && req.method === "POST") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    if (!joinLimiter.check(session.actorId)) throw new HttpError(429, "slow_down", "Too many join attempts. Slow down.");
    const body = await readJson<{ nickname?: string }>(req);
    const res = await forward(env, code, "/join", { method: "POST", body: JSON.stringify({ actorId: session.actorId, nickname: cleanText(body.nickname, LIMITS.maxNicknameLength) }) });
    if (res.ok) ctx.waitUntil(recordJoin(env, session.actorId, code, isTestTraffic(req, env)));
    return withSessionCookie(await passThrough(res), session);
  }
  if (action === "snapshot" && req.method === "GET") {
    return withSessionCookie(await passThrough(await forward(env, code, "/snapshot", { actorId: session.actorId })), session);
  }
  if (action === "recap" && req.method === "GET") {
    return withSessionCookie(await passThrough(await forward(env, code, "/recap", { actorId: session.actorId })), session);
  }
  if (action === "command" && req.method === "POST") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    const command = await readJson<RoomCommand>(req);
    const res = await forward(env, code, "/command", { method: "POST", body: JSON.stringify({ actorId: session.actorId, command }) });
    return withSessionCookie(await passThrough(res), session);
  }
  if (action === "ws" && req.method === "GET") {
    assertSameOrigin(req, env.ALLOWED_ORIGINS);
    if (session.isNew) throw new HttpError(403, "not_a_member", "Join this room first.");
    return forward(env, code, "/ws", { actorId: session.actorId, ws: req });
  }
  throw new HttpError(404, "not_found");
}

async function recordJoin(env: Env, actorId: string, code: string, isTest: boolean): Promise<void> {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const t = isTest ? 1 : 0;
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO actor (id, kind, created_at, last_seen_at, is_test) VALUES (?, 'guest', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at")
        .bind(actorId, now, now, t),
      env.DB.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, 'room_joined', ?, ?, 'group', NULL, 'server', ?, ?, ?, NULL)")
        .bind(`join:${code}:${actorId}`, actorId, code, t, now, day),
    ]);
  } catch (e) {
    console.warn("recordJoin failed", e);
  }
}
