import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCookie } from "../src/auth";
import { applyExport } from "../src/export";
import { Client, BASE } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function seedContributions(versionId: string, n: number, split: (i: number) => string, at = Date.now()) {
  const finalVotes: Record<string, string> = {};
  for (let i = 0; i < n; i++) finalVotes[`actor${i}`] = split(i);
  await applyExport(env.DB, {
    kind: "round_completed", eventId: `SEED:${versionId}:${n}`, roomCode: "SEED-0001", roundId: `r${n}`, seq: 1, versionId, variant: false,
    final: { kind: "leading", leaders: ["o1"], counts: {}, total: n }, changedMinds: 2, bothVotes: n, finalVotes, completedAt: at, isTest: false,
  });
}

describe("public stats", () => {
  it("withholds percentages below the sample threshold and publishes above it", async () => {
    await seedContributions("q002v1", 25, (i) => (i % 5 === 0 ? "o2" : "o1"));
    await seedContributions("q003v1", 4, () => "o1");
    const c = new Client("viewer");
    const list = await c.json<{ topics: { versionId: string; total: number; published: boolean }[]; minSample: number }>("/api/stats/topics");
    expect(list.status).toBe(200);
    expect(list.body.topics[0]).toMatchObject({ versionId: "q002v1", total: 25, published: true });
    expect(list.body.topics[1]).toMatchObject({ versionId: "q003v1", total: 4, published: false });

    const big = await c.json<{ options: { id: string; count: number; percent: number | null }[]; total: number; sources: Record<string, number>; rounds: { played: number } }>("/api/stats/topics/q002v1");
    expect(big.body.total).toBe(25);
    expect(big.body.options.find((o) => o.id === "o1")?.percent).toBe(80);
    expect(big.body.sources.group).toBe(25);
    expect(big.body.rounds.played).toBe(1);
    const small = await c.json<{ options: { percent: number | null }[]; published: boolean }>("/api/stats/topics/q003v1");
    expect(small.body.published).toBe(false);
    expect(small.body.options.every((o) => o.percent === null)).toBe(true);
    expect((await c.json("/api/stats/topics/nope")).status).toBe(404);
  });

  it("home cards use real data and honest empty states", async () => {
    const c = new Client("viewer");
    const empty = await c.json<{ mostDebated: unknown[]; closestCalls: unknown[]; changedMinds: { percent: number | null }; todaysSplit: unknown }>("/api/stats/home");
    expect(empty.body.mostDebated).toEqual([]);
    expect(empty.body.closestCalls).toEqual([]);
    expect(empty.body.changedMinds.percent).toBeNull();
    expect(empty.body.todaysSplit).toBeNull();

    await seedContributions("q002v1", 30, (i) => (i % 2 === 0 ? "o1" : "o2"));
    const full = await c.json<{ mostDebated: { versionId: string; total: number }[]; closestCalls: { versionId: string; gapPoints: number }[]; changedMinds: { percent: number | null } }>("/api/stats/home");
    expect(full.body.mostDebated[0]).toMatchObject({ versionId: "q002v1", total: 30 });
    expect(full.body.closestCalls[0]).toMatchObject({ versionId: "q002v1", gapPoints: 0 });
    expect(full.body.changedMinds.percent).toBeCloseTo(6.7, 1);
  });
});

