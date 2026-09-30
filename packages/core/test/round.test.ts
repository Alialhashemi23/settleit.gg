import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING } from "../src/config.ts";
import { advanceRound, applyRoundCommand, canVote, createRound, isRoundFinished, majorityThreshold } from "../src/round.ts";
import type { Ballot, RoundState } from "../src/types.ts";

const ballot: Ballot = {
  questionId: "q002", versionId: "q002v1", prompt: "Best starter?",
  options: [{ id: "o1", text: "Charmander" }, { id: "o2", text: "Bulbasaur" }, { id: "o3", text: "Squirtle" }],
  tags: ["gaming"], spoiler: false, variant: false, source: "library",
};
const T = DEFAULT_TIMING;
const players = ["p1", "p2", "p3", "p4", "p5"];

function fresh(now = 1_000_000): RoundState {
  return createRound({ roundId: "r1", roundNumber: 1, ballot, eligible: players, now });
}
function vote(s: RoundState, actor: string, opt: string, now: number, rev = s.ballotRevision) {
  return applyRoundCommand(s, { type: "vote", actorId: actor, optionId: opt, ballotRevision: rev }, now);
}

describe("majorityThreshold", () => {
  it("is strictly more than half", () => {
    expect(majorityThreshold(1)).toBe(1);
    expect(majorityThreshold(2)).toBe(2);
    expect(majorityThreshold(3)).toBe(2);
    expect(majorityThreshold(4)).toBe(3);
    expect(majorityThreshold(5)).toBe(3);
  });
});

describe("vote phase", () => {
  it("accepts and changes votes while open, rejecting outsiders and bad options", () => {
    let s = fresh();
    let r = vote(s, "p1", "o1", s.phaseStartedAt + 1000);
    expect(r.error).toBeUndefined();
    expect(r.events[0]).toMatchObject({ type: "vote_accepted", changed: false });
    r = vote(r.state, "p1", "o2", s.phaseStartedAt + 2000);
    expect(r.events[0]).toMatchObject({ type: "vote_accepted", changed: true });
    expect(r.state.initialVotes.p1?.optionId).toBe("o2");
    expect(vote(r.state, "stranger", "o1", 0).error).toBe("not_eligible");
    expect(vote(r.state, "p2", "nope", s.phaseStartedAt + 1).error).toBe("invalid_option");
    expect(vote(r.state, "p2", "o1", s.phaseStartedAt + 1, 2).error).toBe("stale_ballot_revision");
  });

  it("re-submitting the same vote is a no-op success", () => {
    const s = fresh();
    const a = vote(s, "p1", "o1", s.phaseStartedAt + 10);
    const b = vote(a.state, "p1", "o1", s.phaseStartedAt + 20);
    expect(b.error).toBeUndefined();
    expect(b.state.initialVotes.p1?.at).toBe(s.phaseStartedAt + 10);
  });

  it("closes early when every eligible player has voted", () => {
    let s = fresh();
    const t0 = s.phaseStartedAt;
    for (const [i, p] of players.entries()) s = vote(s, p, i < 3 ? "o1" : "o2", t0 + 100 * (i + 1)).state;
    expect(s.phase).toBe("discuss");
    expect(s.deadline).toBe(t0 + 500 + T.discussMs);
  });

  it("moves to discuss at the deadline even with absent voters, and rejects late votes", () => {
    let s = fresh();
    s = vote(s, "p1", "o1", s.phaseStartedAt + 5).state;
    const late = s.deadline + 1;
    const r = vote(s, "p2", "o2", late);
    expect(r.error).toBe("phase_closed");
    expect(r.state.phase).toBe("discuss");
    expect(r.state.initialVotes).not.toHaveProperty("p2");
    expect(canVote(r.state, "p2", late)).toBe(false);
  });

  it("a round nobody voted in goes straight to an empty verdict", () => {
    const s = fresh();
    const r = advanceRound(s, s.deadline);
    expect(r.state.phase).toBe("verdict");
    expect(r.state.result?.empty).toBe(true);
    expect(r.state.result?.final.kind).toBe("no_votes");
  });
});

