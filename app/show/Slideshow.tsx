"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logout } from "@/app/auth-actions";
import { seededShuffle, indexOfId, type SlideItem } from "@/lib/slideshow";

const DEFAULT_DURATION = 8;
const MIN_DURATION = 3;
const MAX_DURATION = 30;
const OFF = MAX_DURATION + 1; // slider past the max means "∞" (no autoplay)
// 30s keeps a left-open projector tab at ~120 worker requests/hour while still
// surfacing new uploads quickly enough for a live party.
const POLL_MS = 30_000;
const CONTROLS_HIDE_MS = 3500;

const imageUrl = (id: string) => `/api/photo/${id}?w=1920`;

type Order = "chronological" | "random";

export function Slideshow({ initial, startId }: { initial: SlideItem[]; startId?: string }) {
  const [photos, setPhotos] = useState<SlideItem[]>(initial); // chronological
  const [order, setOrder] = useState<Order>("chronological");
  const [seed, setSeed] = useState(1);
  const [durationSec, setDurationSec] = useState<number | null>(DEFAULT_DURATION);
  const [controlsVisible, setControlsVisible] = useState(true);
  // The shown photo is tracked by id so it survives reordering (toggle/new photos).
  const [currentId, setCurrentId] = useState<string | null>(
    startId && initial.some((p) => p.id === startId) ? startId : (initial[0]?.id ?? null),
  );
  const lastFinite = useRef(DEFAULT_DURATION);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sequence = useMemo(
    () => (order === "random" ? seededShuffle(photos, seed) : photos),
    [photos, order, seed],
  );
  const count = sequence.length;
  const pos = indexOfId(sequence, currentId);
  const current = sequence[pos];

  const goTo = useCallback(
    (p: number) => {
      if (!count) return;
      const idx = ((p % count) + count) % count;
      setCurrentId(sequence[idx]?.id ?? null);
    },
    [count, sequence],
  );
  const next = useCallback(() => goTo(pos + 1), [goTo, pos]);
  const prev = useCallback(() => goTo(pos - 1), [goTo, pos]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

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
  }, [durationSec, count, next]);

  // Keyboard: arrows navigate, space toggles autoplay.
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

  // Live updates: poll and keep the current photo in view. Only poll while the
  // tab is visible — a backgrounded or left-open projector tab shouldn't keep
  // hitting the worker — and refetch once on becoming visible again to catch up.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const res = await fetch("/api/photos", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { photos: SlideItem[] };
        setPhotos(data.photos);
        setCurrentId((cur) =>
          cur && data.photos.some((p) => p.id === cur) ? cur : (data.photos[0]?.id ?? null),
        );
      } catch {
        // transient network error — keep showing what we have
      }
    }

    function start() {
      if (!poll) poll = setInterval(refresh, POLL_MS);
    }
    function stop() {
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    }
    function onVisibility() {
      if (document.hidden) stop();
      else {
        void refresh();
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Preload the next image.
  useEffect(() => {
    if (count > 1) {
      const nextId = sequence[(pos + 1) % count]?.id;
      if (nextId) {
        const img = new Image();
        img.src = imageUrl(nextId);
      }
    }
  }, [pos, count, sequence]);

  function onSlider(value: number) {
    if (value > MAX_DURATION) {
      if (durationSec !== null) lastFinite.current = durationSec;
      setDurationSec(null);
    } else {
      setDurationSec(value);
    }
  }

  function toggleOrder() {
    setOrder((o) => {
      if (o === "chronological") {
        setSeed((s) => s + 1); // fresh shuffle each time random is entered
        return "random";
      }
      return "chronological";
    });
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
        <button type="button" onClick={toggleOrder} className={btn}>
          Reihenfolge: {order === "chronological" ? "Chronologisch" : "Zufällig"}
        </button>
        <button type="button" onClick={toggleFullscreen} className={btn}>
          Vollbild
        </button>
        <span className="text-lg text-zinc-400">
          {pos + 1} / {count}
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
