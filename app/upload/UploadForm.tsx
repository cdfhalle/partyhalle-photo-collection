"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "uploading" | "done" | "error";

interface Tag {
  name: string;
  x: number; // normalized 0-1
  y: number;
}

interface Item {
  key: string;
  file: File;
  previewUrl: string;
  comment: string;
  dateStr: string; // YYYY-MM-DD (from EXIF, editable)
  locationName: string; // city (geocoded from GPS, editable)
  lat: number | null;
  lng: number | null;
  people: Tag[];
  status: Status;
  progress?: number; // 0-1, only meaningful while status === "uploading"
  error?: string;
}

function messageFor(error: unknown, status: number): string {
  switch (error) {
    case "too_large":
      return "Das Bild ist zu groß.";
    case "not_an_image":
      return "Das ist kein gültiges Bild.";
    case "closed":
      return "Das Hochladen ist gerade nicht möglich.";
    case "full":
      return "Es wurden schon genug Fotos hochgeladen.";
    case "not_authorized":
      return "Deine Sitzung ist abgelaufen. Bitte öffne den Link erneut.";
    default:
      return status === 429
        ? "Es wurden schon genug Fotos hochgeladen."
        : "Etwas ist schiefgelaufen. Bitte versuche es noch einmal.";
  }
}

