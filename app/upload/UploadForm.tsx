"use client";

import { useRef, useState } from "react";

type Status = "idle" | "uploading" | "done" | "error";

interface Item {
  key: string;
  file: File;
  previewUrl: string;
  comment: string;
  status: Status;
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

export function UploadForm() {
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
        status: "idle",
      });
    }
    if (added.length) setItems((prev) => [...prev, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function patch(key: string, changes: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
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
    for (const item of items) {
      if (item.status === "done") continue;
      patch(item.key, { status: "uploading", error: undefined });
      try {
        const body = new FormData();
        body.set("file", item.file);
        if (item.comment.trim()) body.set("comment", item.comment.trim());
        if (name.trim()) body.set("name", name.trim());

        const res = await fetch("/api/upload", { method: "POST", body });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(messageFor(data.error, res.status));
        }
        patch(item.key, { status: "done" });
      } catch (err) {
        patch(item.key, { status: "error", error: (err as Error).message });
      }
    }
    setBusy(false);
  }

  const remaining = items.filter((it) => it.status !== "done");
  const doneCount = items.length - remaining.length;
  const allDone = items.length > 0 && remaining.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Fotos hochladen</h1>
        <p className="text-xl leading-relaxed text-zinc-600 dark:text-zinc-300">
          Wähle Fotos von deinem Gerät aus. Du kannst zu jedem Foto einen kurzen
          Kommentar schreiben. Danke fürs Teilen!
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-lg font-medium">
          Dein Name <span className="text-zinc-500">(freiwillig)</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Anna"
          className="min-h-14 rounded-xl border border-zinc-300 bg-white px-4 text-lg text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

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
          className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-6 text-xl font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Fotos auswählen
        </label>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-5">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt=""
                className="h-24 w-24 shrink-0 rounded-lg object-cover"
              />
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor={`c-${item.key}`} className="sr-only">
                  Kommentar zu diesem Foto
                </label>
                <input
                  id={`c-${item.key}`}
                  type="text"
                  value={item.comment}
                  onChange={(e) => patch(item.key, { comment: e.target.value })}
                  placeholder="Kommentar (freiwillig)"
                  disabled={item.status === "uploading" || item.status === "done"}
                  className="min-h-12 rounded-lg border border-zinc-300 bg-white px-3 text-base text-black outline-none focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <div className="flex items-center justify-between text-base">
                  <span
                    className={
                      item.status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500"
                    }
                  >
                    {item.status === "done" && "✓ Hochgeladen"}
                    {item.status === "uploading" && "Wird hochgeladen …"}
                    {item.status === "error" && item.error}
                    {item.status === "idle" && "Bereit"}
                  </span>
                  {item.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-zinc-500 underline disabled:opacity-50"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {allDone ? (
        <div
          role="status"
          className="rounded-xl bg-green-50 p-6 text-center dark:bg-green-950"
        >
          <p className="text-2xl font-semibold text-green-800 dark:text-green-300">
            Geschafft! Danke fürs Teilen 🎉
          </p>
          <p className="mt-1 text-lg text-green-700 dark:text-green-400">
            {doneCount} {doneCount === 1 ? "Foto" : "Fotos"} hochgeladen.
          </p>
        </div>
      ) : (
        items.length > 0 && (
          <button
            type="button"
            onClick={uploadAll}
            disabled={busy}
            className="min-h-16 rounded-xl bg-green-600 px-6 text-xl font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            {busy ? "Wird hochgeladen …" : "Hochladen"}
          </button>
        )
      )}
    </main>
  );
}
