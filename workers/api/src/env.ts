export interface Env {
  ROOMS: DurableObjectNamespace;
  DB: D1Database;
  ENVIRONMENT: string;
  SESSION_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_GITHUB_LOGINS: string;
}
