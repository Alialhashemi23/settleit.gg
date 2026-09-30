import { dateKeyOf } from "@settleit/core";
import { getSession } from "./auth";
import type { Env } from "./env";
import { isTestTraffic } from "./rooms";
import { assertSameOrigin, cleanText, json, readJson } from "./util";

const ALLOWED = new Set(["page_view", "resume_attempted", "resume_succeeded", "resume_failed", "room_created_ui", "daily_opened", "share_opened", "client_error"]);

interface ClientEvent { id: string; name: string; at?: number; sessionId?: string; mode?: string; props?: Record<string, unknown> }

export async function handleTelemetry(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== "/api/telemetry" || req.method !== "POST") return null;
  assertSameOrigin(req, env.ALLOWED_ORIGINS);
  const session = await getSession(req, env, false);
  const body = await readJson<{ events?: ClientEvent[] }>(req);
  const events = (body.events ?? []).slice(0, 50).filter((e) => e && typeof e.id === "string" && e.id.length <= 64 && ALLOWED.has(e.name));
  if (events.length === 0) return json({ accepted: 0 });
  const now = Date.now();
  const isTest = isTestTraffic(req, env) ? 1 : 0;
  const stmts = events.map((e) => {
    const at = typeof e.at === "number" && Math.abs(now - e.at) < 6 * 3600_000 ? e.at : now;
    const props = e.props ? JSON.stringify(Object.fromEntries(Object.entries(e.props).slice(0, 12).map(([k, v]) => [cleanText(k, 32), typeof v === "number" ? v : cleanText(String(v), 120)]))) : null;
    return env.DB.prepare("INSERT OR IGNORE INTO telemetry_event (id, name, actor_id, session_id, mode, version_id, env, is_test, at, day, props) VALUES (?, ?, ?, ?, ?, NULL, 'client', ?, ?, ?, ?)")
      .bind(`c:${e.id}`, e.name, session?.actorId ?? null, cleanText(e.sessionId, 48) || null, cleanText(e.mode, 16) || null, isTest, at, dateKeyOf(at), props);
  });
  // Telemetry must never block gameplay: write in the background and always answer 202.
  ctx.waitUntil(env.DB.batch(stmts).catch((e) => console.warn("telemetry write failed", e)));
  return json({ accepted: events.length }, { status: 202 });
}
