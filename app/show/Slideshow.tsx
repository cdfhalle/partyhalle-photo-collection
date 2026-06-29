"use client";

import { useCallback, useEffect, useState } from "react";
import { logout } from "@/app/auth-actions";

export interface SlideItem {
  id: string;
  comment: string | null;
}

const DEFAULT_DURATION = 8;
const MIN_DURATION = 3;
const MAX_DURATION = 30;
const POLL_MS = 10_000;

const imageUrl = (id: string) => `/api/photo/${id}?w=1920`;

export function Slideshow({ initial }: { initial: SlideItem[] }) {
  const [photos, setPhotos] = useState<SlideItem[]>(initial);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION);

  const count = photos.length;
  const current = photos[index];

  const next = useCallback(() => setIndex((i) => (count ? (i + 1) % count : 0)), [count]);
  const prev = useCallback(() => setIndex((i) => (count ? (i - 1 + count) % count : 0)), [count]);

  // Auto-advance (resets when index/duration/playing change).
  useEffect(() => {
    if (!playing || count <= 1) return;
    const timer = setTimeout(next, durationSec * 1000);
    return () => clearTimeout(timer);
  }, [playing, count, durationSec, index, next]);

  // Keyboard: arrows navigate, space toggles play.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Live updates: poll and reconcile, keeping the current photo in view.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/photos", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { photos: SlideItem[] };
        setPhotos((prevPhotos) => {
          const currentId = prevPhotos[index]?.id;
          const newIndex = currentId ? data.photos.findIndex((p) => p.id === currentId) : -1;
          setIndex(newIndex >= 0 ? newIndex : 0);
          return data.photos;
        });
      } catch {
        // transient network error — keep showing what we have
      }
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [index]);

  // Preload the next image for smoother transitions.
  useEffect(() => {
    if (count > 1) {
      const nextId = photos[(index + 1) % count]?.id;
      if (nextId) {
        const img = new Image();
        img.src = imageUrl(nextId);
      }
    }
  }, [index, count, photos]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  if (count === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white">
        <h1 className="text-3xl font-semibold">Diashow</h1>
        <p className="text-xl text-zinc-400">Noch keine Fotos.</p>
      </main>
    );
  }

  const btn =
    "min-h-12 rounded-xl bg-white/10 px-5 text-lg font-medium text-white hover:bg-white/20";

  return (
    <main className="relative flex min-h-screen flex-col bg-black text-white">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={imageUrl(current.id)}
            alt={current.comment ?? "Foto"}
            className="max-h-screen max-w-full animate-[fadein_0.6s_ease] object-contain"
          />
        )}
        {current?.comment && (
          <p className="absolute bottom-28 left-1/2 max-w-3xl -translate-x-1/2 rounded-xl bg-black/60 px-6 py-3 text-center text-2xl">
            {current.comment}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 bg-black/80 p-4">
        <button type="button" onClick={prev} className={btn}>
          ‹ Zurück
        </button>
        <button type="button" onClick={() => setPlaying((p) => !p)} className={btn}>
          {playing ? "Pause" : "Abspielen"}
        </button>
        <button type="button" onClick={next} className={btn}>
          Weiter ›
        </button>
        <label className="flex items-center gap-3 text-lg">
          <span className="whitespace-nowrap">Dauer: {durationSec}s</span>
          <input
            type="range"
            min={MIN_DURATION}
            max={MAX_DURATION}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            aria-label="Dauer pro Foto in Sekunden"
          />
        </label>
        <button type="button" onClick={toggleFullscreen} className={btn}>
          Vollbild
        </button>
        <span className="text-lg text-zinc-400">
          {index + 1} / {count}
        </span>
        <form action={logout}>
          <button type="submit" className="text-base text-zinc-400 underline">
            Abmelden
          </button>
        </form>
      </div>
    </main>
  );
}
