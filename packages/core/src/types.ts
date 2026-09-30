export type ActorId = string;
export type OptionId = string;

export interface BallotOption {
  id: OptionId;
  text: string;
  /** True when a player wrote this option in during the room; never public. */
  writeIn?: boolean;
}

/**
 * The question as dealt to one room. `versionId` identifies the immutable
 * public question version. `variant` is true when the option set differs
 * from the canonical version (write-ins) or the prompt is private, in which
 * case the round can never contribute to public totals.
 */
export interface Ballot {
  questionId: string | null;
  versionId: string | null;
  prompt: string;
  options: BallotOption[];
  tags: string[];
  spoiler: boolean;
  variant: boolean;
  /** 'library' for approved public questions, 'custom' for room-private prompts. */
  source: "library" | "custom";
}

export type Phase = "vote" | "discuss" | "revote" | "verdict";

export interface VoteRecord {
  optionId: OptionId;
  /** ms since epoch when the server accepted the vote. */
  at: number;
}

export interface RoundState {
  roundId: string;
  roundNumber: number;
  ballot: Ballot;
  phase: Phase;
  /** When the round (vote phase) opened. Never changes. */
  startedAt: number;
  phaseStartedAt: number;
  /** Absolute deadline (ms since epoch) for the current phase. */
  deadline: number;
  /** Actor ids fixed at round start; nobody else can vote in this round. */
  eligible: ActorId[];
  /** 1 during the initial vote, 2 during the revote. Guards stale votes. */
  ballotRevision: 1 | 2;
  initialVotes: Record<ActorId, VoteRecord>;
  /** Votes cast during the revote; absent actors keep their initial vote. */
  revoteVotes: Record<ActorId, VoteRecord>;
  revoteRequests: ActorId[];
  revoteUsed: boolean;
  moreTimeRequests: ActorId[];
  extensionUsed: boolean;
  skipRequests: ActorId[];
  /** Set when the round reached verdict; null before. */
  result: RoundResult | null;
}

export type OutcomeKind = "unanimous" | "majority" | "leading" | "tie" | "no_votes";

export interface Outcome {
  kind: OutcomeKind;
  /** Winning option ids. One for unanimous/majority/leading, several for tie, none for no_votes. */
  leaders: OptionId[];
  counts: Record<OptionId, number>;
  total: number;
}

export interface RoundResult {
  /** Outcome of the frozen initial tally. */
  initial: Outcome;
  /** Outcome of the final tally (identical to initial when there was no revote). */
  final: Outcome;
  finalVotes: Record<ActorId, VoteRecord>;
  changedMinds: ActorId[];
  revoteHappened: boolean;
  skipped: boolean;
  /** True when zero votes were cast; such rounds produce no awards or contributions. */
  empty: boolean;
  completedAt: number;
}
