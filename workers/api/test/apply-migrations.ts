import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TRANSIENT_TABLES = [
  "actor", "daily_challenge", "daily_attempt", "daily_result", "daily_grade", "share_token", "contribution",
  "round_outcome", "room_registry", "export_receipt", "admin_audit", "featured", "telemetry_event",
];

// Every test starts from the seeded library and otherwise empty global tables.
beforeEach(async () => {
  await env.DB.batch(TRANSIENT_TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await env.DB.prepare("DELETE FROM question_version WHERE question_id NOT IN (SELECT id FROM question WHERE id <= 'q210')").run();
  await env.DB.prepare("DELETE FROM question WHERE id > 'q210'").run();
});
