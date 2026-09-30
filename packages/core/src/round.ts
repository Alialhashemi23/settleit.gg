import { DEFAULT_TIMING, type RoundTiming } from "./config.ts";
import { changedMinds, computeOutcome } from "./outcome.ts";
import type { ActorId, Ballot, OptionId, RoundResult, RoundState, VoteRecord } from "./types.ts";

export type RoundCommand =
  | { type: "vote"; actorId: ActorId; optionId: OptionId; ballotRevision: number }
  | { type: "request_revote"; actorId: ActorId }
  | { type: "request_more_time"; actorId: ActorId }
  | { type: "request_skip"; actorId: ActorId };

export type RoundError =
  | "not_eligible"
  | "phase_closed"
  | "deadline_passed"
  | "invalid_option"
  | "stale_ballot_revision"
  | "revote_already_used"
  | "extension_already_used"
  | "not_a_voter";

export type RoundEvent =
  | { type: "vote_accepted"; actorId: ActorId; optionId: OptionId; changed: boolean }
  | { type: "phase_changed"; from: RoundState["phase"]; to: RoundState["phase"]; deadline: number }
  | { type: "extension_granted"; deadline: number }
  | { type: "round_completed"; result: RoundResult };

export interface ApplyResult {
  state: RoundState;
  events: RoundEvent[];
  error?: RoundError;
}

export function createRound(input: {
  roundId: string;
  roundNumber: number;
  ballot: Ballot;
  eligible: ActorId[];
  now: number;
  timing?: RoundTiming;
}): RoundState {
  const timing = input.timing ?? DEFAULT_TIMING;
  return {
    roundId: input.roundId,
    roundNumber: input.roundNumber,
    ballot: input.ballot,
    phase: "vote",
    startedAt: input.now,
    phaseStartedAt: input.now,
    deadline: input.now + timing.voteMs,
    eligible: [...new Set(input.eligible)].sort(),
    ballotRevision: 1,
    initialVotes: {},
    revoteVotes: {},
    revoteRequests: [],
    revoteUsed: false,
    moreTimeRequests: [],
    extensionUsed: false,
    skipRequests: [],
    result: null,
  };
}

/** Majority-of-group threshold: strictly more than half. */
export function majorityThreshold(groupSize: number): number {
  return Math.floor(groupSize / 2) + 1;
}

/** Initial voters if anyone has voted, otherwise the eligible set. */
function collectiveGroup(state: RoundState): ActorId[] {
  const voters = Object.keys(state.initialVotes);
  return voters.length > 0 ? voters : state.eligible;
}

export function finalVotesOf(state: RoundState): Record<ActorId, VoteRecord> {
  return { ...state.initialVotes, ...state.revoteVotes };
}

function clone(state: RoundState): RoundState {
  return {
    ...state,
    eligible: [...state.eligible],
    initialVotes: { ...state.initialVotes },
    revoteVotes: { ...state.revoteVotes },
    revoteRequests: [...state.revoteRequests],
    moreTimeRequests: [...state.moreTimeRequests],
    skipRequests: [...state.skipRequests],
  };
}

function toVerdict(state: RoundState, now: number, timing: RoundTiming, skipped: boolean): RoundEvent[] {
  const initial = computeOutcome(state.initialVotes, state.ballot.options);
  const finalVotes = finalVotesOf(state);
  const final = state.revoteUsed ? computeOutcome(finalVotes, state.ballot.options) : initial;
  const result: RoundResult = {
    initial,
    final,
    finalVotes,
    changedMinds: state.revoteUsed ? changedMinds(state.initialVotes, finalVotes) : [],
    revoteHappened: state.revoteUsed,
    skipped,
    empty: final.total === 0,
    completedAt: now,
  };
  const from = state.phase;
  state.phase = "verdict";
  state.phaseStartedAt = now;
  state.deadline = now + timing.verdictMs;
  state.result = result;
  return [
    { type: "phase_changed", from, to: "verdict", deadline: state.deadline },
    { type: "round_completed", result },
  ];
}

/**
 * Advance the round if a deadline passed or a phase completed early.
 * Safe to call repeatedly (alarm + every command/snapshot). Returns the
 * events produced; an empty list means nothing was due.
 */
