"use client";

import { useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { GameState } from "@/lib/gameTypes";

const OPTION_COLORS = [
  "bg-red-600 hover:bg-red-700",
  "bg-blue-600 hover:bg-blue-700",
  "bg-amber-500 hover:bg-amber-600",
  "bg-green-600 hover:bg-green-700",
  "bg-purple-600 hover:bg-purple-700",
  "bg-pink-600 hover:bg-pink-700",
];

// A stable per-device id so a reconnecting player keeps their score. Computed
// once outside React (no ref-during-render / impure-call-in-render lint issues).
let cachedPlayerId: string | null = null;
function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId;
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("pa_player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pa_player_id", id);
  }
  cachedPlayerId = id;
  return id;
}

export function PlayerRoom({
  gameHost,
  pin,
  nickname,
  onLeave,
}: {
  gameHost: string;
  pin: string;
  nickname: string;
  onLeave: () => void;
}) {
  const [playerId] = useState(getPlayerId);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Track which question my answer belongs to, so it clears automatically when a
  // new question starts (no setState-in-effect needed).
  const [answered, setAnswered] = useState<{ q: number; option: number } | null>(null);
  const agentRef = useRef<ReturnType<typeof useAgent<GameState>> | null>(null);

  const agent = useAgent<GameState>({
    host: gameHost,
    agent: "GameRoom",
    name: pin,
    onStateUpdate: (s) => setState(s),
    onOpen: () => {
      agentRef.current?.send(JSON.stringify({ type: "join", nickname, playerId }));
      setError(null);
    },
    onConnectionError: () => setError("Verbindung fehlgeschlagen. Stimmt der Code?"),
  });
  useEffect(() => {
    agentRef.current = agent;
  });

  const qIndex = state?.question?.index ?? -1;
  const myAnswer = answered && answered.q === qIndex ? answered.option : null;

  function answer(i: number) {
    if (myAnswer !== null || state?.phase !== "question") return;
    setAnswered({ q: qIndex, option: i });
    agent.send(JSON.stringify({ type: "answer", optionIndex: i }));
  }

  const me = state?.players.find((p) => p.id === playerId);
  const rank = me ? state!.players.findIndex((p) => p.id === playerId) + 1 : 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold">{nickname}</span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-base font-medium dark:bg-zinc-800">
          {me ? `${me.score} Pkt` : "…"}
        </span>
      </header>

      {error && <p className="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {!state || state.phase === "idle" || state.phase === "lobby" ? (
        <Centered>
          <p className="text-2xl font-semibold">Bereit! 🎉</p>
          <p className="text-lg text-zinc-500">Warte auf den Start …</p>
          {state && <p className="text-base text-zinc-500">{state.players.length} dabei</p>}
        </Centered>
      ) : state.phase === "question" && state.question ? (
        <QuestionView state={state} myAnswer={myAnswer} onAnswer={answer} />
      ) : state.phase === "reveal" && state.question && state.reveal ? (
        <Centered>
          {myAnswer === null ? (
            <p className="text-3xl font-bold text-zinc-500">Zu langsam ⏱️</p>
          ) : myAnswer === state.reveal.correctIndex ? (
            <p className="text-3xl font-bold text-green-600">Richtig! ✓</p>
          ) : (
            <p className="text-3xl font-bold text-red-600">Leider falsch ✗</p>
          )}
          <p className="text-xl">
            Richtig war: <strong>{state.question.options[state.reveal.correctIndex]}</strong>
          </p>
          {me && <p className="text-lg text-zinc-500">{me.score} Punkte · Platz {rank}</p>}
        </Centered>
      ) : state.phase === "leaderboard" ? (
        <Leaderboard state={state} playerId={playerId} />
      ) : state.phase === "ended" ? (
        <>
          <Centered>
            <p className="text-3xl font-bold">Ende! 🏁</p>
            {rank > 0 && <p className="text-xl">Dein Platz: {rank}</p>}
          </Centered>
          <Leaderboard state={state} playerId={playerId} />
        </>
      ) : null}

      <button onClick={onLeave} className="mt-auto text-base text-zinc-400 underline">
        Verlassen
      </button>
    </main>
  );
}

function QuestionView({
  state,
  myAnswer,
  onAnswer,
}: {
  state: GameState;
  myAnswer: number | null;
  onAnswer: (i: number) => void;
}) {
  const q = state.question!;
  // endsAt is null until the presenter's photo is on screen — answers are
  // locked (server-enforced too) so nobody gains time on slow projector Wi-Fi.
  const waiting = q.endsAt === null;
  const secondsLeft = useCountdown(q.endsAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-lg text-zinc-500">
        <span>
          Frage {q.index + 1}/{q.total}
        </span>
        <span className="font-bold">{waiting ? q.timeLimitSecs : secondsLeft}s</span>
      </div>
      <p className="text-2xl font-semibold">{q.prompt}</p>
      {waiting ? (
        <Centered>
          <p className="text-2xl font-semibold">Gleich geht’s los …</p>
          <p className="text-lg text-zinc-500">Schau auf die Leinwand!</p>
        </Centered>
      ) : myAnswer !== null ? (
        <Centered>
          <p className="text-2xl font-semibold text-pink-600">Antwort abgegeben ✓</p>
          <p className="text-lg text-zinc-500">Warte auf die anderen …</p>
        </Centered>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {q.options.map((o, i) => (
            <button
              key={i}
              onClick={() => onAnswer(i)}
              className={`min-h-16 rounded-xl px-5 text-xl font-semibold text-white ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ state, playerId }: { state: GameState; playerId: string }) {
  return (
    <ol className="flex flex-col gap-2">
      {state.players.slice(0, 10).map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-lg ${
            p.id === playerId
              ? "bg-pink-100 font-semibold dark:bg-pink-950"
              : "bg-zinc-100 dark:bg-zinc-800"
          }`}
        >
          <span>
            {i + 1}. {p.name}
          </span>
          <span>{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{children}</div>;
}

function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
