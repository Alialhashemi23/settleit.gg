import type { ActorId, BallotOption, OptionId, Outcome, VoteRecord } from "./types.ts";

/**
 * Honest outcome labelling for 2–6 options:
 *  - more than 50% of submitted votes → majority (all votes → unanimous, only with ≥2 votes)
 *  - a unique leader at or below 50% → leading
 *  - equal leaders → tie
 *  - no votes → no_votes
 * Abstentions and absent players are not part of the denominator.
 */
export function computeOutcome(
  votes: Record<ActorId, VoteRecord>,
  options: readonly BallotOption[],
): Outcome {
  const counts: Record<OptionId, number> = {};
  for (const o of options) counts[o.id] = 0;
  let total = 0;
  for (const v of Object.values(votes)) {
    if (!(v.optionId in counts)) continue;
    counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    total += 1;
  }
  if (total === 0) return { kind: "no_votes", leaders: [], counts, total };

  let top = 0;
  for (const c of Object.values(counts)) if (c > top) top = c;
  const leaders = options.map((o) => o.id).filter((id) => counts[id] === top);

  if (leaders.length > 1) return { kind: "tie", leaders, counts, total };
  if (top === total && total >= 2) return { kind: "unanimous", leaders, counts, total };
  if (top * 2 > total) return { kind: "majority", leaders, counts, total };
  return { kind: "leading", leaders, counts, total };
}

/** Actors present in both tallies whose option changed. */
export function changedMinds(
  initial: Record<ActorId, VoteRecord>,
  final: Record<ActorId, VoteRecord>,
): ActorId[] {
  const out: ActorId[] = [];
  for (const [actor, v] of Object.entries(initial)) {
    const f = final[actor];
    if (f && f.optionId !== v.optionId) out.push(actor);
  }
  return out.sort();
}

/** Margin between the top two options, in votes. 0 for ties. */
export function margin(outcome: Outcome): number {
  const sorted = Object.values(outcome.counts).sort((a, b) => b - a);
  return (sorted[0] ?? 0) - (sorted[1] ?? 0);
}

export function describeOutcome(outcome: Outcome, options: readonly BallotOption[]): string {
  const name = (id: OptionId) => options.find((o) => o.id === id)?.text ?? id;
  const lead = outcome.leaders[0];
  switch (outcome.kind) {
    case "no_votes":
      return "Nobody voted.";
    case "unanimous":
      return `Unanimous: all ${outcome.total} picked ${name(lead!)}`;
    case "majority":
      return `${outcome.counts[lead!]} of ${outcome.total} picked ${name(lead!)}`;
    case "leading":
      return `${name(lead!)} leads with ${outcome.counts[lead!]} of ${outcome.total}. No majority.`;
    case "tie":
      return `Tie between ${outcome.leaders.map(name).join(" and ")} (${outcome.counts[lead!]} each of ${outcome.total}).`;
  }
}
