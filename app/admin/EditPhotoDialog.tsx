"use client";

import { useActionState, useState } from "react";
import type { Person } from "@/lib/metadata";
import { updatePhotoAction, type UpdatePhotoState } from "./actions";
import { PeopleTagger } from "./PeopleTagger";
import { RotatableThumb } from "./RotatableThumb";

// Everything the edit dialog needs, pre-shaped in the server component so the
// client bundle never sees a raw PhotoRow.
export interface EditablePhoto {
  id: string;
  rotation: number;
  comment: string;
  takenAtDate: string; // "YYYY-MM-DD" or "" — taken_at values are noon-anchored
  locationName: string;
  people: Person[];
}

const INITIAL: UpdatePhotoState = { ok: false };

const field =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-black outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

export function EditPhotoDialog({ photo }: { photo: EditablePhoto }) {
  const [open, setOpen] = useState(false);
  // People are controlled state (the tagger mutates them); the text fields stay
  // uncontrolled — the dialog only mounts while open, so `defaultValue` picks
  // up the freshest server props on every open.
  const [people, setPeople] = useState<Person[]>(photo.people);
  // Client-side wrapper around the server action so a successful save closes
  // the dialog right where the result arrives (an effect would trip the
  // react-hooks/set-state-in-effect rule).
  const [state, formAction, pending] = useActionState(
    async (prev: UpdatePhotoState, formData: FormData) => {
      const result = await updatePhotoAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <>
      <RotatableThumb
        id={photo.id}
        rotation={photo.rotation}
        alt={photo.comment || "Foto"}
        onOpenEdit={() => {
          setPeople(photo.people);
          setOpen(true);
        }}
      />
      {open && (
        <dialog
          ref={(el) => {
            // showModal (vs. the open attribute) brings Esc-to-close, a focus
            // trap and the ::backdrop layer for free.
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            // A click on the backdrop lands on the dialog element itself.
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
          aria-label="Foto bearbeiten"
          className="m-auto w-[calc(100%-3rem)] max-w-lg rounded-2xl bg-white p-6 text-black shadow-xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-white"
        >
          <form action={formAction} className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Foto bearbeiten</h2>
            <input type="hidden" name="id" value={photo.id} />
            <input type="hidden" name="people" value={JSON.stringify(people)} />

            <label className="flex flex-col gap-1 text-base">
              <span className="font-medium">Kommentar</span>
              <textarea
                name="comment"
                defaultValue={photo.comment}
                maxLength={280}
                rows={3}
                className={field}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-base">
                <span className="font-medium">Wann aufgenommen?</span>
                <input type="date" name="takenAt" defaultValue={photo.takenAtDate} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-base">
                <span className="font-medium">Wo? (Ort/Stadt)</span>
                <input
                  type="text"
                  name="locationName"
                  defaultValue={photo.locationName}
                  maxLength={80}
                  placeholder="z. B. Berlin"
                  className={field}
                />
              </label>
            </div>

            <PeopleTagger
              imageSrc={`/api/photo/${photo.id}?w=400&r=${photo.rotation}`}
              people={people}
              onChange={setPeople}
              disabled={pending}
            />

            {state.error && (
              <p className="text-base text-red-600 dark:text-red-400">{state.error}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 flex-1 rounded-xl bg-zinc-900 px-4 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {pending ? "Speichern …" : "Speichern"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 text-base font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
