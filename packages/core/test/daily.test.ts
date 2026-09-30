import { describe, expect, it } from "vitest";
import { baselineShare, dailyPeriodFor, dailyPeriodForDateKey, scorePrediction, selectDailyQuestion } from "../src/daily.ts";
import { nextFromQueue, seededShuffle } from "../src/queue.ts";

describe("dailyPeriodFor", () => {
  it("starts at 12:00 UTC and lasts 24h", () => {
    const p = dailyPeriodFor(Date.UTC(2026, 8, 30, 13));
    expect(p.dateKey).toBe("2026-09-30");
    expect(p.opensAt).toBe(Date.UTC(2026, 8, 30, 12));
    expect(p.closesAt).toBe(Date.UTC(2026, 9, 1, 12));
  });
  it("belongs to the previous date before the boundary", () => {
    const p = dailyPeriodFor(Date.UTC(2026, 8, 30, 11, 59, 59));
    expect(p.dateKey).toBe("2026-09-29");
    expect(dailyPeriodFor(Date.UTC(2026, 8, 30, 12)).dateKey).toBe("2026-09-30");
    expect(dailyPeriodForDateKey("2026-09-29")).toEqual(p);
  });
});

describe("scorePrediction", () => {
  it("matches the manifesto example and floors at zero", () => {
    expect(scorePrediction(60, 70)).toBe(80);
    expect(scorePrediction(50, 50)).toBe(100);
    expect(scorePrediction(0, 100)).toBe(0);
    expect(scorePrediction(100, 30.4)).toBe(0);
  });
});

describe("baselineShare", () => {
  it("excludes the actor's own vote and needs enough others", () => {
    expect(baselineShare({ a: 11, b: 10 }, "a", 20)).toBe(50);
    expect(baselineShare({ a: 10, b: 10 }, "a", 20)).toBeNull();
    expect(baselineShare({ a: 1, b: 3 }, "a", 3)).toBe(0);
  });
});

describe("selectDailyQuestion", () => {
  const cands = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
  it("is deterministic per date and skips recently used", () => {
    const a = selectDailyQuestion("2026-10-01", cands, new Map());
    const b = selectDailyQuestion("2026-10-01", cands, new Map());
    expect(a).toEqual(b);
    const rest = selectDailyQuestion("2026-10-01", cands, new Map([[a!.id, "2026-09-30"]]));
    expect(rest!.id).not.toBe(a!.id);
  });
  it("falls back to the least recently used when everything ran recently", () => {
    const recent = new Map([["q1", "2026-09-10"], ["q2", "2026-09-01"], ["q3", "2026-09-20"]]);
    expect(selectDailyQuestion("2026-10-01", cands, recent)?.id).toBe("q2");
    expect(selectDailyQuestion("2026-10-01", [], recent)).toBeNull();
  });
});

describe("queue", () => {
  it("shuffles deterministically and never repeats dealt questions", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}` }));
    const s1 = seededShuffle(items, "ROOM-1");
    expect(seededShuffle(items, "ROOM-1")).toEqual(s1);
    expect(seededShuffle(items, "ROOM-2")).not.toEqual(s1);
    expect(new Set(s1.map((x) => x.id)).size).toBe(20);
    const dealt = new Set([s1[0]!.id, s1[1]!.id]);
    expect(nextFromQueue(s1, dealt)).toEqual(s1[2]);
    expect(nextFromQueue(s1, new Set(items.map((i) => i.id)))).toBeNull();
  });
});
