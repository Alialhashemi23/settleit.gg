import { CATALOG } from "./catalog.ts";
import type { CatalogQuestion, ResolvedQuestion } from "./types.ts";

export * from "./types.ts";
export { CATALOG };

export const TOPICS = ["gaming", "anime", "internet", "movies", "music", "food", "sports", "tech", "school", "nostalgia"] as const;
export type Topic = (typeof TOPICS)[number];
/** Categories shown in the room picker; "mix" means everything approved. */
export const CATEGORY_PRESETS: { id: string; label: string; topics: readonly string[] }[] = [
  { id: "mix", label: "Everything", topics: [] },
  { id: "gaming", label: "Gaming", topics: ["gaming"] },
  { id: "anime", label: "Anime", topics: ["anime"] },
  { id: "internet", label: "Internet", topics: ["internet", "tech"] },
  { id: "screens", label: "Movies & TV", topics: ["movies"] },
  { id: "music", label: "Music", topics: ["music"] },
  { id: "food", label: "Food", topics: ["food"] },
  { id: "sports", label: "Sports", topics: ["sports"] },
  { id: "nostalgia", label: "Nostalgia & School", topics: ["nostalgia", "school"] },
  { id: "wildcard", label: "Wildcards", topics: ["hypothetical", "weird", "friendship", "wholesome", "dark-humor"] },
];

export function versionIdOf(id: string, version: number): string {
  return `${id}v${version}`;
}

export function resolve(q: CatalogQuestion): ResolvedQuestion {
  const v = q.versions[q.versions.length - 1]!;
  return {
    id: q.id,
    version: v.version,
    versionId: versionIdOf(q.id, v.version),
    prompt: v.prompt,
    options: v.options,
    topic: q.topic,
    tags: q.tags,
    spoiler: q.spoiler,
    status: q.status,
  };
}

/** Active versions of every approved question. */
export function approvedQuestions(): ResolvedQuestion[] {
  return CATALOG.filter((q) => q.status === "approved").map(resolve);
}

export function findVersion(versionId: string): ResolvedQuestion | null {
  const m = /^(q\d+)v(\d+)$/.exec(versionId);
  if (!m) return null;
  const q = CATALOG.find((x) => x.id === m[1]);
  const v = q?.versions.find((x) => x.version === Number(m[2]));
  if (!q || !v) return null;
  return { ...resolve(q), version: v.version, versionId, prompt: v.prompt, options: v.options };
}

/**
 * Filter approved questions for a room. `categories` are CATEGORY_PRESETS ids;
 * an empty list or "mix" means everything. Gaming, anime and internet are the
 * launch priority, so a "mix" room weights them by listing them first in the
 * seed order before shuffling (the shuffle is seeded by the room, see core).
 */
export function questionsForRoom(categories: readonly string[], excludeSpoilers: boolean): ResolvedQuestion[] {
  const all = approvedQuestions().filter((q) => !excludeSpoilers || !q.spoiler);
  const chosen = categories.filter((c) => c !== "mix");
  if (chosen.length === 0) return all;
  const allowed = new Set(chosen.flatMap((c) => CATEGORY_PRESETS.find((p) => p.id === c)?.topics ?? []));
  return all.filter((q) => q.tags.some((t) => allowed.has(t)));
}