export function advanceRound(input: RoundState, now: number, timing: RoundTiming = DEFAULT_TIMING): ApplyResult {
  const state = clone(input);
  const events: RoundEvent[] = [];
  // Loop because several deadlines may have passed while the object slept.
  for (let guard = 0; guard < 4; guard++) {
    if (state.phase === "verdict") break;
    const due = now >= state.deadline;
    // When a deadline was missed (object slept), the transition is dated at the
    // stored deadline so later phases keep their intended length.
    const at = due ? state.deadline : now;
    if (state.phase === "vote") {
      const everyoneVoted = state.eligible.length > 0 && state.eligible.every((a) => a in state.initialVotes);
      if (!due && !everyoneVoted) break;
      if (Object.keys(state.initialVotes).length === 0) {
        events.push(...toVerdict(state, at, timing, false));
        break;
      }
      state.phase = "discuss";
      state.phaseStartedAt = at;
      state.deadline = at + timing.discussMs;
      events.push({ type: "phase_changed", from: "vote", to: "discuss", deadline: state.deadline });
      continue;
    }
    if (state.phase === "discuss") {
      if (!due) break;
      events.push(...toVerdict(state, at, timing, false));
      break;
    }
    if (state.phase === "revote") {
      const group = Object.keys(state.initialVotes);
      const everyoneRevoted = group.every((a) => a in state.revoteVotes);
      if (!due && !everyoneRevoted) break;
      events.push(...toVerdict(state, at, timing, false));
      break;
    }
  }
  return { state, events };
}

/** True once the verdict display time has elapsed and the session may deal the next question. */
export function isRoundFinished(state: RoundState, now: number): boolean {
  return state.phase === "verdict" && now >= state.deadline;
}

export function applyRoundCommand(
  input: RoundState,
  cmd: RoundCommand,
  now: number,
  timing: RoundTiming = DEFAULT_TIMING,
): ApplyResult {
  // Always settle overdue deadlines first so a late vote cannot land in a closed phase.
  const advanced = advanceRound(input, now, timing);
  const state = advanced.state;
  const events = [...advanced.events];
  const fail = (error: RoundError): ApplyResult => ({ state, events, error });

  if (!state.eligible.includes(cmd.actorId)) return fail("not_eligible");

  switch (cmd.type) {
    case "vote": {
      if (state.phase !== "vote" && state.phase !== "revote") return fail("phase_closed");
      if (cmd.ballotRevision !== state.ballotRevision) return fail("stale_ballot_revision");
      if (now >= state.deadline) return fail("deadline_passed");
      if (!state.ballot.options.some((o) => o.id === cmd.optionId)) return fail("invalid_option");
      const bucket = state.phase === "vote" ? state.initialVotes : state.revoteVotes;
      const previous = bucket[cmd.actorId]?.optionId;
      if (previous === cmd.optionId) {
        // Idempotent re-submission of the same choice.
        return { state, events: [...events, { type: "vote_accepted", actorId: cmd.actorId, optionId: cmd.optionId, changed: false }] };
      }
      bucket[cmd.actorId] = { optionId: cmd.optionId, at: now };
      events.push({ type: "vote_accepted", actorId: cmd.actorId, optionId: cmd.optionId, changed: previous !== undefined });
      // Close early when everyone has answered.
      const closed = advanceRound(state, now, timing);
      return { state: closed.state, events: [...events, ...closed.events] };
    }
    case "request_revote": {
      if (state.phase !== "discuss") return fail("phase_closed");
      if (state.revoteUsed) return fail("revote_already_used");
      if (!(cmd.actorId in state.initialVotes)) return fail("not_a_voter");
      if (!state.revoteRequests.includes(cmd.actorId)) state.revoteRequests.push(cmd.actorId);
      const voters = Object.keys(state.initialVotes).length;
      if (state.revoteRequests.length >= majorityThreshold(voters)) {
        state.revoteUsed = true;
        state.ballotRevision = 2;
        state.phase = "revote";
        state.phaseStartedAt = now;
        state.deadline = now + timing.revoteMs;
        events.push({ type: "phase_changed", from: "discuss", to: "revote", deadline: state.deadline });
      }
      return { state, events };
    }
    case "request_more_time": {
      if (state.phase !== "discuss") return fail("phase_closed");
      if (state.extensionUsed) return fail("extension_already_used");
      if (!(cmd.actorId in state.initialVotes)) return fail("not_a_voter");
      if (!state.moreTimeRequests.includes(cmd.actorId)) state.moreTimeRequests.push(cmd.actorId);
      const voters = Object.keys(state.initialVotes).length;
      if (state.moreTimeRequests.length >= majorityThreshold(voters)) {
        state.extensionUsed = true;
        state.deadline += timing.extensionMs;
        events.push({ type: "extension_granted", deadline: state.deadline });
      }
      return { state, events };
    }
    case "request_skip": {
      if (state.phase === "verdict") return fail("phase_closed");
      if (!state.skipRequests.includes(cmd.actorId)) state.skipRequests.push(cmd.actorId);
      const group = collectiveGroup(state);
      if (state.skipRequests.length >= majorityThreshold(group.length)) {
        events.push(...toVerdict(state, now, timing, true));
      }
      return { state, events };
    }
  }
}

/** Whether an eligible actor may still submit a vote right now. */
export function canVote(state: RoundState, actorId: ActorId, now: number): boolean {
  if (!state.eligible.includes(actorId)) return false;
  if (state.phase !== "vote" && state.phase !== "revote") return false;
  return now < state.deadline;
}
