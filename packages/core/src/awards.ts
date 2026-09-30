import { margin } from "./outcome.ts";
import type { ActorId, RoundState } from "./types.ts";

export interface Award {
  id: "plot_twist" | "great_divide" | "quick_draw" | "crowd_reader" | "iron_will";
  title: string;
  description: string;
  /** Recipients share the award on ties. Empty for question awards. */
  recipients: ActorId[];
  /** For question awards: the round it refers to. */
  roundId?: string;
}

/**
 * Playful, non-ranked session awards computed only from recorded actions.
 * Empty or skipped rounds never count. Nothing here infers persuasion.
 */
export function computeAwards(rounds: readonly RoundState[]): Award[] {
  const completed = rounds.filter((r) => r.result && !r.result.empty && !r.result.skipped);
  const awards: Award[] = [];
  if (completed.length === 0) return awards;

  // Plot Twist: most changed votes between initial and final tally.
  const changes = new Map<ActorId, number>();
  for (const r of completed) for (const a of r.result!.changedMinds) changes.set(a, (changes.get(a) ?? 0) + 1);
  const topChanges = Math.max(0, ...changes.values());
  if (topChanges > 0) {
    awards.push({
      id: "plot_twist",
      title: "Plot Twist",
      description: `Changed their vote ${topChanges === 1 ? "once" : `${topChanges} times`} after hearing the room out.`,
      recipients: [...changes.entries()].filter(([, n]) => n === topChanges).map(([a]) => a).sort(),
    });
  }

  // Great Divide: closest final tally with at least two voters and no unanimity.
  let closest: RoundState | null = null;
  let closestMargin = Infinity;
  for (const r of completed) {
    const f = r.result!.final;
    if (f.total < 2 || f.kind === "unanimous") continue;
    const m = margin(f);
    if (m < closestMargin || (m === closestMargin && closest && f.total > closest.result!.final.total)) {
      closest = r;
      closestMargin = m;
    }
  }
  if (closest) {
    awards.push({
      id: "great_divide",
      title: "Great Divide",
      description: closestMargin === 0 ? "The question that ended in a dead tie." : `The closest call of the session (decided by ${closestMargin}).`,
      recipients: [],
      roundId: closest.roundId,
    });
  }

  // Quick Draw: fastest average first-vote time, needs at least two votes.
  const latency = new Map<ActorId, number[]>();
  for (const r of completed) {
    for (const [a, v] of Object.entries(r.initialVotes)) {
      const arr = latency.get(a) ?? [];
      arr.push(Math.max(0, v.at - r.startedAt));
      latency.set(a, arr);
    }
  }
  let bestAvg = Infinity;
  const quick: ActorId[] = [];
  for (const [a, arr] of latency) {
    if (arr.length < 2) continue;
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    if (avg < bestAvg - 1e-9) { bestAvg = avg; quick.length = 0; quick.push(a); }
    else if (Math.abs(avg - bestAvg) < 1e-9) quick.push(a);
  }
  if (quick.length > 0) {
    awards.push({
      id: "quick_draw",
      title: "Quick Draw",
      description: `Fastest on the buzzer, averaging ${(bestAvg / 1000).toFixed(1)}s per answer.`,
      recipients: quick.sort(),
    });
  }

  if (completed.length >= 3) {
    // Crowd Reader: most often on the winning side of the final tally (ties count as winning for leaders).
    const onSide = new Map<ActorId, number>();
    const played = new Map<ActorId, number>();
    for (const r of completed) {
      const leaders = new Set(r.result!.final.leaders);
      for (const [a, v] of Object.entries(r.result!.finalVotes)) {
        played.set(a, (played.get(a) ?? 0) + 1);
        if (leaders.has(v.optionId)) onSide.set(a, (onSide.get(a) ?? 0) + 1);
      }
    }
    let bestRatio = 0;
    let crowd: ActorId[] = [];
    for (const [a, n] of played) {
      if (n < 3) continue;
      const ratio = (onSide.get(a) ?? 0) / n;
      if (ratio > bestRatio + 1e-9) { bestRatio = ratio; crowd = [a]; }
      else if (Math.abs(ratio - bestRatio) < 1e-9) crowd.push(a);
    }
    if (crowd.length > 0 && bestRatio > 0) {
      awards.push({
        id: "crowd_reader",
        title: "Crowd Reader",
        description: `Landed on the room's side ${Math.round(bestRatio * 100)}% of the time.`,
        recipients: crowd.sort(),
      });
    }

    // Iron Will: voted in every completed round and never changed a vote.
    const changed = new Set(completed.flatMap((r) => r.result!.changedMinds));
    const iron = [...played.entries()]
      .filter(([a, n]) => n === completed.length && !changed.has(a))
      .map(([a]) => a)
      .sort();
    if (iron.length > 0 && iron.length < played.size) {
      awards.push({
        id: "iron_will",
        title: "Iron Will",
        description: "Answered every question and never budged.",
        recipients: iron,
      });
    }
  }

  return awards;
}
