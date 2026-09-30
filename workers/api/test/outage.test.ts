import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIMING } from "@settleit/core";
import { flushExports, roomStub, startedRoom } from "./helpers";
import { runDurableObjectAlarm } from "cloudflare:test";

const T = DEFAULT_TIMING;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("D1 outage during export", () => {
  it("the room keeps playing and results catch up exactly once after recovery", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben"]);
    const [ana, ben] = clients;
    const round = snapshot.round!;

    // Break D1 for everyone (the DO shares the D1Database prototype in this isolate).
    const proto = Object.getPrototypeOf(env.DB) as { batch: (...a: unknown[]) => Promise<unknown> };
    const original = proto.batch;
    let failures = 0;
    const spy = vi.spyOn(proto, "batch").mockImplementation(function () {
      failures++;
      return Promise.reject(new Error("D1_ERROR: simulated outage"));
    });

    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    const r = await ben!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    expect(r.body.result.ok).toBe(true);
    expect(r.body.snapshot.round!.phase).toBe("discuss"); // gameplay unaffected
    vi.setSystemTime(Date.now() + T.discussMs + 10);
    await runDurableObjectAlarm(roomStub(code));
    const s = await ana!.snapshot(code);
    expect(s.round!.phase).toBe("verdict");
    expect(s.roundsCompleted).toBe(1);
    expect(await flushExports(code)).toBeGreaterThan(0); // still queued locally
    expect(failures).toBeGreaterThan(0);
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM round_outcome WHERE room_code = ?").bind(code).first<{ n: number }>();
    expect(before?.n).toBe(0);

    // Next question still deals while D1 is down.
    vi.setSystemTime(Date.now() + T.verdictMs + 10);
    await runDurableObjectAlarm(roomStub(code));
    expect((await ana!.snapshot(code)).round!.roundNumber).toBe(2);

    // D1 recovers: backoff has to elapse before the next attempt, then everything lands once.
    spy.mockRestore();
    proto.batch = original;
    vi.setSystemTime(Date.now() + 60 * 60_000);
    await runDurableObjectAlarm(roomStub(code));
    expect(await flushExports(code)).toBe(0);
    await flushExports(code); // a second sweep must not double-apply
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM round_outcome WHERE room_code = ?").bind(code).first<{ n: number }>();
    expect(after?.n).toBe(1);
    const contribs = await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution WHERE version_id = ?").bind(round.ballot.versionId).first<{ n: number }>();
    expect(contribs?.n).toBe(2);
    const receipts = await env.DB.prepare("SELECT COUNT(*) AS n FROM export_receipt WHERE room_code = ?").bind(code).first<{ n: number }>();
    expect(receipts?.n).toBe(2);
  });
});
