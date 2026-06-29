"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "@/app/auth-actions";

export interface SlideItem {
  id: string;
  comment: string | null;
}

const DEFAULT_DURATION = 8;
const MIN_DURATION = 3;
const MAX_DURATION = 30;
const OFF = MAX_DURATION + 1; // slider position past the max means "∞" (no autoplay)
const POLL_MS = 10_000;
const CONTROLS_HIDE_MS = 3500;

const imageUrl = (id: string) => `/api/photo/${id}?w=1920`;

export function Slideshow({ initial }: { initial: SlideItem[] }) {
  const [photos, setPhotos] = useState<SlideItem[]>(initial);
  const [index, setIndex] = useState(0);
  // null duration means autoplay is off (∞).
  const [durationSec, setDurationSec] = useState<number | null>(DEFAULT_DURATION);
  const [controlsVisible, setControlsVisible] = useState(true);
  const lastFinite = useRef(DEFAULT_DURATION);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = photos.length;
  const current = photos[index];

  const next = useCallback(() => setIndex((i) => (count ? (i + 1) % count : 0)), [count]);
  const prev = useCallback(() => setIndex((i) => (count ? (i - 1 + count) % count : 0)), [count]);

  // Reveal the control bar and (re)arm the auto-hide timer.
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  // Arm the initial auto-hide (state starts visible, so don't set it here).
  useEffect(() => {
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Auto-advance unless autoplay is off (∞).
  useEffect(() => {
    if (durationSec === null || count <= 1) return;
    const timer = setTimeout(next, durationSec * 1000);
    return () => clearTimeout(timer);
  }, [durationSec, count, index, next]);

  // Keyboard: arrows navigate, space toggles autoplay on/off.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setDurationSec((d) => {
          if (d === null) return lastFinite.current;
          lastFinite.current = d;
          return null;
        });
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

  function onSlider(value: number) {
    if (value > MAX_DURATION) {
      if (durationSec !== null) lastFinite.current = durationSec;
      setDurationSec(null);
    } else {
      setDurationSec(value);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  if (count === 0) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white">
        <h1 className="text-3xl font-semibold">Diashow</h1>
        <p className="text-xl text-zinc-400">Noch keine Fotos.</p>
      </main>
    );
  }

  const btn =
    "min-h-12 rounded-xl bg-white/10 px-5 text-lg font-medium text-white hover:bg-white/20";

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
      style={{ cursor: controlsVisible ? "auto" : "none" }}
      onMouseMove={showControls}
    >
      <div className="flex h-full w-full items-center justify-center">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={imageUrl(current.id)}
            alt={current.comment ?? "Foto"}
            className="max-h-screen max-w-full animate-[fadein_0.6s_ease] object-contain"
          />
        )}
      </div>

      {current?.comment && (
        <p className="absolute bottom-28 left-1/2 max-w-3xl -translate-x-1/2 rounded-xl bg-black/60 px-6 py-3 text-center text-2xl">
          {current.comment}
        </p>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-4 bg-black/80 p-4 transition-opacity duration-500 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button type="button" onClick={prev} className={btn}>
          ‹ Zurück
        </button>
        <button type="button" onClick={next} className={btn}>
          Weiter ›
        </button>
        <label className="flex items-center gap-3 text-lg">
          <span className="w-28 whitespace-nowrap">
            Dauer: {durationSec === null ? "∞" : `${durationSec}s`}
          </span>
          <input
            type="range"
            min={MIN_DURATION}
            max={OFF}
            value={durationSec ?? OFF}
            onChange={(e) => onSlider(Number(e.target.value))}
            aria-label="Dauer pro Foto in Sekunden (Maximum = Endlosschleife aus)"
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
