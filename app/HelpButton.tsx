"use client";

import { useState } from "react";

// Same key the upload form persists the guest's name under — reused here so
// the help form is pre-filled for anyone who already introduced themselves.
const NAME_KEY = "pa-upload-name";

type Status = "idle" | "sending" | "sent" | "error";

// Floating help button (bottom-right on every guest page) that opens a small
// help/feedback form. Reports go to /api/feedback; no login required, so it
// also works for guests whose invite link is broken. Written for guests who
// are not comfortable with phones: a labelled button instead of a bare icon,
// plain-language copy, and big touch targets.
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, name, email, page: window.location.pathname }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  function toggle() {
    // Pre-fill the name on open (not in an effect: localStorage is client-only
    // and may hold a name the upload form saved after this component mounted).
    if (!open && !name) {
      try {
        const stored = window.localStorage.getItem(NAME_KEY);
        if (stored) setName(stored);
      } catch {
        // Private mode / blocked storage — the field just starts empty.
      }
    }
    setOpen((v) => !v);
    setStatus("idle");
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="fixed right-4 bottom-4 z-50 flex min-h-14 items-center gap-2.5 rounded-full bg-zinc-900 px-6 py-3 text-lg font-semibold text-white shadow-lg hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-current text-base font-bold"
        >
          {open ? "×" : "?"}
        </span>
        {open ? "Schließen" : "Hilfe"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Hilfe & Feedback"
          className="fixed right-4 bottom-22 left-4 z-50 ml-auto flex max-h-[calc(100dvh-7rem)] w-auto max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:left-auto sm:w-[26rem] dark:border-zinc-700 dark:bg-zinc-900"
        >
          {status === "sent" ? (
            <>
              <h2 className="text-xl font-semibold">Danke!</h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-300">
                Deine Nachricht ist angekommen — wir kümmern uns darum.
                {email.trim() ? " Wir melden uns per E-Mail bei dir." : ""}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-14 rounded-xl bg-zinc-900 px-5 py-3 text-lg font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Fenster schließen
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold">Brauchst du Hilfe?</h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-300">
                Etwas funktioniert nicht, oder du hast eine Frage? Schreib uns einfach — wir
                kümmern uns darum.
              </p>
              <label className="flex flex-col gap-1.5 text-base">
                <span className="font-medium">
                  Deine Nachricht
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  maxLength={1000}
                  rows={4}
                  placeholder="Zum Beispiel: Das Hochladen der Fotos klappt bei mir nicht."
                  className="rounded-xl border border-zinc-300 bg-transparent px-3 py-3 text-base dark:border-zinc-600"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-base">
                <span className="font-medium">
                  Dein Name{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">(freiwillig)</span>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  className="min-h-14 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-600"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-base">
                <span className="font-medium">
                  Deine E-Mail-Adresse{" "}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">(freiwillig)</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@beispiel.de"
                  className="min-h-14 rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Nur ausfüllen, wenn wir dir antworten sollen.
                </span>
              </label>
              {status === "error" && (
                <p className="text-base text-red-600 dark:text-red-400">
                  Das Senden hat leider nicht geklappt. Bitte versuche es noch einmal.
                </p>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="min-h-14 rounded-xl bg-zinc-900 px-5 py-3 text-lg font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {status === "sending" ? "Wird gesendet …" : "Nachricht absenden"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
