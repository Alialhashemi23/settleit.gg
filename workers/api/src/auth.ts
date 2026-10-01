import type { Env } from "./env";
import { HttpError, cookieHeader, hmac, newId, parseCookies, timingSafeEqual } from "./util";

export const SESSION_COOKIE = "sit_session";
export const ADMIN_COOKIE = "sit_admin";
const SESSION_MAX_AGE = 90 * 24 * 3600;
const ADMIN_MAX_AGE = 7 * 24 * 3600;

export interface Session {
  actorId: string;
  /** Present when a fresh cookie must be set on the response. */
  setCookie?: string;
  isNew: boolean;
}

async function sign(secret: string, payload: string): Promise<string> {
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verify(secret: string, token: string | undefined, parts: number): Promise<string[] | null> {
  if (!token) return null;
  const segs = token.split(".");
  if (segs.length !== parts + 1) return null;
  const payload = segs.slice(0, parts).join(".");
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(expected, segs[parts]!)) return null;
  return segs.slice(0, parts);
}

/**
 * Guest identity: a random actor id bound to an HMAC-signed HttpOnly cookie.
 * Nicknames, room codes and socket ids are never authentication.
 */
export async function getSession(req: Request, env: Env, createIfMissing = true): Promise<Session | null> {
  const cookies = parseCookies(req);
  const parsed = await verify(env.SESSION_SECRET, cookies[SESSION_COOKIE], 3);
  if (parsed && parsed[0] === "v1" && parsed[1]) {
    return { actorId: parsed[1], isNew: false };
  }
  if (!createIfMissing) return null;
  const actorId = newId("a_");
  const token = await sign(env.SESSION_SECRET, `v1.${actorId}.${Date.now()}`);
  return { actorId, isNew: true, setCookie: cookieHeader(SESSION_COOKIE, token, req, SESSION_MAX_AGE) };
}

export async function requireSession(req: Request, env: Env): Promise<Session> {
  const s = await getSession(req, env, true);
  if (!s) throw new HttpError(401, "no_session");
  return s;
}

export function withSessionCookie(res: Response, session: Session): Response {
  if (!session.setCookie) return res;
  const out = new Response(res.body, res);
  out.headers.append("set-cookie", session.setCookie);
  return out;
}

export async function makeSessionCookieValue(env: Env, actorId: string): Promise<string> {
  return sign(env.SESSION_SECRET, `v1.${actorId}.${Date.now()}`);
}

/** Admin identity: GitHub login allow-listed in ADMIN_GITHUB_LOGINS. */
export async function getAdmin(req: Request, env: Env): Promise<string | null> {
  const cookies = parseCookies(req);
  const parsed = await verify(env.ADMIN_SESSION_SECRET, cookies[ADMIN_COOKIE], 3);
  if (!parsed || parsed[0] !== "v1") return null;
  const [, login, issued] = parsed;
  if (!login || !issued || Date.now() - Number(issued) > ADMIN_MAX_AGE * 1000) return null;
  if (!isAllowedAdmin(login, env)) return null;
  return login;
}

export async function requireAdmin(req: Request, env: Env): Promise<string> {
  const admin = await getAdmin(req, env);
  if (!admin) throw new HttpError(401, "admin_required", "Sign in as an administrator.");
  return admin;
}

export function isAllowedAdmin(login: string, env: Env): boolean {
  const allowed = (env.ADMIN_GITHUB_LOGINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(login.toLowerCase());
}

export async function adminCookie(req: Request, env: Env, login: string): Promise<string> {
  const token = await sign(env.ADMIN_SESSION_SECRET, `v1.${login}.${Date.now()}`);
  return cookieHeader(ADMIN_COOKIE, token, req, ADMIN_MAX_AGE);
}

export async function signState(env: Env, payload: string): Promise<string> {
  return sign(env.ADMIN_SESSION_SECRET, `st.${payload}.${Date.now()}`);
}

export async function verifyState(env: Env, token: string | null): Promise<string | null> {
  const parsed = await verify(env.ADMIN_SESSION_SECRET, token ?? undefined, 3);
  if (!parsed || parsed[0] !== "st") return null;
  if (Date.now() - Number(parsed[2]) > 10 * 60_000) return null;
  return parsed[1] ?? null;
}
