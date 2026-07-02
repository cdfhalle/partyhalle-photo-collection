"use client";

import { useState } from "react";
import { PlayerRoom } from "./PlayerRoom";

// Join form → once submitted, mounts PlayerRoom which opens the WebSocket.
export function QuizJoin({ gameHost, initialPin }: { gameHost: string; initialPin: string }) {
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState("");
  const [joined, setJoined] = useState<{ pin: string; nickname: string } | null>(null);

  if (joined) {
    return (
      <PlayerRoom
        gameHost={gameHost}
        pin={joined.pin}
        nickname={joined.nickname}
        onLeave={() => setJoined(null)}
      />
    );
  }

  const canJoin = pin.trim().length > 0 && nickname.trim().length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Quiz beitreten</h1>
      <p className="text-xl text-zinc-600 dark:text-zinc-300">
        Gib den Code vom Bildschirm ein und wähle einen Namen.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canJoin) setJoined({ pin: pin.trim(), nickname: nickname.trim() });
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-lg font-medium">Code</span>
          <input
            type="text"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="z. B. 1234"
            className="min-h-16 rounded-xl border border-zinc-300 bg-white px-4 text-center text-3xl tracking-widest text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-lg font-medium">Dein Name</span>
          <input
            type="text"
            value={nickname}
            maxLength={24}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="z. B. Anna"
            className="min-h-16 rounded-xl border border-zinc-300 bg-white px-4 text-xl text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
        </label>
        <button
          type="submit"
          disabled={!canJoin}
          className="min-h-16 rounded-xl bg-pink-600 px-6 text-2xl font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          Los geht&apos;s
        </button>
      </form>
    </main>
  );
}
