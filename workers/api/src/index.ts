import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
  }
  async put(k: string, v: string) { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)", k, v); }
  async get(k: string) { const r = this.ctx.storage.sql.exec("SELECT v FROM kv WHERE k=?", k).toArray(); return r[0]?.v ?? null; }
  async abortSelf() { this.ctx.abort("test"); }
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    await env.DB.prepare("INSERT OR REPLACE INTO spike (id, v) VALUES ('a', 1)").run();
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
