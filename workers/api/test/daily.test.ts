import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMaintenance } from "../src/maintenance";
import { Client } from "./helpers";

type View = {
  dateKey: string; status: string; question: { versionId: string; options: { id: string }[] } | null;
  myAttempt: { optionId: string; prediction: number; eligible: boolean } | null; sample: number;
  split: { counts: Record<string, number>; total: number; provisional: boolean } | null;
  grade: { status: string; score: number | null; baselineShare: number | null; resultVersion: number } | null; resultVersion: number;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function today(c: Client): Promise<View> {
  return (await c.json<View>("/api/daily")).body;
}
async function submit(c: Client, view: View, optionId: string, prediction: number) {
  return c.json<{ ok?: boolean; duplicate?: boolean; view?: View; error?: string }>("/api/daily/submit", { method: "POST", body: JSON.stringify({ dateKey: view.dateKey, optionId, prediction }) });
}

describe("daily challenge", () => {
  it("creates today's challenge on demand and locks one submission per browser", async () => {
    const ana = new Client("ana");
    const v = await today(ana);
    expect(v.dateKey).toBe("2026-10-01");
    expect(v.status).toBe("open");
    expect(v.question).not.toBeNull();
    expect(v.myAttempt).toBeNull();
    expect(v.split).toBeNull();
    const again = await today(ana);
    expect(again.question?.versionId).toBe(v.question?.versionId); // deterministic, idempotent

    expect((await submit(ana, v, "o1", 150)).status).toBe(400);
    expect((await submit(ana, v, "nope", 50)).status).toBe(400);
    const ok = await submit(ana, v, "o1", 60);
    expect(ok.status).toBe(200);
    expect(ok.body.view?.myAttempt).toMatchObject({ optionId: "o1", prediction: 60, eligible: true });
    expect(ok.body.view?.split).toBeNull(); // below threshold: no numbers, even for a participant
    const dup = await submit(ana, v, "o1", 60);
    expect(dup.body.duplicate).toBe(true);
    const change = await submit(ana, v, "o2", 10);
    expect(change.status).toBe(409);
    expect(change.body.error).toBe("already_submitted");
  });

  it("publishes a provisional split only above the sample threshold, then settles once with grades", async () => {
    const ana = new Client("ana");
    const v = await today(ana);
    await submit(ana, v, "o1", 60);
    const others: Client[] = [];
    for (let i = 0; i < 21; i++) {
      const c = new Client(`p${i}`);
      others.push(c);
      await submit(c, v, i < 14 ? "o1" : "o2", 50);
    }
    const mid = await today(ana);
    expect(mid.sample).toBe(22);
    expect(mid.split).toMatchObject({ total: 22, provisional: true });
    expect(mid.split?.counts.o1).toBe(15);
    // Someone who has not answered still sees nothing.
    const lurker = new Client("lurker");
    expect((await today(lurker)).split).toBeNull();

    // Close the day.
    vi.setSystemTime(new Date("2026-10-02T12:00:01Z"));
    const settled = (await ana.json<View>("/api/daily/2026-10-01")).body;
    expect(settled.status).toBe("settled");
    expect(settled.resultVersion).toBe(1);
    expect(settled.split).toMatchObject({ total: 22, provisional: false });
    // Ana picked o1: 14 of the other 21 picked o1 → 66.7%; she predicted 60 → |6.7| → 87.
    expect(settled.grade).toMatchObject({ status: "graded", resultVersion: 1 });
    expect(settled.grade?.baselineShare).toBeCloseTo(66.7, 1);
    expect(settled.grade?.score).toBe(87);

    // Re-settling is a no-op and the maintenance job agrees.
    const again = (await ana.json<View>("/api/daily/2026-10-01")).body;
    expect(again.resultVersion).toBe(1);
    const m = await runMaintenance(env, Date.now());
    expect(m.settled).toEqual([]);
    const results = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_result WHERE date_key = '2026-10-01'").first<{ n: number }>();
    expect(results?.n).toBe(1);
    const grades = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_grade WHERE date_key = '2026-10-01'").first<{ n: number }>();
    expect(grades?.n).toBe(22);

    // A late answer after close unlocks comparison but joins no cohort and changes no tally.
    const late = new Client("late");
    const lv = (await late.json<View>("/api/daily/2026-10-01")).body;
    const r = await submit(late, lv, "o2", 40);
    expect(r.status).toBe(200);
    expect(r.body.view?.myAttempt?.eligible).toBe(false);
    expect(r.body.view?.split?.total).toBe(22);
    expect(r.body.view?.grade?.status).toBe("late");
    const lateRows = await env.DB.prepare("SELECT eligible FROM daily_attempt WHERE date_key = '2026-10-01' AND eligible = 0").all();
    expect(lateRows.results.length).toBe(1);
  });

  it("low participation yields an honest ungraded result with no percentages", async () => {
    const ana = new Client("ana");
    const v = await today(ana);
    await submit(ana, v, "o1", 60);
    await submit(new Client("b"), v, "o2", 50);
    await submit(new Client("c"), v, "o1", 50);
    vi.setSystemTime(new Date("2026-10-02T12:30:00Z"));
    const m = await runMaintenance(env, Date.now());
    expect(m.settled).toEqual(["2026-10-01"]);
    expect(m.scheduled.length).toBe(4);
    const settled = (await ana.json<View>("/api/daily/2026-10-01")).body;
    expect(settled.status).toBe("settled");
    expect(settled.split).toBeNull();
    expect(settled.grade).toMatchObject({ status: "ungraded", score: null, baselineShare: null });
    // the next day's challenge exists and did not repeat the question
    const next = (await ana.json<View>("/api/daily")).body;
    expect(next.dateKey).toBe("2026-10-02");
    expect(next.question?.versionId).not.toBe(v.question?.versionId);
  });

  it("shares reveal the sharer's answer only after the viewer answers, and can be revoked", async () => {
    const ana = new Client("ana");
    const v = await today(ana);
    expect((await ana.json("/api/daily/2026-10-01/share", { method: "POST", body: "{}" })).status).toBe(409);
    await submit(ana, v, "o2", 30);
    const share = await ana.json<{ token: string }>("/api/daily/2026-10-01/share", { method: "POST", body: "{}" });
    expect(share.status).toBe(200);
    const ben = new Client("ben");
    type ShareView = View & { share: { revealed: boolean; sharerOptionId: string | null; isOwner: boolean } };
    let sv = (await ben.json<ShareView>(`/api/daily/share/${share.body.token}`)).body;
    expect(sv.share).toEqual({ revealed: false, sharerOptionId: null, isOwner: false });
    expect(sv.question).not.toBeNull();
    await submit(ben, sv, "o1", 50);
    sv = (await ben.json<ShareView>(`/api/daily/share/${share.body.token}`)).body;
    expect(sv.share.revealed).toBe(true);
    expect(sv.share.sharerOptionId).toBe("o2");
    await ana.json(`/api/daily/2026-10-01/share/${share.body.token}`, { method: "DELETE" });
    expect((await ben.json(`/api/daily/share/${share.body.token}`)).status).toBe(404);
    expect((await ben.json(`/api/daily/share/not-a-token`)).status).toBe(404);
  });

  it("history lists attempts and a reset unlinks them from the browser", async () => {
    const ana = new Client("ana");
    const v = await today(ana);
    await submit(ana, v, "o1", 55);
    const h = await ana.json<{ attempts: unknown[] }>("/api/daily/history");
    expect(h.body.attempts.length).toBe(1);
    await ana.json("/api/daily/history", { method: "DELETE" });
    expect((await ana.json<{ attempts: unknown[] }>("/api/daily/history")).body.attempts.length).toBe(0);
    const cohort = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_attempt WHERE date_key = '2026-10-01'").first<{ n: number }>();
    expect(cohort?.n).toBe(1); // the cohort keeps the anonymous vote
  });
});
