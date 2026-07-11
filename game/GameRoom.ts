/* eslint-disable @typescript-eslint/no-unused-expressions -- `this.sql\`…\`` tagged-template statements are the SDK's query API. */
import { Agent, type Connection, type WSMessage } from "agents";
import {
  initialGameState,
  type GameState,
  type Player,
  type ClientMessage,
  type LoadedQuestion,
} from "../lib/gameTypes";
import { scorePoints, DEFAULT_TIME_LIMIT_SECS, DEFAULT_POINTS } from "../lib/gameScoring";
import { verifyHostToken } from "../lib/tokens";

// The Agents SDK constrains an Agent's Env to the global Cloudflare.Env. The
// game Worker really only needs GAME_SECRET (to verify host tokens) + its own
// GameRoom DO binding; the other typed bindings are simply unused here.
export interface GameEnv extends Cloudflare.Env {
  GameRoom: DurableObjectNamespace;
}

interface ConnState {
  playerId?: string;
}

interface QuestionRow {
  idx: number;
  qid: string;
  prompt: string;
  options: string;
  correct_index: number;
  time_limit: number;
  points: number;
}

/**
 * One instance per game room (keyed by PIN). Holds the live game state, which is
 * auto-broadcast to every connected client via setState. The answer key and
 * per-player answers live in the agent's private SQLite (never broadcast) so
 * players can't read the correct answer before the reveal.
 */
export class GameRoom extends Agent<GameEnv, GameState> {
  initialState = initialGameState;

  private ensureTables() {
    this.sql`CREATE TABLE IF NOT EXISTS game_questions (
      idx INTEGER PRIMARY KEY, qid TEXT, prompt TEXT, options TEXT,
      correct_index INTEGER, time_limit INTEGER, points INTEGER)`;
    this.sql`CREATE TABLE IF NOT EXISTS game_answers (
      q_idx INTEGER, player_id TEXT, option_index INTEGER, ms_left INTEGER,
      PRIMARY KEY (q_idx, player_id))`;
  }

  async onStart() {
    this.ensureTables();
    if (this.state.pin !== this.name) this.patch({ pin: this.name });
  }

  private patch(changes: Partial<GameState>) {
    this.setState({ ...this.state, ...changes });
  }

