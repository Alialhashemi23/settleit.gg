import { SELF, env } from "cloudflare:test";
import type { CommandResponse, RoomCommandBody, RoomSnapshot } from "@settleit/core";

let opCounter = 0;
export const BASE = "https://settleit.test";

/** A browser-like client with its own cookie jar. */
export class Client {
  private jar = new Map<string, string>();
  constructor(public name: string) {}

  get cookie(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  set cookie(raw: string) {
    for (const part of raw.split(";")) {
      const [k, v] = part.trim().split("=");
      if (k) this.jar.set(k, v ?? "");
    }
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", this.cookie);
    if (init.body) headers.set("content-type", "application/json");
    const res = await SELF.fetch(BASE + path, { ...init, headers });
    for (const set of res.headers.getSetCookie()) {
      const first = set.split(";")[0]!;
      const [k, v] = first.split("=");
      if (!k) continue;
      if (set.includes("Max-Age=0")) this.jar.delete(k); else this.jar.set(k, v ?? "");
    }
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await this.fetch(path, init);
    return { status: res.status, body: (await res.json()) as T };
  }

  async create(opts: Record<string, unknown> = {}): Promise<RoomSnapshot> {
    const r = await this.json<{ snapshot: RoomSnapshot }>("/api/rooms", { method: "POST", body: JSON.stringify({ nickname: this.name, ...opts }) });
    if (r.status !== 200) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.snapshot;
  }

  async join(code: string): Promise<{ status: number; body: { snapshot?: RoomSnapshot; error?: string } }> {
    return this.json(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname: this.name }) });
  }

  async snapshot(code: string): Promise<RoomSnapshot> {
    const r = await this.json<{ snapshot: RoomSnapshot }>(`/api/rooms/${code}/snapshot`);
    if (r.status !== 200) throw new Error(`snapshot failed ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.snapshot;
  }

  async command(code: string, body: RoomCommandBody, opId = `op-${this.name}-${++opCounter}-xxxx`): Promise<{ status: number; body: CommandResponse & { error?: string } }> {
    return this.json(`/api/rooms/${code}/command`, { method: "POST", body: JSON.stringify({ opId, body }) });
  }

  async recap(code: string) {
    return this.json<{ recap: import("@settleit/core").RecapView }>(`/api/rooms/${code}/recap`);
  }
}

export function roomStub(code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

/** Exports run in the background; tests call this before asserting on D1. */
export async function flushExports(code: string): Promise<number> {
  const r = await roomStub(code).fetch("https://room/export-sweep", { method: "POST" });
  return ((await r.json()) as { pending: number }).pending;
}

/** Two players create/join a room and both ready up, which deals the first question. */
export async function startedRoom(names = ["ana", "ben", "cy"]) {
  const clients = names.map((n) => new Client(n));
  const snap = await clients[0]!.create({ categories: ["mix"], excludeSpoilers: true });
  const code = snap.code;
  for (const c of clients.slice(1)) await c.join(code);
  for (const c of clients) await c.command(code, { type: "set_ready", ready: true });
  const s = await clients[0]!.snapshot(code);
  return { clients, code, snapshot: s };
}
