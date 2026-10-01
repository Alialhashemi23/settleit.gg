export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", headers.get("cache-control") ?? "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message }, { status: e.status });
  console.error("unhandled", e);
  return json({ error: "internal", message: "Something went wrong." }, { status: 500 });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be JSON.");
  }
}

export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "");
}

export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.get("cookie");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isSecure(req: Request): boolean {
  const url = new URL(req.url);
  return url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function cookieHeader(name: string, value: string, req: Request, maxAgeSeconds: number): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (isSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

/** State-changing requests must come from our own origin (or a configured dev origin). */
export function assertSameOrigin(req: Request, allowed: string): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (tests, curl) send no Origin; browsers always do for POST/WS.
    return;
  }
  const url = new URL(req.url);
  const self = `${url.protocol}//${url.host}`;
  const ok = origin === self || allowed.split(",").map((s) => s.trim()).filter(Boolean).includes(origin);
  if (!ok) throw new HttpError(403, "bad_origin", "Cross-origin request rejected.");
}

export function nowMs(): number {
  return Date.now();
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Best-effort per-isolate sliding window limiter. Not a security boundary. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  check(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}
