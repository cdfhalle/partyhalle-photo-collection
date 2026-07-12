"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logout } from "@/app/auth-actions";
import type { Person } from "@/lib/metadata";
import {
  seededShuffle,
  indexOfId,
  formatSlideMeta,
  layoutPeopleLabels,
  type SlideItem,
} from "@/lib/slideshow";

const DEFAULT_DURATION = 8;
const MIN_DURATION = 3;
const MAX_DURATION = 30;
const OFF = MAX_DURATION + 1; // slider past the max means "∞" (no autoplay)
// 30s keeps a left-open projector tab at ~120 worker requests/hour while still
// surfacing new uploads quickly enough for a live party.
const POLL_MS = 30_000;
const CONTROLS_HIDE_MS = 3500;

// `r` is a pure cache key: the immutable browser cache must miss when the
// admin rotates a photo (the route reads the rotation from D1, not the URL).
const imageUrl = (p: Pick<SlideItem, "id" | "rotation">) =>
  `/api/photo/${p.id}?w=1920&r=${p.rotation}`;

// How many upcoming slides to fetch ahead of the one on screen.
const PRELOAD_AHEAD = 3;

// URL → promise that settles once the image is fetched and decoded. Module
// scope so the cache survives re-renders; entries resolve (never reject) so a
// single broken photo can't stall the show.
const preloadCache = new Map<string, Promise<void>>();
function preload(p: Pick<SlideItem, "id" | "rotation">): Promise<void> {
  const url = imageUrl(p);
  let promise = preloadCache.get(url);
  if (!promise) {
    const img = new Image();
    img.src = url;
    promise = img.decode().then(
      () => undefined,
      () => undefined,
    );
    preloadCache.set(url, promise);
  }
  return promise;
}

type Order = "chronological" | "random";

// Metadata text scales with the viewport so it stays readable from a distance
// on big screens (beamer/TV) without dwarfing laptop windows; everything else
// in a label (line length, pill padding, dot) is em-based so it scales along.
const LABEL_FONT = "clamp(1.125rem,1.7vw,2.5rem)";

// Marker line length in em per stagger tier (see layoutPeopleLabels).
const LINE_EM = [1.3, 2.9, 4.4] as const;

/**
 * Museum-label style person annotations: a name pill connected to the face
 * point by a thin line, staggered so neighbors don't collide. The layer fades
 * out 3s after each slide change (it remounts with the keyed wrapper); while
 * `pinned` (mouse activity → controls visible) it stays put, and when the
 * controls hide again the class swap restarts the animation: another 3s, then
 * fade.
 */
function PeopleLayer({ people, pinned }: { people: Person[]; pinned: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${
        pinned ? "opacity-100 [animation:none]" : "animate-[fadeout_0.6s_ease-out_3s_forwards]"
      }`}
      style={{ fontSize: LABEL_FONT }}
    >
      {layoutPeopleLabels(people).map(({ person, tier, below }, i) => (
        <div
          key={i}
          className={`absolute flex -translate-x-1/2 items-center ${
            below ? "flex-col" : "flex-col-reverse -translate-y-full"
          }`}
          style={{ left: `${person.x * 100}%`, top: `${person.y * 100}%` }}
        >
          <span className="h-[0.22em] w-[0.22em] rounded-full bg-white/90" />
          <span className="w-px bg-white/70" style={{ height: `${LINE_EM[tier]}em` }} />
          <span className="max-w-[12em] truncate rounded-md bg-black/55 px-[0.45em] py-[0.15em] text-white">
            {person.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Slideshow({ initial, startId }: { initial: SlideItem[]; startId?: string }) {
  const [photos, setPhotos] = useState<SlideItem[]>(initial); // chronological
  const [order, setOrder] = useState<Order>("chronological");
  const [seed, setSeed] = useState(1);
  const [durationSec, setDurationSec] = useState<number | null>(DEFAULT_DURATION);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Presenter switches: `showMeta` covers the whole metadata display (people
  // labels + date/place/uploader line) — the plain comment stays visible
  // either way; `showUploader` drops just the "von …" part of the meta line.
  const [showMeta, setShowMeta] = useState(true);
  const [showUploader, setShowUploader] = useState(true);
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

  // Auto-advance unless autoplay is off (∞). The switch additionally waits for
  // the upcoming image to be decoded, so a slow connection stretches the
  // duration instead of flashing black frames.
  useEffect(() => {
    if (durationSec === null || count <= 1) return;
    let cancelled = false;
    const upcoming = sequence[(pos + 1) % count];
    const timer = setTimeout(() => {
      const ready = upcoming ? preload(upcoming) : Promise.resolve();
      void ready.then(() => {
        if (!cancelled) next();
      });
    }, durationSec * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [durationSec, count, next, pos, sequence]);

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

  // Warm the cache a few slides ahead (and one behind for "Zurück") so short
  // durations on slow connections don't outrun the network.
  useEffect(() => {
    if (count <= 1) return;
    for (let i = 1; i <= Math.min(PRELOAD_AHEAD, count - 1); i++) {
      void preload(sequence[(pos + i) % count]!);
    }
    void preload(sequence[(pos - 1 + count) % count]!);
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

  const metaLine =
    showMeta && current
      ? formatSlideMeta({
          ...current,
          uploaderName: showUploader ? current.uploaderName : null,
        })
      : null;

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-white"
      style={{ cursor: controlsVisible ? "auto" : "none" }}
      onMouseMove={showControls}
    >
      <div className="flex h-full w-full items-center justify-center">
        {current && (
          // The wrapper shrink-wraps the img, so the label layer's percentage
          // coordinates resolve against the visible image box. The img's
          // constraints are viewport-based (not %) on purpose: a percentage
          // max-width against a shrink-to-fit parent would be cyclic. Keyed by
          // photo id so the label fade-out replays on every slide change.
          <div key={current.id} className="relative animate-[fadein_0.6s_ease]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(current)}
              alt={current.comment ?? "Foto"}
              className="max-h-screen max-w-[100vw] object-contain"
            />
            {showMeta && current.people.length > 0 && (
              <PeopleLayer people={current.people} pinned={controlsVisible} />
            )}
          </div>
        )}
      </div>

      {current && (current.comment || metaLine) && (
        <div className="absolute bottom-28 left-1/2 max-w-[85vw] -translate-x-1/2 rounded-xl bg-black/60 px-6 py-3 text-center">
          {current.comment && (
            <p className="text-[clamp(1.5rem,2.4vw,3.5rem)]">{current.comment}</p>
          )}
          {metaLine && (
            <p className="text-[clamp(1rem,1.5vw,2.25rem)] text-zinc-300">{metaLine}</p>
          )}
        </div>
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
        <button type="button" onClick={() => setShowMeta((v) => !v)} className={btn}>
          Infos: {showMeta ? "An" : "Aus"}
        </button>
        <button type="button" onClick={() => setShowUploader((v) => !v)} className={btn}>
          Uploader: {showUploader ? "An" : "Aus"}
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
