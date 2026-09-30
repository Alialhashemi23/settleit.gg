import { approvedQuestions, type ResolvedQuestion } from "@settleit/content";
import type { Env } from "./env";

interface QuestionRow {
  id: string; topic: string | null; tags: string; spoiler: number; status: string; active_version: number;
  version_id: string; version: number; prompt: string; options: string;
}

/**
 * The approved library, read from D1 (admin edits live there). Falls back to the
 * static catalog shipped with the code when D1 is unavailable so rooms can
 * always start.
 */
export async function loadApprovedLibrary(env: Env): Promise<{ questions: ResolvedQuestion[]; source: "d1" | "static" }> {
  try {
    const rows = await env.DB.prepare(
      `SELECT q.id, q.topic, q.tags, q.spoiler, q.status, q.active_version, v.version_id, v.version, v.prompt, v.options
       FROM question q JOIN question_version v ON v.question_id = q.id AND v.version = q.active_version
       WHERE q.status = 'approved'`,
    ).all<QuestionRow>();
    if (rows.results.length === 0) return { questions: approvedQuestions(), source: "static" };
    return {
      questions: rows.results.map((r) => ({
        id: r.id, version: r.version, versionId: r.version_id, prompt: r.prompt,
        options: JSON.parse(r.options), topic: r.topic, tags: JSON.parse(r.tags), spoiler: !!r.spoiler, status: "approved",
      })),
      source: "d1",
    };
  } catch (e) {
    console.warn("library from D1 failed, using static catalog", e);
    return { questions: approvedQuestions(), source: "static" };
  }
}

export async function loadVersion(env: Env, versionId: string): Promise<ResolvedQuestion | null> {
  const r = await env.DB.prepare(
    `SELECT q.id, q.topic, q.tags, q.spoiler, q.status, q.active_version, v.version_id, v.version, v.prompt, v.options
     FROM question_version v JOIN question q ON q.id = v.question_id WHERE v.version_id = ?`,
  ).bind(versionId).first<QuestionRow>();
  if (!r) return null;
  return { id: r.id, version: r.version, versionId: r.version_id, prompt: r.prompt, options: JSON.parse(r.options), topic: r.topic, tags: JSON.parse(r.tags), spoiler: !!r.spoiler, status: r.status as ResolvedQuestion["status"] };
}