describe("discuss, revote, verdict", () => {
  function inDiscuss() {
    let s = fresh();
    const t0 = s.phaseStartedAt;
    s = vote(s, "p1", "o1", t0 + 1).state;
    s = vote(s, "p2", "o1", t0 + 2).state;
    s = vote(s, "p3", "o2", t0 + 3).state;
    s = vote(s, "p4", "o2", t0 + 4).state;
    s = advanceRound(s, s.deadline).state; // p5 never voted
    expect(s.phase).toBe("discuss");
    return s;
  }

  it("verdict after discussion carries the frozen tally when there was no revote", () => {
    const s = inDiscuss();
    const r = advanceRound(s, s.deadline);
    expect(r.state.phase).toBe("verdict");
    expect(r.state.result?.final.kind).toBe("tie");
    expect(r.state.result?.final.total).toBe(4);
    expect(r.state.result?.revoteHappened).toBe(false);
    expect(r.events.map((e) => e.type)).toEqual(["phase_changed", "round_completed"]);
    expect(isRoundFinished(r.state, r.state.deadline - 1)).toBe(false);
    expect(isRoundFinished(r.state, r.state.deadline)).toBe(true);
  });

  it("more than half of initial voters can trigger one revote; non-voters cannot request", () => {
    let s = inDiscuss();
    const now = s.phaseStartedAt + 1000;
    expect(applyRoundCommand(s, { type: "request_revote", actorId: "p5" }, now).error).toBe("not_a_voter");
    s = applyRoundCommand(s, { type: "request_revote", actorId: "p1" }, now).state;
    s = applyRoundCommand(s, { type: "request_revote", actorId: "p1" }, now).state; // duplicate
    expect(s.phase).toBe("discuss");
    s = applyRoundCommand(s, { type: "request_revote", actorId: "p2" }, now).state;
    expect(s.phase).toBe("discuss"); // 2 of 4 is not a majority
    const r = applyRoundCommand(s, { type: "request_revote", actorId: "p3" }, now);
    expect(r.state.phase).toBe("revote");
    expect(r.state.ballotRevision).toBe(2);
    expect(r.state.deadline).toBe(now + T.revoteMs);
    // stale revision from the initial ballot is rejected during the revote
    expect(vote(r.state, "p1", "o2", now + 1, 1).error).toBe("stale_ballot_revision");
    // a revote replaces the contribution; unchanged voters keep their initial vote
    let s2 = vote(r.state, "p3", "o1", now + 2).state;
    s2 = advanceRound(s2, s2.deadline).state;
    expect(s2.phase).toBe("verdict");
    expect(s2.result?.final.total).toBe(4);
    expect(s2.result?.final.kind).toBe("majority");
    expect(s2.result?.final.leaders).toEqual(["o1"]);
    expect(s2.result?.changedMinds).toEqual(["p3"]);
    expect(s2.result?.revoteHappened).toBe(true);
    expect(s2.result?.initial.kind).toBe("tie");
  });

  it("only one revote per question", () => {
    let s = inDiscuss();
    const now = s.phaseStartedAt + 1;
    for (const p of ["p1", "p2", "p3"]) s = applyRoundCommand(s, { type: "request_revote", actorId: p }, now).state;
    expect(s.phase).toBe("revote");
    expect(applyRoundCommand(s, { type: "request_revote", actorId: "p1" }, now + 1).error).toBe("phase_closed");
  });

  it("revote closes early when every initial voter has revoted", () => {
    let s = inDiscuss();
    const now = s.phaseStartedAt + 1;
    for (const p of ["p1", "p2", "p3"]) s = applyRoundCommand(s, { type: "request_revote", actorId: p }, now).state;
    for (const p of ["p1", "p2", "p3", "p4"]) s = vote(s, p, "o3", now + 2).state;
    expect(s.phase).toBe("verdict");
    expect(s.result?.final.kind).toBe("unanimous");
    expect(s.result?.changedMinds).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("majority of initial voters can extend discussion exactly once", () => {
    let s = inDiscuss();
    const now = s.phaseStartedAt + 1;
    const before = s.deadline;
    for (const p of ["p1", "p2"]) s = applyRoundCommand(s, { type: "request_more_time", actorId: p }, now).state;
    expect(s.deadline).toBe(before);
    const r = applyRoundCommand(s, { type: "request_more_time", actorId: "p3" }, now);
    expect(r.state.deadline).toBe(before + T.extensionMs);
    expect(r.events).toContainEqual({ type: "extension_granted", deadline: before + T.extensionMs });
    expect(applyRoundCommand(r.state, { type: "request_more_time", actorId: "p4" }, now).error).toBe("extension_already_used");
  });

  it("majority can skip a question during voting, producing a skipped verdict with no contributions", () => {
    let s = fresh();
    const now = s.phaseStartedAt + 1;
    for (const p of ["p1", "p2"]) s = applyRoundCommand(s, { type: "request_skip", actorId: p }, now).state;
    expect(s.phase).toBe("vote");
    s = applyRoundCommand(s, { type: "request_skip", actorId: "p3" }, now).state;
    expect(s.phase).toBe("verdict");
    expect(s.result?.skipped).toBe(true);
  });

  it("advancing an already-finished round is a no-op (duplicate alarms)", () => {
    let s = inDiscuss();
    s = advanceRound(s, s.deadline).state;
    const again = advanceRound(s, s.deadline + 100_000);
    expect(again.events).toEqual([]);
    expect(again.state).toEqual(s);
  });

  it("catches up across several missed deadlines in one call", () => {
    let s = fresh();
    s = vote(s, "p1", "o1", s.phaseStartedAt + 1).state;
    const r = advanceRound(s, s.deadline + T.discussMs + 5);
    expect(r.state.phase).toBe("verdict");
    expect(r.events.map((e) => e.type)).toEqual(["phase_changed", "phase_changed", "round_completed"]);
  });
});
