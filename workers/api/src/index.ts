import type { Env } from "./env";
import { handleRooms } from "./rooms";
import { getSession, withSessionCookie } from "./auth";
import { HttpError, errorResponse, json } from "./util";

export { RoomDO } from "./room";

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) throw new HttpError(404, "not_found");
  if (url.pathname === "/api/health") return json({ ok: true, env: env.ENVIRONMENT });
  if (url.pathname === "/api/session" && req.method === "GET") {
    const s = await getSession(req, env, true);
    return withSessionCookie(json({ actorId: s!.actorId }), s!);
  }
  const rooms = await handleRooms(req, env, url, ctx);
  if (rooms) return rooms;
  const { handleDaily } = await import("./daily");
  const daily = await handleDaily(req, env, url, ctx);
  if (daily) return daily;
  const { handleStats } = await import("./stats");
  const stats = await handleStats(req, env, url);
  if (stats) return stats;
  const { handleAdmin } = await import("./admin");
  const admin = await handleAdmin(req, env, url, ctx);
  if (admin) return admin;
  const { handleTelemetry } = await import("./telemetry");
  const tele = await handleTelemetry(req, env, url, ctx);
  if (tele) return tele;
  throw new HttpError(404, "not_found");
}

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  },
  async scheduled(_event, env, ctx) {
    const { runMaintenance } = await import("./maintenance");
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
