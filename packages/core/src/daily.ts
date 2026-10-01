import { DAILY } from "./config.ts";

export interface DailyPeriod {
  /** YYYY-MM-DD of the UTC date on which the period opened. */
  dateKey: string;
  opensAt: number;
  closesAt: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The daily period containing `now`. Periods start at DAILY.startHourUtc. */
export function dailyPeriodFor(now: number, startHourUtc: number = DAILY.startHourUtc): DailyPeriod {
  const d = new Date(now);
  let opens = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startHourUtc);
  if (now < opens) opens -= 24 * 3600_000;
  return { dateKey: dateKeyOf(opens), opensAt: opens, closesAt: opens + 24 * 3600_000 };
}

export function dailyPeriodForDateKey(dateKey: string, startHourUtc: number = DAILY.startHourUtc): DailyPeriod {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new Error(`bad dateKey ${dateKey}`);
  const opens = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), startHourUtc);
  return { dateKey, opensAt: opens, closesAt: opens + 24 * 3600_000 };
}

/**
 * "Read the Crowd" score: prediction accuracy only, never whether the opinion was right.
 * max(0, round(100 - 2 × |error in percentage points|)).
 */
export function scorePrediction(predictedPct: number, actualPct: number): number {
  const err = Math.abs(predictedPct - actualPct);
  return Math.max(0, Math.round(100 - 2 * err));
}

export function isValidPrediction(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= 100;
}

/**
 * Share of a cohort that chose `optionId`, excluding the scoring actor's own vote.
 * Returns null when there are not enough *other* participants to grade.
 */
export function baselineShare(
  counts: Record<string, number>,
  optionId: string,
  minOthers: number = DAILY.minOthersToGrade,
): number | null {
  const total = Object.values(counts).reduce((s, x) => s + x, 0);
  const own = 1; // the actor's own vote is part of counts
  const others = total - own;
  if (others < minOthers) return null;
  const sameOthers = (counts[optionId] ?? 0) - own;
  return Math.round((sameOthers / others) * 1000) / 10;
}

/** Small deterministic string hash (FNV-1a 32-bit). */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic daily selection: among approved candidates not used recently,
 * pick by hash of the date key. Falls back to the least recently used
 * question when everything has run recently, and to null with no candidates.
 */
export function selectDailyQuestion<T extends { id: string }>(
  dateKey: string,
  candidates: readonly T[],
  recentlyUsed: ReadonlyMap<string, string> /* id -> last dateKey */,
): T | null {
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((c) => !recentlyUsed.has(c.id));
  const pool = fresh.length > 0
    ? fresh
    : [...candidates].sort((a, b) => (recentlyUsed.get(a.id) ?? "").localeCompare(recentlyUsed.get(b.id) ?? ""));
  if (fresh.length === 0) return pool[0] ?? null;
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[hash32(`daily:${dateKey}`) % sorted.length] ?? null;
}
