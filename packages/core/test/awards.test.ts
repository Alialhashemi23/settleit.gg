import { describe, expect, it } from "vitest";
import { computeAwards } from "../src/awards.ts";
import { advanceRound, applyRoundCommand, createRound } from "../src/round.ts";
import type { Ballot, RoundState } from "../src/types.ts";

const ballot: Ballot = {
  questionId: "q", versionId: "qv", prompt: "?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
  tags: [], spoiler: false, variant: false, source: "library",
};

function playRound(id: string, votes: Record<string, [string, number]>, revotes?: Record<string, string>): RoundState {
  let s = createRound({ roundId: id, roundNumber: 1, ballot, eligible: Object.keys(votes), now: 0 });
  for (const [p, [o, dt]] of Object.entries(votes)) s = applyRoundCommand(s, { type: "vote", actorId: p, optionId: o, ballotRevision: 1 }, dt).state;
  if (s.phase === "vote") s = advanceRound(s, s.deadline).state;
  if (revotes) {
    const voters = Object.keys(votes);
    for (const p of voters) s = applyRoundCommand(s, { type: "request_revote", actorId: p }, s.phaseStartedAt + 1).state;
    for (const [p, o] of Object.entries(revotes)) s = applyRoundCommand(s, { type: "vote", actorId: p, optionId: o, ballotRevision: 2 }, s.phaseStartedAt + 2).state;
  }
  s = advanceRound(s, s.deadline).state;
  return s;
}

describe("computeAwards", () => {
  it("gives nothing for empty sessions", () => {
    expect(computeAwards([])).toEqual([]);
    const empty = advanceRound(createRound({ roundId: "e", roundNumber: 1, ballot, eligible: ["p1"], now: 0 }), 1e9).state;
    expect(computeAwards([empty])).toEqual([]);
  });

  it("awards Plot Twist to whoever changed most, Great Divide to the closest question, Quick Draw to the fastest", () => {
    const r1 = playRound("r1", { p1: ["a", 500], p2: ["a", 2000], p3: ["b", 900] }, { p3: "a" });
    const r2 = playRound("r2", { p1: ["a", 700], p2: ["b", 1500], p3: ["b", 1000] });
    const r3 = playRound("r3", { p1: ["a", 300], p2: ["b", 100], p3: ["a", 1000] });
    const awards = computeAwards([r1, r2, r3]);
    const byId = Object.fromEntries(awards.map((a) => [a.id, a]));
    expect(byId.plot_twist?.recipients).toEqual(["p3"]);
    expect(byId.great_divide?.roundId).toBe("r2");
    expect(byId.quick_draw?.recipients).toEqual(["p1"]);
    expect(byId.iron_will?.recipients).toEqual(["p1", "p2"]);
    expect(byId.crowd_reader).toBeDefined();
  });

  it("shares awards on ties instead of picking arbitrarily", () => {
    const r1 = playRound("r1", { p1: ["a", 100], p2: ["a", 100], p3: ["b", 100] });
    const r2 = playRound("r2", { p1: ["a", 100], p2: ["a", 100], p3: ["b", 100] });
    const awards = computeAwards([r1, r2]);
    expect(awards.find((a) => a.id === "quick_draw")?.recipients).toEqual(["p1", "p2", "p3"]);
  });
});