describe("admin", () => {
  async function adminClient(login = "owner") {
    const c = new Client("admin");
    const cookie = await adminCookie(new Request(BASE + "/"), env, login);
    c.cookie = cookie.split(";")[0]!;
    return c;
  }

  it("denies anonymous and non-allow-listed users", async () => {
    const anon = new Client("anon");
    expect((await anon.json("/api/admin/overview")).status).toBe(401);
    expect((await anon.json<{ admin: string | null }>("/api/admin/me")).body.admin).toBeNull();
    const stranger = await adminClient("someone-else");
    expect((await stranger.json("/api/admin/overview")).status).toBe(401);
    expect((await stranger.json("/api/admin/questions", { method: "PATCH", body: "{}" })).status).toBe(401);
  });

  it("reports an overview that reconciles with known actions", async () => {
    const admin = await adminClient();
    // Known actions: 3 page views from 2 browsers, one daily submission, one exported round.
    const a = new Client("a");
    const b = new Client("b");
    await a.json("/api/session");
    await b.json("/api/session");
    await a.json("/api/telemetry", { method: "POST", body: JSON.stringify({ events: [{ id: "pv1", name: "page_view", sessionId: "s1" }, { id: "pv2", name: "page_view", sessionId: "s1" }, { id: "pv1", name: "page_view", sessionId: "s1" }] }) });
    await b.json("/api/telemetry", { method: "POST", body: JSON.stringify({ events: [{ id: "pv3", name: "page_view", sessionId: "s2" }, { id: "rs1", name: "resume_succeeded", props: { latencyMs: 1200 } }] }) });
    const v = (await a.json<{ dateKey: string }>("/api/daily")).body;
    await a.json("/api/daily/submit", { method: "POST", body: JSON.stringify({ dateKey: v.dateKey, optionId: "o1", prediction: 40 }) });
    await seedContributions("q005v1", 3, () => "o1");
    const o = await admin.json<{ totals: Record<string, number | null>; series: { day: string; visitors: number; visits: number }[] }>("/api/admin/overview?days=3&includeTest=1");
    expect(o.status).toBe(200);
    expect(o.body.totals.visitors).toBe(2);
    expect(o.body.totals.starters).toBe(4); // 1 daily + 3 exported voters
    expect(o.body.totals.roundsCompleted).toBe(1);
    expect(o.body.totals.dailySubmitted).toBe(1);
    expect(o.body.totals.resumeUnder3sPercent).toBe(100);
    expect(o.body.series.at(-1)?.visits).toBe(2);
    // The same counts are test traffic in this environment, so the default view hides them.
    const prod = await admin.json<{ totals: Record<string, number> }>("/api/admin/overview?days=3");
    expect(prod.body.totals.dailySubmitted).toBe(0);
  });

  it("edits the library with immutable versions and an audit trail", async () => {
    const admin = await adminClient();
    const created = await admin.json<{ id: string; versionId: string }>("/api/admin/questions", { method: "POST", body: JSON.stringify({ prompt: "Best sandwich?", options: ["BLT", "Club", "Club"] }) });
    expect(created.status).toBe(400);
    const ok = await admin.json<{ id: string; versionId: string }>("/api/admin/questions", { method: "POST", body: JSON.stringify({ prompt: "Best sandwich?", options: ["BLT", "Club"], tags: ["food"], topic: "food" }) });
    expect(ok.status).toBe(201);
    expect(ok.body.id).toBe("q211");
    const noNote = await admin.json(`/api/admin/questions/${ok.body.id}/version`, { method: "POST", body: JSON.stringify({ prompt: "Best sandwich ever?", options: ["BLT", "Club", "Reuben"] }) });
    expect(noNote.status).toBe(400);
    const v2 = await admin.json<{ versionId: string }>(`/api/admin/questions/${ok.body.id}/version`, { method: "POST", body: JSON.stringify({ prompt: "Best sandwich ever?", options: ["BLT", "Club", "Reuben"], note: "added Reuben" }) });
    expect(v2.body.versionId).toBe("q211v2");
    const v1 = await env.DB.prepare("SELECT prompt FROM question_version WHERE version_id = 'q211v1'").first<{ prompt: string }>();
    expect(v1?.prompt).toBe("Best sandwich?");
    await admin.json(`/api/admin/questions/${ok.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "retired", note: "testing" }) });
    const list = await admin.json<{ questions: { id: string; status: string; version_id: string }[] }>("/api/admin/questions");
    expect(list.body.questions.find((q) => q.id === "q211")).toMatchObject({ status: "retired", version_id: "q211v2" });
    const auditLog = await admin.json<{ entries: { action: string }[] }>("/api/admin/audit");
    expect(auditLog.body.entries.map((e) => e.action)).toEqual(["question_update", "question_version", "question_create"]);
  });

  it("schedules future dailies, refuses to change a live one, and manages featured cards", async () => {
    const admin = await adminClient();
    expect((await admin.json("/api/admin/daily/2026-10-05", { method: "PUT", body: JSON.stringify({ versionId: "q010v1" }) })).status).toBe(200);
    await new Client("x").json("/api/daily"); // opens today
    expect((await admin.json("/api/admin/daily/2026-10-01", { method: "PUT", body: JSON.stringify({ versionId: "q010v1" }) })).status).toBe(409);
    const days = await admin.json<{ days: { date_key: string; version_id: string; effectiveStatus: string }[] }>("/api/admin/daily");
    expect(days.body.days.find((d) => d.date_key === "2026-10-05")).toMatchObject({ version_id: "q010v1", effectiveStatus: "scheduled" });
    expect((await admin.json("/api/admin/featured", { method: "PUT", body: JSON.stringify({ slot: "hero", versionId: "q010v1", note: "pinned" }) })).status).toBe(200);
    expect((await admin.json("/api/admin/featured", { method: "PUT", body: JSON.stringify({ slot: "hero", versionId: "nope" }) })).status).toBe(400);
    const home = await new Client("v").json<{ featured: { slot: string; prompt: string }[] }>("/api/stats/home");
    expect(home.body.featured[0]).toMatchObject({ slot: "hero", prompt: "Best Halo?" });
    const ops = await admin.json<{ upcomingDailies: unknown[]; freshness: { lastTelemetryAt: number | null } }>("/api/admin/ops");
    expect(ops.status).toBe(200);
    expect(ops.body.upcomingDailies.length).toBeGreaterThanOrEqual(2);
  });

  it("owner test mode tags traffic as test", async () => {
    const admin = await adminClient();
    const res = await admin.fetch("/api/admin/test-mode", { method: "POST", body: JSON.stringify({ enabled: true }) });
    expect(res.headers.get("set-cookie")).toContain("sit_test=1");
    const me = await admin.json<{ testMode: boolean }>("/api/admin/me");
    expect(me.body.testMode).toBe(true);
    const off = await admin.fetch("/api/admin/test-mode", { method: "POST", body: JSON.stringify({ enabled: false }) });
    expect(off.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await admin.json<{ testMode: boolean }>("/api/admin/me")).body.testMode).toBe(false);
  });
});
