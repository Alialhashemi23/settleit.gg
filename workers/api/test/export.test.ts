import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { applyExport, type RoomExportEvent } from "../src/export";

describe("applyExport", () => {
  const base: RoomExportEvent = {
    kind: "round_completed", eventId: "ROOM-1:r1", roomCode: "ROOM-1", roundId: "r1", seq: 1,
    versionId: "q002v1", variant: false,
    final: { kind: "majority", leaders: ["o1"], counts: { o1: 2, o2: 1, o3: 0 }, total: 3 },
    changedMinds: 0, bothVotes: 0, finalVotes: { a1: "o1", a2: "o1", a3: "o2" }, completedAt: 1_000, isTest: false,
  };

  it("applies once and treats replays as duplicates", async () => {
    expect(await applyExport(env.DB, base)).toBe("applied");
    expect(await applyExport(env.DB, base)).toBe("duplicate");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution WHERE version_id = 'q002v1'").first<{ n: number }>();
    expect(n?.n).toBe(3);
  });

  it("newer contributions replace older ones, stale replays never overwrite newer state", async () => {
    await applyExport(env.DB, base);
    const newer = { ...base, eventId: "ROOM-2:r9", roomCode: "ROOM-2", roundId: "r9", completedAt: 5_000, finalVotes: { a1: "o3" } };
    await applyExport(env.DB, newer);
    const older = { ...base, eventId: "ROOM-3:r0", roomCode: "ROOM-3", roundId: "r0", completedAt: 500, finalVotes: { a1: "o2" } };
    await applyExport(env.DB, older);
    const row = await env.DB.prepare("SELECT option_id, updated_at FROM contribution WHERE actor_id = 'a1' AND version_id = 'q002v1'").first<{ option_id: string; updated_at: number }>();
    expect(row).toEqual({ option_id: "o3", updated_at: 5_000 });
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution WHERE version_id = 'q002v1'").first<{ n: number }>();
    expect(total?.n).toBe(3); // still three distinct actors
  });

  it("variant rounds record an outcome but no contributions", async () => {
    await applyExport(env.DB, { ...base, eventId: "V:1", variant: true, versionId: null, finalVotes: {} });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution").first<{ n: number }>();
    expect(n?.n).toBe(0);
    const o = await env.DB.prepare("SELECT variant FROM round_outcome WHERE event_id = 'V:1'").first<{ variant: number }>();
    expect(o?.variant).toBe(1);
  });
});
