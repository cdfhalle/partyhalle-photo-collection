"use client";

import { useState } from "react";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/quiz";

export interface PhotoOption {
  id: string;
  comment: string | null;
  takenAt: number | null;
  locationName: string | null;
  people: string[];
  uploader: string | null;
}

export interface EditorInitial {
  id: string;
  photoId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  timeLimitSecs: number | null;
  points: number | null;
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function QuestionEditor({
  photos,
  action,
  initial,
  submitLabel,
}: {
  photos: PhotoOption[];
  action: (formData: FormData) => Promise<void>;
  initial?: EditorInitial;
  submitLabel: string;
}) {
  const [photoId, setPhotoId] = useState(initial?.photoId ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(
    initial?.options ?? ["", ""],
  );
  const [correctIndex, setCorrectIndex] = useState(initial?.correctIndex ?? 0);
  const [timeLimit, setTimeLimit] = useState(
    initial?.timeLimitSecs != null ? String(initial.timeLimitSecs) : "",
  );
  const [points, setPoints] = useState(initial?.points != null ? String(initial.points) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = photos.find((p) => p.id === photoId);
  const isEdit = Boolean(initial);

  const suggestions = selected
    ? [
        selected.takenAt ? dateFmt.format(selected.takenAt) : null,
        selected.locationName,
        ...selected.people,
        selected.uploader,
      ].filter((s): s is string => Boolean(s))
    : [];

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption(value = "") {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, value]));
  }
  function removeOption(i: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, idx) => idx !== i)));
    setCorrectIndex((c) => (i < c ? c - 1 : i === c ? 0 : c));
  }
  function applySuggestion(value: string) {
    const empty = options.findIndex((o) => !o.trim());
    if (empty >= 0) setOption(empty, value);
    else addOption(value);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!photoId) return setError("Bitte ein Foto auswählen.");
    if (!prompt.trim()) return setError("Bitte eine Frage eingeben.");
    const kept = options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    if (kept.length < MIN_OPTIONS) return setError("Mindestens zwei Antwortmöglichkeiten.");
    const newCorrect = kept.findIndex((x) => x.i === correctIndex);
    if (newCorrect < 0) return setError("Bitte die richtige Antwort markieren.");

    const fd = new FormData();
    if (initial?.id) fd.set("id", initial.id);
    fd.set("photoId", photoId);
    fd.set("prompt", prompt.trim());
    kept.forEach((x) => fd.append("option", x.o));
    fd.set("correctIndex", String(newCorrect));
    if (timeLimit.trim()) fd.set("timeLimitSecs", timeLimit.trim());
    if (points.trim()) fd.set("points", points.trim());

    setPending(true);
    try {
      await action(fd);
      if (!isEdit) {
        // Reset for the next question.
        setPhotoId("");
        setPrompt("");
        setOptions(["", ""]);
        setCorrectIndex(0);
        setTimeLimit("");
        setPoints("");
      }
    } finally {
      setPending(false);
    }
  }

  const field =
    "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Photo picker */}
      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">Foto</span>
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          {photos.length === 0 && (
            <p className="text-sm text-zinc-500">Noch keine Fotos hochgeladen.</p>
          )}
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhotoId(p.id)}
              aria-pressed={photoId === p.id}
              className={`overflow-hidden rounded-md ring-2 ${
                photoId === p.id ? "ring-pink-600" : "ring-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photo/${p.id}?w=200`} alt="" className="h-16 w-16 object-cover" />
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photo/${selected.id}?w=200`}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
          <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
            {selected.comment && <p>„{selected.comment}“</p>}
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-zinc-500">Vorschläge:</span>
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500">Keine Metadaten für Vorschläge.</p>
            )}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-base font-medium">Frage</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="z. B. Wo wurde dieses Foto aufgenommen?"
          className={field}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">Antwortmöglichkeiten (richtige markieren)</span>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${initial?.id ?? "new"}`}
              checked={correctIndex === i}
              onChange={() => setCorrectIndex(i)}
              aria-label={`Antwort ${i + 1} ist richtig`}
              className="h-5 w-5"
            />
            <input
              type="text"
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Antwort ${i + 1}`}
              className={`flex-1 ${field}`}
            />
            {options.length > MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="px-2 text-zinc-500 hover:text-red-600"
                aria-label="Antwort entfernen"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => addOption()}
            className="self-start text-base text-zinc-600 underline dark:text-zinc-300"
          >
            + Antwort hinzufügen
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-500">Zeit (Sek., optional)</span>
          <input
            type="number"
            min={5}
            max={120}
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            placeholder="20"
            className={`w-32 ${field}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-500">Punkte (optional)</span>
          <input
            type="number"
            min={100}
            step={100}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="1000"
            className={`w-32 ${field}`}
          />
        </label>
      </div>

      {error && <p className="text-base text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 self-start rounded-xl bg-pink-600 px-6 text-lg font-semibold text-white hover:bg-pink-700 disabled:opacity-60"
      >
        {pending ? "Speichern …" : submitLabel}
      </button>
    </form>
  );
}
