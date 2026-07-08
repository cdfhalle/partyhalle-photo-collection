"use client";

import { useOptimistic, useState, useTransition } from "react";
import { rotatePhotoAction } from "./actions";

// Admin grid thumbnail with ↺/↻ overlay buttons; the image itself is the
// trigger for the edit dialog. The server rotates the actual bytes (see
// /api/photo/[id]); until the refreshed, re-rotated image has loaded, a CSS
// transform bridges the gap so every click responds instantly.
export function RotatableThumb({
  id,
  rotation,
  alt,
  onOpenEdit,
}: {
  id: string;
  rotation: number;
  alt: string;
  onOpenEdit: () => void;
}) {
  const [, startTransition] = useTransition();
  const [optimisticRotation, addDelta] = useOptimisticRotation(rotation);
  // The rotation baked into the currently *displayed* bitmap: `rotation` only
  // after the new URL finished loading, so the CSS bridge doesn't drop out
  // while the browser still shows the previous orientation.
  const [loadedRotation, setLoadedRotation] = useState(rotation);
  const cssDelta = (((optimisticRotation - loadedRotation) % 360) + 360) % 360;

  function rotate(delta: 90 | -90) {
    startTransition(async () => {
      addDelta(delta);
      await rotatePhotoAction(id, delta);
    });
  }

  const box =
    "flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-base text-white backdrop-blur-sm";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpenEdit}
        title="Foto bearbeiten"
        aria-label="Foto bearbeiten"
        className="block w-full cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/photo/${id}?w=400&r=${rotation}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedRotation(rotation)}
          className="aspect-square w-full object-cover"
          style={cssDelta ? { transform: `rotate(${cssDelta}deg)` } : undefined}
        />
      </button>
      {/* The decorative ✎ badge is pointer-events-none, so clicks on it fall
          through to the image button (the editor trigger). */}
      <span aria-hidden className={`pointer-events-none absolute left-1 top-1 ${box}`}>
        ✎
      </span>
      <div className="absolute right-1 top-1 flex gap-1">
        <button
          type="button"
          onClick={() => rotate(-90)}
          aria-label="Nach links drehen"
          className={`hover:bg-black/75 ${box}`}
        >
          ↺
        </button>
        <button
          type="button"
          onClick={() => rotate(90)}
          aria-label="Nach rechts drehen"
          className={`hover:bg-black/75 ${box}`}
        >
          ↻
        </button>
      </div>
    </div>
  );
}

// Wraps useOptimistic so queued ±90 clicks compose and the value snaps back to
// the server-confirmed rotation once the transition (and revalidate) settles.
function useOptimisticRotation(rotation: number) {
  return useOptimistic(rotation, (current: number, delta: number) => (current + delta + 360) % 360);
}
