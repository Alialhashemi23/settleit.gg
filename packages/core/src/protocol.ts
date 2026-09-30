import type { Award } from "./awards.ts";
import type { ActorId, Ballot, Outcome, Phase, RoundResult, VoteRecord } from "./types.ts";

export interface MemberView {
  actorId: ActorId;
  nickname: string;
  /** 'active' if seen recently, otherwise 'away'. Advisory only. */
  presence: "active" | "away";
  ready: boolean;
  joinedAt: number;
  /** True when this member can vote in the current round. */
  eligible: boolean;
}

export interface LiveVoteView {
  actorId: ActorId;
  nickname: string;
  optionId: string;
}

export interface RoundView {
  roundId: string;
  roundNumber: number;
  ballot: Ballot;
  phase: Phase;
  startedAt: number;
  phaseStartedAt: number;
  deadline: number;
  ballotRevision: 1 | 2;
  eligible: ActorId[];
  /** Named live votes for the currently open ballot (initial or revote). */
  votes: LiveVoteView[];
  /** Frozen initial tally once the vote phase closed. */
  initialOutcome: Outcome | null;
  revoteRequests: ActorId[];
  moreTimeRequests: ActorId[];
  skipRequests: ActorId[];
  revoteUsed: boolean;
  extensionUsed: boolean;
  result: RoundResult | null;
  /** The viewer's own accepted vote for the open ballot, if any. */
  myVote: VoteRecord | null;
}

export interface RecapRound {
  roundId: string;
  roundNumber: number;
  prompt: string;
  options: { id: string; text: string }[];
  final: Outcome;
  initial: Outcome;
  changedMinds: ActorId[];
  finalVotes: Record<ActorId, string>;
  skipped: boolean;
  empty: boolean;
}

export interface RecapView {
  rounds: RecapRound[];
  awards: Award[];
  members: Pick<MemberView, "actorId" | "nickname">[];
}

export type RoomStatus = "lobby" | "playing" | "paused" | "expired";

export interface RoomSnapshot {
  code: string;
  version: number;
  status: RoomStatus;
  /** Why the room is paused, when it is. */
  pauseReason: "waiting_for_players" | null;
  me: { actorId: ActorId; nickname: string };
  members: MemberView[];
  categories: string[];
  excludeSpoilers: boolean;
  round: RoundView | null;
  roundsCompleted: number;
  /** Server time when the snapshot was produced; clients use it to offset countdowns. */
  serverNow: number;
  expiresAt: number | null;
  customQueueLength: number;
}

export type RoomCommandBody =
  | { type: "vote"; roundId: string; ballotRevision: number; optionId: string }
  | { type: "request_revote"; roundId: string }
  | { type: "request_more_time"; roundId: string }
  | { type: "request_skip"; roundId: string }
  | { type: "set_ready"; ready: boolean }
  | { type: "set_categories"; categories: string[]; excludeSpoilers: boolean }
  | { type: "queue_custom"; prompt: string; options: string[] }
  | { type: "write_in"; roundId: string; text: string }
  | { type: "leave" }
  | { type: "heartbeat" };

export interface RoomCommand {
  /** Client-generated unique id. Retrying with the same id returns the original result. */
  opId: string;
  body: RoomCommandBody;
}

export type CommandOutcome =
  | { ok: true; opId: string; version: number; note?: string }
  | { ok: false; opId: string; version: number; error: string; message: string };

export interface CommandResponse {
  result: CommandOutcome;
  snapshot: RoomSnapshot;
}

/** Messages pushed over the WebSocket. */
export type ServerPush =
  | { kind: "snapshot"; snapshot: RoomSnapshot }
  | { kind: "version"; version: number }
  | { kind: "expired" };
