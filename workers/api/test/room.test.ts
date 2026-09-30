import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIMING, ROOM_LIFECYCLE } from "@settleit/core";
import { Client, roomStub, startedRoom } from "./helpers";

const T = DEFAULT_TIMING;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function tick(ms: number, code: string) {
  vi.setSystemTime(Date.now() + ms);
  await runDurableObjectAlarm(roomStub(code));
}

describe("room lifecycle", () => {
  it("creates a room, sets a guest cookie, and lets others join by code", async () => {
    const ana = new Client("ana");
    const snap = await ana.create();
    expect(snap.code).toMatch(/^[A-Z]{4}-\d{4}$/);
    expect(ana.cookie).toMatch(/^sit_session=/);
    expect(snap.status).toBe("lobby");
    expect(snap.members.map((m) => m.nickname)).toEqual(["ana"]);

    const ben = new Client("ben");
    const joined = await ben.join(snap.code);
    expect(joined.status).toBe(200);
    expect(joined.body.snapshot!.members.map((m) => m.nickname)).toEqual(["ana", "ben"]);
    expect(joined.body.snapshot!.me.nickname).toBe("ben");

    const nobody = new Client("x");
    expect((await nobody.join("ZZZZ-0000")).status).toBe(404);
    expect((await nobody.join("bad")).status).toBe(400);
  });

  it("the same browser rejoining keeps one seat (identity is the cookie, not the nickname)", async () => {
    const ana = new Client("ana");
    const snap = await ana.create();
    const again = await ana.join(snap.code);
    expect(again.body.snapshot!.members.length).toBe(1);
    const stranger = new Client("ana"); // same nickname, different browser
    expect((await stranger.join(snap.code)).body.snapshot!.members.length).toBe(2);
    expect((await stranger.snapshot(snap.code)).me.actorId).not.toBe(snap.me.actorId);
  });

  it("starts when two players are ready and deals a library question with fixed eligibility", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben"]);
    expect(snapshot.status).toBe("playing");
    expect(snapshot.round?.phase).toBe("vote");
    expect(snapshot.round?.ballot.source).toBe("library");
    expect(snapshot.round?.eligible.sort()).toEqual([...snapshot.members.map((m) => m.actorId)].sort());
    // Late joiner sees the round but is not eligible until the next one.
    const late = new Client("late");
    const j = await late.join(code);
    expect(j.body.snapshot!.round?.roundId).toBe(snapshot.round!.roundId);
    expect(j.body.snapshot!.members.find((m) => m.nickname === "late")!.eligible).toBe(false);
    const r = await late.command(code, { type: "vote", roundId: snapshot.round!.roundId, ballotRevision: 1, optionId: "o1" });
    expect(r.body.result.ok).toBe(false);
    expect((r.body.result as { error: string }).error).toBe("not_eligible");
    void clients;
  });

  it("accepts votes idempotently and rejects a reused opId with different content", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben", "cy"]);
    const [ana] = clients;
    const round = snapshot.round!;
    const first = await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" }, "op-dup-00000001");
    expect(first.body.result.ok).toBe(true);
    expect(first.body.snapshot.round!.myVote?.optionId).toBe("o1");
    expect(first.body.snapshot.round!.votes).toEqual([{ actorId: snapshot.me.actorId, nickname: "ana", optionId: "o1" }]);

    const retry = await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" }, "op-dup-00000001");
    expect(retry.body.result).toEqual(first.body.result);

    const reused = await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" }, "op-dup-00000001");
    expect(reused.status).toBe(409);

    const changed = await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    expect(changed.body.snapshot.round!.myVote?.optionId).toBe("o2");
    expect(changed.body.snapshot.round!.votes.length).toBe(1);

    const stale = await ana!.command(code, { type: "vote", roundId: "r_old", ballotRevision: 1, optionId: "o2" });
    expect((stale.body.result as { error: string }).error).toBe("stale_round");
  });

  it("membership and accepted votes survive eviction of the Durable Object", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben"]);
    const [ana, ben] = clients;
    const round = snapshot.round!;
    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    const before = await ben!.snapshot(code);
    expect(before.version).toBeGreaterThan(1);

    await runInDurableObject(roomStub(code), (_instance, state) => { state.abort("simulated eviction"); }).catch(() => {});

    const after = await ben!.snapshot(code);
    expect(after.members.map((m) => m.nickname)).toEqual(["ana", "ben"]);
    expect(after.round?.roundId).toBe(round.roundId);
    expect(after.round?.votes).toEqual([{ actorId: snapshot.me.actorId, nickname: "ana", optionId: "o2" }]);
    expect(after.me.actorId).toBe(before.me.actorId);
    const mine = await ana!.snapshot(code);
    expect(mine.round?.myVote?.optionId).toBe("o2");
  });

  it("runs vote → discuss → verdict on deadlines, closes early when everyone voted, and exports once", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben", "cy"]);
    const [ana, ben, cy] = clients;
    const round = snapshot.round!;
    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    await ben!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    const last = await cy!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    expect(last.body.snapshot.round!.phase).toBe("discuss");
    expect(last.body.snapshot.round!.initialOutcome?.kind).toBe("majority");
    // Late vote during discussion is refused.
    const late = await cy!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    expect((late.body.result as { error: string }).error).toBe("phase_closed");

    await tick(T.discussMs + 10, code);
    let s = await ana!.snapshot(code);
    expect(s.round!.phase).toBe("verdict");
    expect(s.round!.result!.final.leaders).toEqual(["o1"]);
    expect(s.roundsCompleted).toBe(1);

    // Duplicate/late alarm cannot complete the round twice.
    await runDurableObjectAlarm(roomStub(code));
    await tick(T.verdictMs + 10, code);
    s = await ana!.snapshot(code);
    expect(s.roundsCompleted).toBe(1);
    expect(s.round!.roundId).not.toBe(round.roundId);
    expect(s.round!.roundNumber).toBe(2);
    expect(s.round!.phase).toBe("vote");

    const outcomes = await env.DB.prepare("SELECT * FROM round_outcome WHERE room_code = ?").bind(code).all();
    expect(outcomes.results.length).toBe(1);
    expect(outcomes.results[0]).toMatchObject({ outcome_kind: "majority", total: 3, variant: 0, version_id: round.ballot.versionId });
    const contribs = await env.DB.prepare("SELECT actor_id, option_id FROM contribution WHERE version_id = ?").bind(round.ballot.versionId).all();
    expect(contribs.results.length).toBe(3);
    const receipts = await env.DB.prepare("SELECT COUNT(*) AS n FROM export_receipt WHERE room_code = ?").bind(code).first<{ n: number }>();
    expect(receipts?.n).toBe(2); // room_status + round_completed
  });

  it("group revote replaces contributions and records changed minds; skipped rounds export nothing", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben", "cy"]);
    const [ana, ben, cy] = clients;
    const round = snapshot.round!;
    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    await ben!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    await cy!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    await ana!.command(code, { type: "request_revote", roundId: round.roundId });
    const rv = await ben!.command(code, { type: "request_revote", roundId: round.roundId });
    expect(rv.body.snapshot.round!.phase).toBe("revote");
    expect(rv.body.snapshot.round!.ballotRevision).toBe(2);
    expect(rv.body.snapshot.round!.votes).toEqual([]);
    const staleRev = await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    expect((staleRev.body.result as { error: string }).error).toBe("stale_ballot_revision");
    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 2, optionId: "o2" });
    await tick(T.revoteMs + 10, code);
    const s = await ana!.snapshot(code);
    expect(s.round!.phase).toBe("verdict");
    expect(s.round!.result!.final.kind).toBe("unanimous");
    expect(s.round!.result!.changedMinds).toEqual([snapshot.me.actorId]);
    const contribs = await env.DB.prepare("SELECT option_id FROM contribution WHERE version_id = ?").bind(round.ballot.versionId).all<{ option_id: string }>();
    expect(contribs.results.map((c) => c.option_id)).toEqual(["o2", "o2", "o2"]);

    // Next round: majority skip.
    await tick(T.verdictMs + 10, code);
    const s2 = await ana!.snapshot(code);
    await ana!.command(code, { type: "request_skip", roundId: s2.round!.roundId });
    const sk = await ben!.command(code, { type: "request_skip", roundId: s2.round!.roundId });
    expect(sk.body.snapshot.round!.phase).toBe("verdict");
    expect(sk.body.snapshot.round!.result!.skipped).toBe(true);
    const outcomes = await env.DB.prepare("SELECT COUNT(*) AS n FROM round_outcome WHERE room_code = ?").bind(code).first<{ n: number }>();
    expect(outcomes?.n).toBe(1);
  });

  it("write-ins make the round a private variant that never reaches public totals", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben"]);
    const [ana, ben] = clients;
    const round = snapshot.round!;
    const w = await ana!.command(code, { type: "write_in", roundId: round.roundId, text: "  Something Else " });
    expect(w.body.result.ok).toBe(true);
    expect(w.body.snapshot.round!.ballot.variant).toBe(true);
    expect(w.body.snapshot.round!.ballot.options.at(-1)).toMatchObject({ id: "w1", text: "Something Else", writeIn: true });
    expect(w.body.snapshot.round!.myVote?.optionId).toBe("w1");
    const dup = await ben!.command(code, { type: "write_in", roundId: round.roundId, text: "something else" });
    expect(dup.body.snapshot.round!.ballot.options.length).toBe(round.ballot.options.length + 1);
    expect(dup.body.snapshot.round!.phase).toBe("discuss"); // both voted → closed early
    await tick(T.discussMs + T.verdictMs + 20, code);
    const rows = await env.DB.prepare("SELECT variant, version_id FROM round_outcome WHERE room_code = ?").bind(code).all();
    expect(rows.results[0]).toMatchObject({ variant: 1, version_id: null });
    const contribs = await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution WHERE version_id = ?").bind(round.ballot.versionId).first<{ n: number }>();
    expect(contribs?.n).toBe(0);
  });

  it("private custom questions deal first and stay private", async () => {
    const ana = new Client("ana");
    const snap = await ana.create();
    const code = snap.code;
    const q = await ana.command(code, { type: "queue_custom", prompt: "Who is bringing snacks?", options: ["Ana", "Ben", "Ben"] });
    expect(q.body.result.ok).toBe(true);
    const ben = new Client("ben");
    await ben.join(code);
    await ana.command(code, { type: "set_ready", ready: true });
    const started = await ben.command(code, { type: "set_ready", ready: true });
    expect(started.body.snapshot.round!.ballot).toMatchObject({ source: "custom", variant: true, prompt: "Who is bringing snacks?" });
    expect(started.body.snapshot.round!.ballot.options.length).toBe(2);
    expect(started.body.snapshot.customQueueLength).toBe(0);
  });

  it("pauses when too few players are active and expires after the idle window; recap stays available", async () => {
    const { clients, code, snapshot } = await startedRoom(["ana", "ben"]);
    const [ana, ben] = clients;
    const round = snapshot.round!;
    await ana!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o1" });
    await ben!.command(code, { type: "vote", roundId: round.roundId, ballotRevision: 1, optionId: "o2" });
    await ben!.command(code, { type: "leave" });
    await tick(T.discussMs + T.verdictMs + 20, code);
    let s = await ana!.snapshot(code);
    expect(s.status).toBe("paused");
    expect(s.pauseReason).toBe("waiting_for_players");
    expect(s.round).toBeNull();
    expect(s.expiresAt).not.toBeNull();
    const recap = await ana!.recap(code);
    expect(recap.body.recap.rounds.length).toBe(1);
    expect(recap.body.recap.rounds[0]!.final.kind).toBe("tie");

    // Ben comes back → play resumes with a fresh question.
    await ben!.join(code);
    s = await ana!.snapshot(code);
    expect(s.status).toBe("playing");
    expect(s.round!.roundNumber).toBe(2);

    // Everyone goes quiet for a long time → room expires.
    vi.setSystemTime(Date.now() + T.voteMs + T.discussMs + T.verdictMs + 100);
    await runDurableObjectAlarm(roomStub(code));
    await tick(ROOM_LIFECYCLE.idlePauseExpiryMs + 1000, code);
    const res = await ana!.json<{ error?: string; snapshot?: { status: string } }>(`/api/rooms/${code}/snapshot`);
    expect(res.body.snapshot?.status).toBe("expired");
    const reg = await env.DB.prepare("SELECT status FROM room_registry WHERE code = ?").bind(code).first<{ status: string }>();
    expect(reg?.status).toBe("expired");
  });

  it("caps the room at the launch maximum", async () => {
    const ana = new Client("ana");
    const { code } = await ana.create();
    for (let i = 0; i < 11; i++) expect((await new Client(`p${i}`).join(code)).status).toBe(200);
    const extra = await new Client("extra").join(code);
    expect(extra.status).toBe(409);
    expect(extra.body.error).toBe("room_full");
  });
});
