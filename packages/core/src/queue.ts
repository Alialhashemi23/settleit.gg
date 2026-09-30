import { hash32 } from "./daily.ts";

/** Deterministic shuffle keyed by a seed so a room's queue is reproducible after restart. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let x = hash32(seed) || 1;
  const next = () => {
    // xorshift32
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Pick the next question for a room: private queued prompts first, then the
 * shuffled library queue, skipping anything already dealt this session.
 */
export function nextFromQueue<T extends { id: string }>(queue: readonly T[], dealt: ReadonlySet<string>): T | null {
  for (const q of queue) if (!dealt.has(q.id)) return q;
  return null;
}
