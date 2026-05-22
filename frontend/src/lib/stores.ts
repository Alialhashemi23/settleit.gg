import { writable } from "svelte/store";

export interface Player {
  id: string;
  nickname: string;
}

export interface Question {
  id: string;
  type: "vote";
  prompt: string;
  options: string[];
}

export interface LiveVote {
  playerId: string;
  nickname: string;
  value: string;
}

export interface HistoryEntry {
  question: Question;
  settledOption: string | null;
  votes: LiveVote[];
}

export const roomCode = writable<string | null>(null);
export const players = writable<Player[]>([]);
export const currentQuestion = writable<Question | null>(null);
export const liveVotes = writable<LiveVote[]>([]);
export const totalPlayers = writable<number>(0);
export const myVote = writable<string | null>(null);
export const questionEnded = writable(false);
export const hostDisconnected = writable<{ deadline: number } | null>(null);
export const roomEnded = writable(false);
export const questionHistory = writable<HistoryEntry[]>([]);
export const askedPresetIds = writable<Set<string>>(new Set());

// Countdown
export const countdown = writable<{ deadline: number; leadingOption: string } | null>(null);

// Player Turns
export const myPlayerId = writable<string | null>(null);
export const turnOrder = writable<Player[]>([]);
export const activePlayerId = writable<string | null>(null);

export function resetQuestionState() {
  currentQuestion.set(null);
  liveVotes.set([]);
  totalPlayers.set(0);
  myVote.set(null);
  questionEnded.set(false);
  countdown.set(null);
}
