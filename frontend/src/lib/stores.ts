import { writable } from "svelte/store";

export interface Player {
  id: string;
  nickname: string;
}

export interface Question {
  id: string;
  type: "vote" | "freetext";
  prompt: string;
  options: string[] | null;
}

export const roomCode = writable<string | null>(null);
export const players = writable<Player[]>([]);
export const currentQuestion = writable<Question | null>(null);
export const voteCounts = writable<Record<string, number>>({});
export const freetextResponses = writable<string[]>([]);
export const hasVoted = writable(false);
export const questionEnded = writable(false);
export const hostDisconnected = writable<{ deadline: number } | null>(null);
export const roomEnded = writable(false);

export function resetQuestionState() {
  currentQuestion.set(null);
  voteCounts.set({});
  freetextResponses.set([]);
  hasVoted.set(false);
  questionEnded.set(false);
}
