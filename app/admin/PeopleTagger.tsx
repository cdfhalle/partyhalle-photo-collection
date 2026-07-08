"use client";

import type { Person } from "@/lib/metadata";

// Tap-to-tag editor for the admin dialog, mirroring the upload form's
// interaction (kept separate on purpose: the upload page is live-critical and
// its tagger is wired into the upload item machinery). The image already
// carries its rotation, so new tags land in displayed space.
export function PeopleTagger({
  imageSrc,
  people,
  onChange,
  disabled,
}: {
  imageSrc: string;
  people: Person[];
  onChange: (people: Person[]) => void;
  disabled?: boolean;
}) {
  const field =
    "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-black outline-none focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

  function addTagAt(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onChange([...people, { name: "", x, y }]);
  }
  function setName(index: number, name: string) {
    onChange(people.map((p, i) => (i === index ? { ...p, name } : p)));
  }
  function remove(index: number) {
    onChange(people.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-medium">Wer ist auf dem Foto?</span>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Tippe die Personen direkt im Foto an, um sie zu markieren.
      </p>
      <div
        onClick={addTagAt}
        className="relative w-full cursor-crosshair select-none overflow-hidden rounded-lg border-2 border-dashed border-pink-400 transition active:brightness-95 dark:border-pink-700"
      >
        {/* min-h keeps the tap target alive while the image loads (or if it
            can't be decoded) — real photos are taller than this anyway. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="" className="min-h-40 w-full object-contain" draggable={false} />
        {people.map((p, i) => (
          <span
            key={i}
            className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pink-600 text-sm font-bold text-white ring-2 ring-white"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      {people.length > 0 && (
        <ul className="flex flex-col gap-2">
          {people.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <input
                type="text"
                value={p.name}
                onChange={(e) => setName(i, e.target.value)}
                placeholder="Name"
                disabled={disabled}
                className={`flex-1 ${field}`}
                autoFocus={p.name === ""}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="rounded-md px-2 py-1 text-zinc-500 underline disabled:opacity-50"
                aria-label="Markierung entfernen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
