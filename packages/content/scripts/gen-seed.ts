// Emits a D1 migration that seeds the question library from the catalog.
// Usage: bun run scripts/gen-seed.ts > ../../workers/api/migrations/0002_seed_catalog.sql
import { CATALOG, versionIdOf } from "../src/index.ts";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = Date.UTC(2026, 8, 30);
const lines: string[] = ["-- GENERATED from packages/content by scripts/gen-seed.ts. Do not edit by hand."];
for (const c of CATALOG) {
  const active = c.versions[c.versions.length - 1]!;
  lines.push(
    `INSERT OR IGNORE INTO question (id, topic, tags, spoiler, status, note, active_version, created_at, updated_at) VALUES (${q(c.id)}, ${c.topic ? q(c.topic) : "NULL"}, ${q(JSON.stringify(c.tags))}, ${c.spoiler ? 1 : 0}, ${q(c.status)}, ${c.note ? q(c.note) : "NULL"}, ${active.version}, ${now}, ${now});`,
  );
  for (const v of c.versions) {
    lines.push(
      `INSERT OR IGNORE INTO question_version (version_id, question_id, version, prompt, options, note, created_at) VALUES (${q(versionIdOf(c.id, v.version))}, ${q(c.id)}, ${v.version}, ${q(v.prompt)}, ${q(JSON.stringify(v.options))}, ${v.note ? q(v.note) : "NULL"}, ${now});`,
    );
  }
}
console.log(lines.join("\n"));
