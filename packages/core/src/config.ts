/**
 * Tuning knobs. Every value here is a proposed playtest default from the
 * manifesto, not a claim about the ideal number.
 */
export interface RoundTiming {
  /** Voting window (ms). Closes early when every eligible player has voted. */
  voteMs: number;
  /** Discussion after the initial tally freezes (ms). */
  discussMs: number;
  /** Length of the optional group-triggered revote (ms). */
  revoteMs: number;
  /** How long the verdict stays on screen before the next question (ms). */
  verdictMs: number;
  /** One-time "more time" extension added to the discussion (ms). */
  extensionMs: number;
}

export const DEFAULT_TIMING: RoundTiming = {
  voteMs: 30_000,
  discussMs: 30_000,
  revoteMs: 15_000,
  verdictMs: 8_000,
  extensionMs: 30_000,
};

export const LIMITS = {
  /** Minimum ready players before the first question deals. */
  minPlayersToStart: 2,
  /** Minimum *active* players for the queue to keep dealing. */
  minActiveToContinue: 2,
  /** Launch cap on room size. */
  maxPlayers: 12,
  /** Nickname length. */
  maxNicknameLength: 20,
  /** Private write-in option limits. */
  maxWriteInLength: 40,
  maxWriteInsPerQuestion: 2,
  maxOptionsPerBallot: 6,
  /** Private queued custom questions. */
  maxCustomPromptLength: 140,
  maxCustomQueued: 10,
} as const;

export const ROOM_LIFECYCLE = {
  /** Stop dealing and expire the room after this much time with too few active players (ms). */
  idlePauseExpiryMs: 30 * 60_000,
  /** Keep room state around after the last activity so people can reopen their recap (ms). */
  retentionMs: 24 * 60 * 60_000,
  /** A member counts as "active" if seen within this window (ms). */
  presenceWindowMs: 45_000,
} as const;

export const DAILY = {
  /** Daily period opens at this UTC hour. */
  startHourUtc: 12,
  /** Distinct eligible participants required before percentages publish. */
  minSample: 20,
  /** Other eligible participants required to grade one attempt. */
  minOthersToGrade: 20,
  /** Do not schedule a question that ran within this many days. */
  noRepeatDays: 60,
} as const;

export const PUBLIC_STATS = {
  /** Below this many eligible contributions a topic shows no percentages. */
  minSample: 20,
} as const;
