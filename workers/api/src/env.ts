export interface Env {
  ROOMS: DurableObjectNamespace<import("./room").RoomDO>;
  DB: D1Database;
  ENVIRONMENT: string;
  /** Comma-separated extra origins allowed for state-changing requests (dev only). */
  ALLOWED_ORIGINS: string;
  SESSION_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_GITHUB_LOGINS: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Public origin of the site, used for OAuth redirects (e.g. https://settleit.gg). */
  PUBLIC_ORIGIN?: string;
}