// fetch() exposes no upload progress events, so slow uploads looked stalled;
// XHR's upload.onprogress is the only way to report real progress.
function postWithProgress(
  url: string,
  body: FormData,
  onProgress: (fraction: number) => void,
): Promise<{ ok: boolean; status: number; error?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as { error?: string };
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, error: data.error });
    };
    xhr.onerror = () => reject(new Error(messageFor(undefined, 0)));
    xhr.send(body);
  });
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function UploadForm() {
  const [name, setName] = useState("");
  // Becomes true once the user has committed a non-empty name (on blur or after
  // adding files). Gates the switch away from the intro so the name field doesn't
  // vanish mid-keystroke if photos were added first.
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  // Position within the current upload run, drives the overall progress bar.
  const [run, setRun] = useState<{ index: number; total: number } | null>(null);
  // Accordion: the one card whose quiz fields are open. null (or a key that is
  // no longer pending) falls back to the top pending card, so exactly one
  // panel is open whenever photos are waiting.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // uploadAll reads items across awaits; the render-time closure would go
  // stale and drop edits made to queued photos while earlier ones upload.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  // Read EXIF date + GPS from the file and prefill; then geocode GPS to a city.
  // Best-effort: any failure just leaves the fields blank for manual entry.
  async function enrich(key: string, file: File) {
    try {
      const exifr = (await import("exifr")).default;
      const [tags, gps] = await Promise.all([
        exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null),
        exifr.gps(file).catch(() => null),
      ]);
      const when: Date | undefined = tags?.DateTimeOriginal ?? tags?.CreateDate;
      const changes: Partial<Item> = {};
      if (when instanceof Date && !Number.isNaN(when.getTime())) {
        changes.dateStr = toDateInputValue(when);
      }
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        changes.lat = gps.latitude;
        changes.lng = gps.longitude;
      }
      if (Object.keys(changes).length) patch(key, changes);

      if (changes.lat != null && changes.lng != null) {
        try {
          const res = await fetch(`/api/geocode?lat=${changes.lat}&lng=${changes.lng}`);
          if (res.ok) {
            const data = (await res.json()) as { city?: string | null };
            if (data.city) patch(key, { locationName: data.city });
          }
        } catch {
          // geocode is best-effort
        }
      }
    } catch {
      // exifr failed to load/parse — leave fields for manual entry
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      added.push({
        key: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        comment: "",
        dateStr: "",
        locationName: "",
        lat: null,
        lng: null,
        people: [],
        status: "idle",
      });
    }
    if (added.length) {
      setItems((prev) => [...prev, ...added]);
      added.forEach((it) => enrich(it.key, it.file));
      if (name.trim()) setNameConfirmed(true);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const target = prev.find((it) => it.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.key !== key);
    });
  }

  async function uploadAll() {
    setBusy(true);
    const queue = itemsRef.current.filter((it) => it.status !== "done");
    for (let i = 0; i < queue.length; i++) {
      setRun({ index: i, total: queue.length });
      const item = itemsRef.current.find((it) => it.key === queue[i].key);
      if (!item || item.status === "done") continue;
      patch(item.key, { status: "uploading", error: undefined, progress: 0 });
      try {
        const body = new FormData();
        body.set("file", item.file);
        if (item.comment.trim()) body.set("comment", item.comment.trim());
        if (name.trim()) body.set("name", name.trim());
        if (item.dateStr) {
          const ms = Date.parse(`${item.dateStr}T12:00:00`);
          if (Number.isFinite(ms)) body.set("takenAt", String(ms));
        }
        if (item.locationName.trim()) body.set("locationName", item.locationName.trim());
        if (item.lat != null) body.set("lat", String(item.lat));
        if (item.lng != null) body.set("lng", String(item.lng));
        const people = item.people.filter((p) => p.name.trim());
        if (people.length) body.set("people", JSON.stringify(people));

        const res = await postWithProgress("/api/upload", body, (fraction) =>
          patch(item.key, { progress: fraction }),
        );
        if (!res.ok) throw new Error(messageFor(res.error, res.status));
        patch(item.key, { status: "done" });
      } catch (err) {
        patch(item.key, { status: "error", error: (err as Error).message });
      }
    }
    setRun(null);
    setBusy(false);
  }

  const pending = items.filter((it) => it.status !== "done");
  const doneItems = items.filter((it) => it.status === "done");
  const activeKey = pending.find((it) => it.key === expandedKey)?.key ?? pending[0]?.key ?? null;
  const doneCount = doneItems.length;
  const allDone = items.length > 0 && pending.length === 0;
  const current = items.find((it) => it.status === "uploading");
  const overallPct = run
    ? Math.min(100, Math.round(((run.index + Math.min(1, current?.progress ?? 0)) / run.total) * 100))
    : 0;
  const trimmedName = name.trim();
  // Once we know who they are and there's a photo to describe, swap the intro for
  // the short "what to do next" note that addresses them by name.
  const detailsPhase = nameConfirmed && trimmedName !== "" && items.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      {detailsPhase ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-pink-50/70 p-5 dark:bg-pink-950/20">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Super, {trimmedName}! 🎉
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Füge unten so viele Fotos hinzu, wie du magst. Erzähl uns gerne mehr über das Bild. Neben einem kurzen Kommentar zum Beispiel {" "}
            <strong className="text-zinc-800 dark:text-zinc-100">wann</strong> und{" "}
            <strong className="text-zinc-800 dark:text-zinc-100">wo</strong> es aufgenommen wurde und{" "}
            <strong className="text-zinc-800 dark:text-zinc-100">wer</strong> darauf zu sehen ist.
            Ort und Datum sind oft schon vorausgefüllt, du kannst sie aber jederzeit ändern.
            Wenn du fertig bist, tippe einfach unten auf{" "}
            <strong className="text-zinc-800 dark:text-zinc-100">Hochladen</strong>.
          </p>
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Fotoooooooos 📸</h1>
            <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
              Hi, wir wollen die Gelegenheit nicht auslassen, für die Feier am{" "}
              <strong className="text-zinc-800 dark:text-zinc-100">12.07.</strong> ein paar schöne,
              lustige, peinliche, wundervolle, kreative … Bilder von euren gemeinsamen Erlebnissen mit Ulla und Martin einzusammeln. Abseits der
              persönlichen Belustigung von Frieda und mir (Conrad) werden die Bilder mit euren
              Kommentaren am Sonntag als Diashow zu sehen sein. Wer weiß, vielleicht gibt es ja sogar
              ein kleines Quiz. Also durchstöbert gerne nochmal eure Festplatten und teilt, was ihr
              so finden könnt.
            </p>
          </header>

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-lg font-medium">
              Dein Name <span className="text-pink-600 dark:text-pink-400">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameConfirmed(trimmedName !== "")}
              placeholder="z. B. Anna"
              className="min-h-14 rounded-xl border border-zinc-300 bg-white px-4 text-lg text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
            <p className="text-base text-zinc-500 dark:text-zinc-400">
              Sag uns kurz, wer du bist — dann wissen wir, von wem die Fotos sind.
            </p>
          </div>
        </>
      )}

      <div>
        <input
          ref={fileInput}
          id="file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="sr-only"
        />
        <label
          htmlFor="file-input"
          className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-6 text-center text-xl font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {items.length > 0 ? "Weitere Fotos auswählen" : "Fotos auswählen"}
        </label>
      </div>

      {doneItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">
            ✓ Hochgeladen ({doneItems.length})
          </h2>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {doneItems.map((item) => (
              <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                  ✓
                </span>
                {item.comment.trim() !== "" && (
                  <span
                    title={item.comment}
                    className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs"
                  >
                    💬
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-5">
          {pending.map((item, index) => {
            const locked = item.status === "uploading";
            const pct = Math.min(100, Math.round((item.progress ?? 0) * 100));
            const isTop = index === 0;
            const expanded = item.key === activeKey;
            return (
              <li
                key={item.key}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex min-h-24 flex-1 flex-col justify-between gap-2">
                    <label htmlFor={`c-${item.key}`} className="sr-only">
                      Kommentar zu diesem Foto
                    </label>
                    <input
                      id={`c-${item.key}`}
                      type="text"
                      value={item.comment}
                      onChange={(e) => patch(item.key, { comment: e.target.value })}
                      placeholder="Kommentar (freiwillig)"
                      disabled={locked}
                      className="min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-base text-black outline-none focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                      {item.status === "uploading" || item.status === "error" ? (
                        <span
                          className={
                            item.status === "error"
                              ? "text-red-600 dark:text-red-400"
                              : "text-zinc-500"
                          }
                        >
                          {item.status === "uploading" &&
                            (pct >= 100 ? "Wird verarbeitet …" : `Wird hochgeladen … ${pct} %`)}
                          {item.status === "error" && item.error}
                        </span>
                      ) : (
                        !expanded && (
                          <button
                            type="button"
                            onClick={() => setExpandedKey(item.key)}
                            aria-expanded={false}
                            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            + Quiz-Infos{" "}
                            <span className="hidden font-normal text-zinc-400 sm:inline dark:text-zinc-500">
                              (Wann? Wo? Wer?)
                            </span>
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        disabled={busy}
                        className="ml-auto rounded-md px-2 py-1 text-zinc-500 underline disabled:opacity-50"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                </div>

                {item.status === "uploading" && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-green-600 transition-[width] duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {expanded && (
                  <QuizDetails
                    item={item}
                    onPatch={(c) => patch(item.key, c)}
                    disabled={locked}
                    onCollapse={isTop ? undefined : () => setExpandedKey(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {allDone ? (
        <div role="status" className="rounded-xl bg-green-50 p-6 text-center dark:bg-green-950">
          <p className="text-2xl font-semibold text-green-800 dark:text-green-300">
            Geschafft! Danke fürs Teilen 🎉
          </p>
          <p className="mt-1 text-lg text-green-700 dark:text-green-400">
            {doneCount} {doneCount === 1 ? "Foto" : "Fotos"} hochgeladen.
          </p>
        </div>
      ) : (
        items.length > 0 && (
          <div className="flex flex-col gap-2">
            {busy && run ? (
              <div role="status" className="flex flex-col gap-2">
                <p className="text-center text-lg font-medium">
                  Foto {Math.min(run.index + 1, run.total)} von {run.total} wird hochgeladen …{" "}
                  {overallPct}&nbsp;%
                </p>
                <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-green-600 transition-[width] duration-200"
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={uploadAll}
                disabled={busy || trimmedName === ""}
                className="min-h-16 w-full rounded-xl bg-green-600 px-6 text-xl font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                Hochladen
              </button>
            )}
            {trimmedName === "" && (
              <p className="text-base text-pink-600 dark:text-pink-400">
                Bitte trag oben zuerst deinen Namen ein.
              </p>
            )}
          </div>
        )
      )}
    </main>
  );
}

function QuizDetails({
  item,
  onPatch,
  disabled,
  onCollapse,
}: {
  item: Item;
  onPatch: (changes: Partial<Item>) => void;
  disabled: boolean;
  onCollapse?: () => void;
}) {
  const field =
    "min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-base text-black outline-none focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

  function setPerson(index: number, changes: Partial<Tag>) {
    onPatch({ people: item.people.map((p, i) => (i === index ? { ...p, ...changes } : p)) });
  }
  function removePerson(index: number) {
    onPatch({ people: item.people.filter((_, i) => i !== index) });
  }

  function addTagAt(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onPatch({ people: [...item.people, { name: "", x, y }] });
  }

  return (
    <div className="mt-2 flex flex-col gap-4 rounded-xl bg-pink-50/60 p-4 dark:bg-pink-950/20">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-medium">
          Fürs Quiz 🎉 <span className="font-normal text-zinc-500">(optional)</span>
        </p>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="shrink-0 text-sm text-zinc-500 underline"
          >
            ausblenden
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Wann aufgenommen?</span>
          <input
            type="date"
            value={item.dateStr}
            onChange={(e) => onPatch({ dateStr: e.target.value })}
            disabled={disabled}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Wo? (Ort/Stadt)</span>
          <input
            type="text"
            value={item.locationName}
            onChange={(e) => onPatch({ locationName: e.target.value })}
            placeholder="z. B. Berlin"
            disabled={disabled}
            className={field}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">Wer ist auf dem Foto?</span>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {item.people.length === 0
            ? "Tippe die Personen direkt im Foto an — die Markierungen helfen uns beim Quiz."
            : "Noch jemand drauf? Tippe erneut ins Foto. Die Namen trägst du darunter ein."}
        </p>
        {/* Tap the image to drop a marker, then name the person. The dashed ring +
            pulsing hint make it obvious the photo itself is the tap target. */}
        <div
          onClick={addTagAt}
          className="relative w-full max-w-sm cursor-crosshair select-none overflow-hidden rounded-lg border-2 border-dashed border-pink-400 transition active:brightness-95 dark:border-pink-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.previewUrl} alt="" className="w-full object-contain" draggable={false} />
          {item.people.length === 0 && !disabled && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
              <span className="animate-pulse rounded-full bg-pink-600/95 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg">
                👆 Tippe auf eine Person
              </span>
            </div>
          )}
          {item.people.map((p, i) => (
            <span
              key={i}
              className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pink-600 text-sm font-bold text-white ring-2 ring-white"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
        {item.people.length > 0 && (
          <ul className="flex flex-col gap-2">
            {item.people.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => setPerson(i, { name: e.target.value })}
                  placeholder="Name"
                  disabled={disabled}
                  className={`flex-1 ${field}`}
                  autoFocus={p.name === ""}
                />
                <button
                  type="button"
                  onClick={() => removePerson(i)}
                  disabled={disabled}
                  className="rounded-md px-2 py-1 text-zinc-500 underline disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