  private authHost(token: string): Promise<boolean> {
    return verifyHostToken(token, this.name, this.env.GAME_SECRET);
  }

  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":
        return this.handleJoin(connection, msg.nickname, msg.playerId);
      case "answer":
        return this.handleAnswer(connection, msg.optionIndex);
      // Host-only controls — each verifies the host token independently.
      case "load":
        if (await this.authHost(msg.token)) this.loadQuestions(msg.questions);
        return;
      case "start":
        if (await this.authHost(msg.token)) this.beginQuestion(0);
        return;
      case "next":
        if (await this.authHost(msg.token)) this.nextQuestion();
        return;
      case "startTimer":
        if (await this.authHost(msg.token)) await this.startTimer();
        return;
      case "reveal":
        if (await this.authHost(msg.token)) this.doReveal();
        return;
      case "leaderboard":
        if (await this.authHost(msg.token)) this.patch({ phase: "leaderboard" });
        return;
      case "end":
        if (await this.authHost(msg.token)) this.patch({ phase: "ended" });
        return;
      case "reset":
        if (await this.authHost(msg.token)) this.resetGame();
        return;
    }
  }

  onClose(connection: Connection) {
    const playerId = (connection.state as ConnState | null)?.playerId;
    if (!playerId) return;
    this.patch({
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, connected: false } : p,
      ),
    });
  }

  // --- Players -------------------------------------------------------------

  private handleJoin(connection: Connection, nickname: string, playerId: string) {
    const name = String(nickname ?? "").trim().slice(0, 24) || "Gast";
    const id = String(playerId ?? "").trim();
    if (!id) return;
    connection.setState({ playerId: id });

    const existing = this.state.players.find((p) => p.id === id);
    const players = existing
      ? this.state.players.map((p) => (p.id === id ? { ...p, name, connected: true } : p))
      : [...this.state.players, { id, name, score: 0, streak: 0, connected: true } satisfies Player];
    this.patch({ players: sortPlayers(players) });
  }

  private handleAnswer(connection: Connection, optionIndex: number) {
    const cs = connection.state as ConnState | null;
    if (!cs?.playerId) return;
    const q = this.state.question;
    // No answers before the clock runs — the photo isn't on screen yet.
    if (this.state.phase !== "question" || !q || q.endsAt === null) return;

    const idx = q.index;
    const already = this.sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM game_answers WHERE q_idx = ${idx} AND player_id = ${cs.playerId}`;
    if ((already[0]?.n ?? 0) > 0) return;

    const option = Number(optionIndex);
    if (!Number.isInteger(option) || option < 0 || option >= q.options.length) return;

    const msLeft = Math.max(0, q.endsAt - Date.now());
    this.sql`INSERT OR IGNORE INTO game_answers (q_idx, player_id, option_index, ms_left)
      VALUES (${idx}, ${cs.playerId}, ${option}, ${msLeft})`;
    this.patch({ answerCount: this.state.answerCount + 1 });

    // Auto-reveal once every connected player has answered.
    const connectedPlayers = this.state.players.filter((p) => p.connected).length;
    if (connectedPlayers > 0 && this.state.answerCount >= connectedPlayers) this.doReveal();
  }

  // --- Host flow -----------------------------------------------------------

  private loadQuestions(questions: LoadedQuestion[]) {
    // Only (re)load before or after a game — never mid-round, so a host
    // reconnect during play can't wipe in-progress answers/scores.
    const p = this.state.phase;
    if (p !== "idle" && p !== "lobby" && p !== "ended") return;
    this.sql`DELETE FROM game_questions`;
    this.sql`DELETE FROM game_answers`;
    questions.forEach((q, i) => {
      this.sql`INSERT OR REPLACE INTO game_questions
        (idx, qid, prompt, options, correct_index, time_limit, points)
        VALUES (${i}, ${q.id}, ${q.prompt}, ${JSON.stringify(q.options)},
          ${q.correctIndex}, ${q.timeLimitSecs || DEFAULT_TIME_LIMIT_SECS},
          ${q.points || DEFAULT_POINTS})`;
    });
    this.patch({
      loaded: questions.length > 0,
      totalQuestions: questions.length,
      phase: this.state.phase === "idle" ? "lobby" : this.state.phase,
    });
  }

  private loadQuestionRow(idx: number): QuestionRow | null {
    const rows = this.sql<QuestionRow>`SELECT * FROM game_questions WHERE idx = ${idx}`;
    return rows[0] ?? null;
  }

  private beginQuestion(idx: number) {
    const row = this.loadQuestionRow(idx);
    if (!row) {
      this.patch({ phase: "ended" });
      return;
    }
    this.sql`DELETE FROM game_answers WHERE q_idx = ${idx}`;
    const timeLimitSecs = row.time_limit || DEFAULT_TIME_LIMIT_SECS;
    const options = JSON.parse(row.options) as string[];
    // The clock does not start here: endsAt stays null until the presenter
    // confirms the photo is on screen (startTimer), so slow image loads don't
    // burn answer time before anyone has seen the picture.
    this.patch({
      phase: "question",
      answerCount: 0,
      reveal: null,
      question: {
        id: row.qid,
        index: idx,
        total: this.state.totalQuestions,
        prompt: row.prompt,
        options,
        endsAt: null,
        timeLimitSecs,
      },
    });
  }

  /** Host signal that the question photo is visible — only now start the clock. */
  private async startTimer() {
    const q = this.state.question;
    if (this.state.phase !== "question" || !q || q.endsAt !== null) return;
    this.patch({ question: { ...q, endsAt: Date.now() + q.timeLimitSecs * 1000 } });
    await this.schedule(q.timeLimitSecs, "onTimeUp", { idx: q.index });
  }

  /** Scheduled timer callback — reveal if we're still on that question. */
  async onTimeUp(payload: { idx: number }) {
    if (this.state.phase === "question" && this.state.question?.index === payload.idx) {
      this.doReveal();
    }
  }

  private doReveal() {
    const q = this.state.question;
    if (this.state.phase !== "question" || !q) return; // only reveal once
    const row = this.loadQuestionRow(q.index);
    if (!row) return;

    const totalMs = (row.time_limit || DEFAULT_TIME_LIMIT_SECS) * 1000;
    const basePoints = row.points || DEFAULT_POINTS;
    const answers = this.sql<{ player_id: string; option_index: number; ms_left: number }>`
      SELECT player_id, option_index, ms_left FROM game_answers WHERE q_idx = ${q.index}`;

    const counts = new Array(q.options.length).fill(0) as number[];
    const byPlayer = new Map<string, { option: number; msLeft: number }>();
    for (const a of answers) {
      if (a.option_index >= 0 && a.option_index < counts.length) counts[a.option_index]++;
      byPlayer.set(a.player_id, { option: a.option_index, msLeft: a.ms_left });
    }

    const players = this.state.players.map((p) => {
      const a = byPlayer.get(p.id);
      if (a && a.option === row.correct_index) {
        return {
          ...p,
          score: p.score + scorePoints(a.option, row.correct_index, a.msLeft, totalMs, basePoints),
          streak: p.streak + 1,
        };
      }
      return { ...p, streak: 0 };
    });

    this.patch({
      phase: "reveal",
      reveal: { correctIndex: row.correct_index, counts },
      players: sortPlayers(players),
    });
  }

  private nextQuestion() {
    const current = this.state.question?.index ?? -1;
    this.beginQuestion(current + 1);
  }

  private resetGame() {
    this.sql`DELETE FROM game_answers`;
    this.patch({
      phase: this.state.loaded ? "lobby" : "idle",
      question: null,
      answerCount: 0,
      reveal: null,
      players: this.state.players.map((p) => ({ ...p, score: 0, streak: 0 })),
    });
  }

  onError(error: unknown): void {
    console.error("GameRoom error:", error);
  }
}

function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
