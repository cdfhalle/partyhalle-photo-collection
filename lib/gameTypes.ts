// Shared types for the live quiz game, imported by both the game Worker
// (game/GameRoom.ts) and the Next client views. Keeping them here means the two
// sides share one contract without importing each other's runtime code.

export type Phase = "idle" | "lobby" | "question" | "reveal" | "leaderboard" | "ended";

export interface Player {
  id: string; // client-generated, stable across reconnects
  name: string;
  score: number;
  streak: number;
  connected: boolean;
}

/** What players/host see for the current question — never includes the answer. */
export interface SanitizedQuestion {
  id: string; // quiz_questions.id → photo at /api/quiz/photo/{id}
  index: number; // 0-based
  total: number;
  prompt: string;
  options: string[];
  endsAt: number | null; // epoch ms when the timer runs out
  timeLimitSecs: number;
}

export interface RevealInfo {
  correctIndex: number;
  counts: number[]; // votes per option
}

/** The full broadcast game state (auto-synced to every connected client). */
export interface GameState {
  phase: Phase;
  pin: string;
  loaded: boolean;
  totalQuestions: number;
  question: SanitizedQuestion | null;
  answerCount: number;
  reveal: RevealInfo | null;
  players: Player[];
}

export const initialGameState: GameState = {
  phase: "idle",
  pin: "",
  loaded: false,
  totalQuestions: 0,
  question: null,
  answerCount: 0,
  reveal: null,
  players: [],
};

/** A question with its answer key — sent by the (authenticated) host only. */
export interface LoadedQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  timeLimitSecs: number;
  points: number;
}

// Client → server messages (sent via the WebSocket `.send()`). Host-control
// messages each carry the host token so they can be verified independently —
// no ordering dependency on a prior "authenticate" frame.
export type ClientMessage =
  | { type: "join"; nickname: string; playerId: string }
  | { type: "answer"; optionIndex: number }
  | { type: "load"; token: string; questions: LoadedQuestion[] }
  | { type: "start"; token: string }
  | { type: "next"; token: string }
  | { type: "reveal"; token: string }
  | { type: "leaderboard"; token: string }
  | { type: "end"; token: string }
  | { type: "reset"; token: string };
