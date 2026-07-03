"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useAgent } from "agents/react";
import type { GameState, LoadedQuestion } from "@/lib/gameTypes";

const OPTION_COLORS = ["bg-red-600", "bg-blue-600", "bg-amber-500", "bg-green-600", "bg-purple-600", "bg-pink-600"];

export function Presenter({
  gameHost,
  pin,
  hostToken,
  questions,
}: {
  gameHost: string;
  pin: string;
  hostToken: string;
  questions: LoadedQuestion[];
}) {
  const [state, setState] = useState<GameState | null>(null);
  const [qr, setQr] = useState<string>("");
  const [joinUrl] = useState(() =>
    typeof window === "undefined" ? "" : `${window.location.origin}/quiz?pin=${pin}`,
  );
  const agentRef = useRef<ReturnType<typeof useAgent<GameState>> | null>(null);

  const agent = useAgent<GameState>({
    host: gameHost,
    agent: "GameRoom",
    name: pin,
    onStateUpdate: (s) => setState(s),
    onOpen: () => {
      agentRef.current?.send(JSON.stringify({ type: "load", token: hostToken, questions }));
    },
  });
  useEffect(() => {
    agentRef.current = agent;
  });

  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [joinUrl]);

  // Every host-control message carries the host token for independent verification.
  const send = (type: string) => agent.send(JSON.stringify({ type, token: hostToken }));
  const phase = state?.phase ?? "idle";
  const isLast = state?.question ? state.question.index >= state.totalQuestions - 1 : false;

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col bg-black text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        {questions.length === 0 ? (
          <div className="text-center">
            <p className="text-3xl font-semibold">Noch keine Fragen</p>
            <Link href="/admin/quiz" className="mt-4 inline-block text-xl text-pink-400 underline">
              Fragen erstellen →
            </Link>
          </div>
        ) : phase === "idle" || phase === "lobby" ? (
          <Lobby pin={pin} qr={qr} joinUrl={joinUrl} players={state?.players.length ?? 0} />
        ) : phase === "question" && state?.question ? (
          <QuestionSlide state={state} />
        ) : phase === "reveal" && state?.question && state.reveal ? (
          <RevealSlide state={state} />
        ) : phase === "leaderboard" || phase === "ended" ? (
          <LeaderboardSlide state={state!} ended={phase === "ended"} />
        ) : null}
      </div>

      {/* Host controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/60 p-4">
        {(phase === "idle" || phase === "lobby") && (
          <Ctrl onClick={() => send("start")} disabled={questions.length === 0} primary>
            Start ▶
          </Ctrl>
        )}
        {phase === "question" && (
          <>
            <span className="text-lg text-zinc-400">
              {state?.answerCount ?? 0} / {state?.players.length ?? 0} geantwortet
            </span>
            <Ctrl onClick={() => send("reveal")} primary>
              Auflösen
            </Ctrl>
          </>
        )}
        {phase === "reveal" && (
          <>
            <Ctrl onClick={() => send("leaderboard")}>Rangliste</Ctrl>
            <Ctrl onClick={() => send(isLast ? "end" : "next")} primary>
              {isLast ? "Beenden 🏁" : "Nächste Frage ›"}
            </Ctrl>
          </>
        )}
        {phase === "leaderboard" && (
          <Ctrl onClick={() => send(isLast ? "end" : "next")} primary>
            {isLast ? "Beenden 🏁" : "Nächste Frage ›"}
          </Ctrl>
        )}
        {phase === "ended" && <Ctrl onClick={() => send("reset")}>Nochmal spielen</Ctrl>}
        <Link href="/admin/quiz" className="text-base text-zinc-400 underline">
          Fragen
        </Link>
        <button onClick={toggleFullscreen} className="text-base text-zinc-400 underline">
          Vollbild
        </button>
      </div>
    </main>
  );
}

function Lobby({ pin, qr, joinUrl, players }: { pin: string; qr: string; joinUrl: string; players: number }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="text-2xl text-zinc-300">Mitspielen auf</p>
      <p className="text-3xl font-semibold">{joinUrl.replace(/^https?:\/\//, "")}</p>
      <div className="flex flex-col items-center gap-2">
        <span className="text-2xl text-zinc-300">Code</span>
        <span className="text-7xl font-black tracking-widest">{pin}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR-Code zum Beitreten" className="rounded-xl bg-white p-2" />}
      <p className="text-2xl text-pink-400">{players} Mitspieler{players === 1 ? "" : "…"} 🎉</p>
    </div>
  );
}

function QuestionSlide({ state }: { state: GameState }) {
  const q = state.question!;
  const secondsLeft = useCountdown(q.endsAt);
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5">
      <div className="flex w-full items-center justify-between text-2xl text-zinc-400">
        <span>
          Frage {q.index + 1} / {q.total}
        </span>
        <span className="text-4xl font-bold">{secondsLeft}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/quiz/photo/${q.id}?w=1600`}
        alt=""
        className="max-h-[45vh] rounded-2xl object-contain"
      />
      <h2 className="text-center text-4xl font-bold">{q.prompt}</h2>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <div
            key={i}
            className={`min-h-16 rounded-xl px-6 py-4 text-2xl font-semibold ${OPTION_COLORS[i % OPTION_COLORS.length]}`}
          >
            {o}
          </div>
        ))}
      </div>
    </div>
  );
}

function RevealSlide({ state }: { state: GameState }) {
  const q = state.question!;
  const { correctIndex, counts } = state.reveal!;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5">
      <h2 className="text-center text-4xl font-bold">{q.prompt}</h2>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-xl px-6 py-4 text-2xl font-semibold ${
              i === correctIndex ? OPTION_COLORS[i % OPTION_COLORS.length] : "bg-zinc-800 text-zinc-400"
            }`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/20"
              style={{ width: `${(counts[i] / total) * 100}%` }}
            />
            <span className="relative">
              {i === correctIndex ? "✓ " : ""}
              {o} <span className="text-xl opacity-80">({counts[i]})</span>
            </span>
          </div>
        ))}
      </div>
      <MiniLeaderboard state={state} />
    </div>
  );
}

function LeaderboardSlide({ state, ended }: { state: GameState; ended: boolean }) {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <h2 className="text-5xl font-black">{ended ? "🏆 Endstand" : "Rangliste"}</h2>
      <ol className="flex w-full flex-col gap-3">
        {state.players.slice(0, 10).map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-zinc-800 px-6 py-4 text-3xl"
          >
            <span>
              {medal(i)} {p.name}
            </span>
            <span className="font-bold">{p.score}</span>
          </li>
        ))}
        {state.players.length === 0 && <p className="text-2xl text-zinc-500">Noch keine Punkte.</p>}
      </ol>
    </div>
  );
}

function MiniLeaderboard({ state }: { state: GameState }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 text-xl">
      {state.players.slice(0, 5).map((p, i) => (
        <span key={p.id} className="rounded-full bg-zinc-800 px-4 py-1">
          {medal(i)} {p.name} · {p.score}
        </span>
      ))}
    </div>
  );
}

function medal(i: number): string {
  return ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
}

function Ctrl({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-xl px-6 text-xl font-semibold disabled:opacity-40 ${
        primary ? "bg-pink-600 text-white hover:bg-pink-700" : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
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
